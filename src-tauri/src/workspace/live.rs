//! Live meeting transcript.
//!
//! While a meeting records, a supervisor thread drains the aligned 16 kHz mic
//! and computer-audio samples from the capture bridge, splits each source into
//! utterances with a VAD, and queues them. A transcriber thread turns each
//! utterance into a "You" or "Others" line with the dictation engine, always
//! yielding to dictation. The full post-meeting pass later replaces these lines.

use super::capture;
use super::types::{LiveSegment, LiveSource, LiveTranscript};
use super::Workspace;
use crate::audio_toolkit::vad::{SileroVad, SmoothedVad, VadFrame, VoiceActivityDetector};
use crate::managers::model::ModelManager;
use crate::managers::transcription::TranscriptionManager;
use log::{debug, warn};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const SAMPLE_RATE: i64 = 16_000;
/// 30 ms, the frame size Silero expects at 16 kHz.
const FRAME: usize = 480;
/// Long monologues are cut here so lines keep appearing while someone talks.
const MAX_UTTERANCE: usize = 16_000 * 12;
/// Shorter blips (a cough, a click) aren't worth an inference.
const MIN_UTTERANCE: usize = 16_000 / 4;
/// When transcription falls this far behind, the oldest utterances are dropped.
const QUEUE_LIMIT: usize = 20;
const TICK: Duration = Duration::from_millis(200);
const STATUS_EVERY: Duration = Duration::from_secs(1);

pub(crate) struct Utterance {
    source: LiveSource,
    /// Position of the first sample on the recording's timeline.
    start_frame: i64,
    samples: Vec<f32>,
}

/// Splits one source's audio into utterances.
pub(crate) struct Segmenter {
    source: LiveSource,
    vad: Box<dyn VoiceActivityDetector>,
    /// Samples not yet making up a whole frame, starting at `pending_start`.
    pending: Vec<f32>,
    pending_start: i64,
    speech: Vec<f32>,
    speech_start: i64,
}

impl Segmenter {
    pub(crate) fn new(source: LiveSource, vad: Box<dyn VoiceActivityDetector>) -> Self {
        Self {
            source,
            vad,
            pending: Vec::new(),
            pending_start: 0,
            speech: Vec::new(),
            speech_start: 0,
        }
    }

    /// Feed samples that begin at `start_frame` on the recording timeline.
    pub(crate) fn push(&mut self, start_frame: i64, samples: &[f32], out: &mut Vec<Utterance>) {
        let expected = self.pending_start + self.pending.len() as i64;
        if self.pending.is_empty() || start_frame != expected {
            if start_frame != expected {
                // Samples were dropped upstream; don't join audio across the gap.
                self.flush(out);
                self.vad.reset();
            }
            self.pending.clear();
            self.pending_start = start_frame;
        }
        self.pending.extend_from_slice(samples);

        let mut offset = 0;
        while self.pending.len() - offset >= FRAME {
            let frame_end = self.pending_start + (offset + FRAME) as i64;
            let frame = &self.pending[offset..offset + FRAME];
            let close = match self.vad.push_frame(frame) {
                Ok(VadFrame::Speech(voiced)) => {
                    // The first voiced frame carries the pre-roll, so it may be
                    // longer than one frame; it always ends at this frame.
                    if self.speech.is_empty() {
                        self.speech_start = frame_end - voiced.len() as i64;
                    }
                    self.speech.extend_from_slice(voiced);
                    self.speech.len() >= MAX_UTTERANCE
                }
                Ok(VadFrame::Noise) => !self.speech.is_empty(),
                Err(e) => {
                    debug!("Live VAD failed on a frame: {e}");
                    !self.speech.is_empty()
                }
            };
            if close {
                self.close(out);
            }
            offset += FRAME;
        }
        self.pending.drain(..offset);
        self.pending_start += offset as i64;
    }

    /// End any utterance in progress, e.g. when the meeting stops.
    pub(crate) fn flush(&mut self, out: &mut Vec<Utterance>) {
        self.close(out);
    }

    fn close(&mut self, out: &mut Vec<Utterance>) {
        let samples = std::mem::take(&mut self.speech);
        if samples.len() >= MIN_UTTERANCE {
            out.push(Utterance {
                source: self.source,
                start_frame: self.speech_start,
                samples,
            });
        }
    }
}

/// Push onto a bounded queue, dropping the oldest item when full.
/// Returns whether anything was dropped.
fn push_bounded<T>(queue: &mut VecDeque<T>, item: T, limit: usize) -> bool {
    let dropped = queue.len() >= limit;
    if dropped {
        queue.pop_front();
    }
    queue.push_back(item);
    dropped
}

#[derive(Clone, Serialize)]
struct LiveSegmentEvent<'a> {
    document_id: &'a str,
    segment: &'a LiveSegment,
}

#[derive(Clone, Serialize)]
struct LiveStateEvent<'a> {
    document_id: &'a str,
    unavailable: bool,
    behind: bool,
}

struct Shared {
    document_id: String,
    language: String,
    /// Stop reading audio: drain what's left, close open utterances, and exit.
    stop: AtomicBool,
    /// Emit `meeting-status` once a second.
    polling: AtomicBool,
    /// Stop transcribing, dropping anything still queued.
    cancelled: AtomicBool,
    supervisor_done: AtomicBool,
    transcribing: AtomicBool,
    queue: Mutex<VecDeque<Utterance>>,
    wake: Condvar,
    segments: Mutex<Vec<LiveSegment>>,
    unavailable: AtomicBool,
    behind: AtomicBool,
}

impl Shared {
    fn emit_state(&self, app: &AppHandle) {
        let _ = app.emit(
            "meeting-live-state",
            LiveStateEvent {
                document_id: &self.document_id,
                unavailable: self.unavailable.load(Ordering::SeqCst),
                behind: self.behind.load(Ordering::SeqCst),
            },
        );
    }
}

pub struct LiveSession {
    shared: Arc<Shared>,
    supervisor: Option<JoinHandle<()>>,
    transcriber: Option<JoinHandle<()>>,
}

impl LiveSession {
    pub fn start(
        app: &AppHandle,
        ws: Arc<Workspace>,
        document_id: String,
        language: String,
    ) -> Self {
        let shared = Arc::new(Shared {
            document_id,
            language,
            stop: AtomicBool::new(false),
            polling: AtomicBool::new(true),
            cancelled: AtomicBool::new(false),
            supervisor_done: AtomicBool::new(false),
            transcribing: AtomicBool::new(false),
            queue: Mutex::new(VecDeque::new()),
            wake: Condvar::new(),
            segments: Mutex::new(Vec::new()),
            unavailable: AtomicBool::new(false),
            behind: AtomicBool::new(false),
        });
        let supervisor = {
            let (app, shared) = (app.clone(), shared.clone());
            thread::spawn(move || supervise(app, ws, shared))
        };
        let transcriber = {
            let (app, shared) = (app.clone(), shared.clone());
            thread::spawn(move || transcribe(app, shared))
        };
        Self {
            shared,
            supervisor: Some(supervisor),
            transcriber: Some(transcriber),
        }
    }

    pub fn snapshot(&self) -> LiveTranscript {
        LiveTranscript {
            document_id: self.shared.document_id.clone(),
            segments: self.shared.segments.lock().unwrap().clone(),
            unavailable: self.shared.unavailable.load(Ordering::SeqCst),
            behind: self.shared.behind.load(Ordering::SeqCst),
        }
    }

    /// Stop the once-a-second status check before capture is stopped: the check
    /// needs the capture lock, which the stop holds for the whole mixdown.
    pub fn stop_polling(&self) {
        self.shared.polling.store(false, Ordering::SeqCst);
    }

    /// Drop queued audio instead of transcribing it; lines made so far are kept.
    pub fn cancel_pending(&self) {
        self.shared.cancelled.store(true, Ordering::SeqCst);
        self.shared.wake.notify_all();
    }

    /// Finish after capture has stopped: transcribe what's left for up to
    /// `deadline`, then return every line in timeline order.
    pub fn finish(mut self, deadline: Duration) -> Vec<LiveSegment> {
        let shared = self.shared.clone();
        shared.polling.store(false, Ordering::SeqCst);
        shared.stop.store(true, Ordering::SeqCst);
        if let Some(handle) = self.supervisor.take() {
            let _ = handle.join();
        }
        let until = Instant::now() + deadline;
        {
            let mut queue = shared.queue.lock().unwrap();
            while (!queue.is_empty() || shared.transcribing.load(Ordering::SeqCst))
                && !shared.cancelled.load(Ordering::SeqCst)
            {
                let now = Instant::now();
                if now >= until {
                    break;
                }
                queue = shared.wake.wait_timeout(queue, until - now).unwrap().0;
            }
        }
        shared.cancelled.store(true, Ordering::SeqCst);
        shared.wake.notify_all();
        if let Some(handle) = self.transcriber.take() {
            let _ = handle.join();
        }
        let mut segments = shared.segments.lock().unwrap().clone();
        segments.sort_by(|a, b| a.start.total_cmp(&b.start));
        segments
    }
}

impl Drop for LiveSession {
    fn drop(&mut self) {
        // Not finished normally (e.g. an early error): let the threads wind down.
        self.shared.polling.store(false, Ordering::SeqCst);
        self.shared.stop.store(true, Ordering::SeqCst);
        self.shared.cancelled.store(true, Ordering::SeqCst);
        self.shared.wake.notify_all();
    }
}

fn make_vad(app: &AppHandle) -> anyhow::Result<Box<dyn VoiceActivityDetector>> {
    let path = app.path().resolve(
        "resources/models/silero_vad_v4.onnx",
        tauri::path::BaseDirectory::Resource,
    )?;
    let silero = SileroVad::new(path, 0.3)?;
    // Same smoothing as dictation: 450 ms pre-roll and hangover, 2-frame onset.
    Ok(Box::new(SmoothedVad::new(Box::new(silero), 15, 15, 2)))
}

fn supervise(app: AppHandle, ws: Arc<Workspace>, shared: Arc<Shared>) {
    let mut segmenters = match (make_vad(&app), make_vad(&app)) {
        (Ok(mic), Ok(system)) => vec![
            Segmenter::new(LiveSource::Mic, mic),
            Segmenter::new(LiveSource::System, system),
        ],
        (Err(e), _) | (_, Err(e)) => {
            warn!("Live transcript is off; the VAD couldn't start: {e}");
            shared.unavailable.store(true, Ordering::SeqCst);
            shared.emit_state(&app);
            Vec::new()
        }
    };
    let mut buffer = vec![0.0f32; SAMPLE_RATE as usize * 2];
    let mut utterances = Vec::new();
    let mut last_status: Option<Instant> = None;
    let mut last_paused: Option<bool> = None;

    loop {
        let stopping = shared.stop.load(Ordering::SeqCst);
        for segmenter in &mut segmenters {
            while let Some((start, count)) = capture::read_live(segmenter.source, &mut buffer) {
                segmenter.push(start, &buffer[..count], &mut utterances);
            }
            if stopping {
                segmenter.flush(&mut utterances);
            }
        }
        if !utterances.is_empty() {
            let mut queue = shared.queue.lock().unwrap();
            let mut dropped = false;
            for utterance in utterances.drain(..) {
                dropped |= push_bounded(&mut queue, utterance, QUEUE_LIMIT);
            }
            drop(queue);
            if dropped && !shared.behind.swap(true, Ordering::SeqCst) {
                shared.emit_state(&app);
            }
            shared.wake.notify_all();
        }
        if stopping {
            break;
        }

        if shared.polling.load(Ordering::SeqCst)
            && last_status.is_none_or(|at| at.elapsed() >= STATUS_EVERY)
        {
            last_status = Some(Instant::now());
            // Skip the tick if a pause, resume, or stop holds the capture lock.
            if let Some(Ok(status)) = capture::try_status(&ws) {
                if last_paused.is_some_and(|paused| paused != status.paused) {
                    // Capture can pause itself (e.g. a failed write).
                    crate::tray::set_tray_meeting(&app, Some(status.paused));
                }
                last_paused = Some(status.paused);
                let _ = app.emit("meeting-status", &status);
            }
        }
        thread::sleep(TICK);
    }
    shared.supervisor_done.store(true, Ordering::SeqCst);
    shared.wake.notify_all();
}

fn dictation_engine_ready(app: &AppHandle) -> bool {
    let selected = crate::settings::get_settings(app).selected_model;
    app.try_state::<Arc<ModelManager>>()
        .and_then(|models| models.get_model_info(&selected))
        .is_some_and(|model| model.is_downloaded)
}

fn transcribe(app: AppHandle, shared: Arc<Shared>) {
    let Some(manager) = app
        .try_state::<Arc<TranscriptionManager>>()
        .map(|m| m.inner().clone())
    else {
        return;
    };
    let language = (!shared.language.is_empty()).then_some(shared.language.as_str());

    loop {
        let utterance = {
            let mut queue = shared.queue.lock().unwrap();
            loop {
                if shared.cancelled.load(Ordering::SeqCst) {
                    return;
                }
                if let Some(utterance) = queue.pop_front() {
                    shared.transcribing.store(true, Ordering::SeqCst);
                    break utterance;
                }
                if shared.supervisor_done.load(Ordering::SeqCst) {
                    return;
                }
                queue = shared
                    .wake
                    .wait_timeout(queue, Duration::from_millis(250))
                    .unwrap()
                    .0;
            }
        };

        // Checked per utterance so downloading an engine mid-meeting turns it on.
        let ready = dictation_engine_ready(&app);
        if shared.unavailable.swap(!ready, Ordering::SeqCst) == ready {
            shared.emit_state(&app);
        }
        if ready {
            let start = utterance.start_frame as f64 / SAMPLE_RATE as f64;
            let end = start + utterance.samples.len() as f64 / SAMPLE_RATE as f64;
            match manager.transcribe_background(
                utterance.samples,
                None,
                language,
                &shared.cancelled,
            ) {
                Ok(Some(result)) => {
                    let text = result.text.trim();
                    if !text.is_empty() {
                        let segment = LiveSegment {
                            id: format!("{:?}-{}", utterance.source, utterance.start_frame)
                                .to_lowercase(),
                            source: utterance.source,
                            start,
                            end,
                            text: text.to_string(),
                        };
                        let _ = app.emit(
                            "meeting-live-segment",
                            LiveSegmentEvent {
                                document_id: &shared.document_id,
                                segment: &segment,
                            },
                        );
                        shared.segments.lock().unwrap().push(segment);
                    }
                }
                // A memory-heavy background job has the engine unloaded; skip.
                Ok(None) => debug!("Live transcript skipped an utterance during a heavy job"),
                Err(e) => debug!("Live transcript couldn't transcribe an utterance: {e}"),
            }
        }

        shared.transcribing.store(false, Ordering::SeqCst);
        let caught_up = shared.queue.lock().unwrap().is_empty();
        if caught_up && shared.behind.swap(false, Ordering::SeqCst) {
            shared.emit_state(&app);
        }
        shared.wake.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Anything louder than 0.5 is speech.
    struct LoudIsSpeech;
    impl VoiceActivityDetector for LoudIsSpeech {
        fn push_frame<'a>(&'a mut self, frame: &'a [f32]) -> anyhow::Result<VadFrame<'a>> {
            Ok(if frame.iter().any(|s| s.abs() > 0.5) {
                VadFrame::Speech(frame)
            } else {
                VadFrame::Noise
            })
        }
    }

    fn segmenter() -> Segmenter {
        Segmenter::new(LiveSource::Mic, Box::new(LoudIsSpeech))
    }

    fn speech(seconds: f64) -> Vec<f32> {
        vec![0.9; (seconds * SAMPLE_RATE as f64) as usize]
    }

    fn silence(seconds: f64) -> Vec<f32> {
        vec![0.0; (seconds * SAMPLE_RATE as f64) as usize]
    }

    #[test]
    fn splits_on_silence_with_timeline_positions() {
        let mut s = segmenter();
        let mut out = Vec::new();
        let audio = [speech(0.96), silence(0.48), speech(0.96), silence(0.48)].concat();
        s.push(0, &audio, &mut out);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].start_frame, 0);
        assert_eq!(out[0].samples.len(), speech(0.96).len());
        assert_eq!(out[1].start_frame, (1.44 * SAMPLE_RATE as f64) as i64);
    }

    #[test]
    fn accepts_audio_in_uneven_pieces() {
        let mut s = segmenter();
        let mut out = Vec::new();
        let audio = [speech(0.96), silence(0.48)].concat();
        let mut start = 1_000;
        for chunk in audio.chunks(333) {
            s.push(start, chunk, &mut out);
            start += chunk.len() as i64;
        }
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].start_frame, 1_000);
    }

    #[test]
    fn caps_long_speech() {
        let mut s = segmenter();
        let mut out = Vec::new();
        s.push(0, &speech(13.2), &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].samples.len(), MAX_UTTERANCE);
        s.flush(&mut out);
        assert_eq!(out.len(), 2);
        assert_eq!(out[1].start_frame, MAX_UTTERANCE as i64);
    }

    #[test]
    fn flush_keeps_trailing_speech_and_drops_blips() {
        let mut s = segmenter();
        let mut out = Vec::new();
        s.push(0, &[speech(0.12), silence(0.48)].concat(), &mut out);
        assert!(out.is_empty(), "a 120 ms blip isn't an utterance");
        s.push(9_600, &speech(0.96), &mut out);
        s.flush(&mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].start_frame, 9_600);
    }

    #[test]
    fn does_not_join_speech_across_a_gap() {
        let mut s = segmenter();
        let mut out = Vec::new();
        s.push(0, &speech(0.96), &mut out);
        s.push(160_000, &speech(0.96), &mut out);
        assert_eq!(out.len(), 1, "the speech before the gap is closed");
        assert_eq!(out[0].start_frame, 0);
        s.flush(&mut out);
        assert_eq!(out[1].start_frame, 160_000);
    }

    #[test]
    fn bounded_queue_drops_the_oldest() {
        let mut queue = VecDeque::new();
        for i in 0..3 {
            assert!(!push_bounded(&mut queue, i, 3));
        }
        assert!(push_bounded(&mut queue, 3, 3));
        assert_eq!(queue, VecDeque::from([1, 2, 3]));
    }
}
