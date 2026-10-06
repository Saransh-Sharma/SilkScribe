use super::{live::LiveSession, types::*, Workspace};
use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::sync::{Arc, TryLockError};
use std::time::Duration;
use tauri::{Emitter, Manager};
pub struct Recording {
    pub document_id: String,
    pub last_status: RecordingStatus,
}
/// How long a stopped meeting waits for its last live lines before saving.
const LIVE_FLUSH_DEADLINE: Duration = Duration::from_secs(5);
#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn ss_capture_call(json: *const std::ffi::c_char) -> *mut std::ffi::c_char;
    fn ss_capture_free(json: *mut std::ffi::c_char);
    fn ss_capture_set_mic_gate(gated: bool);
    fn ss_capture_read_live(
        source: i32,
        out: *mut f32,
        capacity: isize,
        start_frame: *mut i64,
    ) -> isize;
}
pub fn call(request: Value) -> Result<Value> {
    #[cfg(target_os = "macos")]
    {
        let input = std::ffi::CString::new(request.to_string())?;
        let value = unsafe {
            let pointer = ss_capture_call(input.as_ptr());
            if pointer.is_null() {
                bail!("Capture returned no response");
            }
            let text = std::ffi::CStr::from_ptr(pointer)
                .to_string_lossy()
                .into_owned();
            ss_capture_free(pointer);
            text
        };
        let result: Value = serde_json::from_str(&value)?;
        if request["operation"] != "status" {
            if let Some(error) = result.get("error").and_then(Value::as_str) {
                bail!("{error}");
            }
        }
        Ok(result)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        bail!("Meeting recording is Mac-only for now.")
    }
}
/// Silence the meeting's mic track while dictation records, so dictated words
/// stay out of the meeting. Safe from any thread; does nothing without a meeting.
pub fn set_mic_gate(gated: bool) {
    #[cfg(target_os = "macos")]
    unsafe {
        ss_capture_set_mic_gate(gated)
    }
    #[cfg(not(target_os = "macos"))]
    let _ = gated;
}
/// Drain aligned 16 kHz samples captured from `source` since the last read.
/// Returns the timeline frame of the first sample and the count written.
pub fn read_live(source: LiveSource, buffer: &mut [f32]) -> Option<(i64, usize)> {
    #[cfg(target_os = "macos")]
    {
        let source = match source {
            LiveSource::Mic => 0,
            LiveSource::System => 1,
        };
        let mut start = 0i64;
        let count = unsafe {
            ss_capture_read_live(
                source,
                buffer.as_mut_ptr(),
                buffer.len() as isize,
                &mut start,
            )
        };
        (count > 0).then_some((start, count as usize))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (source, buffer);
        None
    }
}
pub fn start(
    app: &tauri::AppHandle,
    ws: &Arc<Workspace>,
    options: RecordingOptions,
) -> Result<RecordingStatus> {
    let mut recording = ws.recording.lock().unwrap();
    // Dictation may be running; it coexists with meetings.
    if recording.is_some() {
        bail!("A meeting is already recording. Stop it first.");
    }
    if fs4::available_space(&ws.store.media)? < 64 * 1024 * 1024 {
        bail!("Free up disk space to keep recording.");
    }
    let mut doc = ws.create(
        if options.title.trim().is_empty() {
            "Untitled meeting".into()
        } else {
            options.title.trim().into()
        },
        Source::Meeting,
        options.options,
    )?;
    let path = ws.store.media.join(format!("{}.wav", doc.id));
    doc.audio_path = Some(path.to_string_lossy().into());
    doc.stage = Stage::Recording;
    ws.store.put(&doc)?;
    // Reserve the meeting slot before crossing the native bridge.
    *recording = Some(Recording {
        document_id: doc.id.clone(),
        last_status: RecordingStatus::default(),
    });
    let result = call(
        json!({"operation":"start","path":path,"system":options.system_audio,"device":options.microphone_id}),
    );
    if let Err(e) = result {
        *recording = None;
        doc.stage = Stage::Failed;
        doc.error = Some(e.to_string());
        ws.store.put(&doc)?;
        return Err(e);
    }
    drop(recording);
    begin_meeting(app, ws, &doc);
    ws.emit(app);
    status(ws)
}
/// Marks a meeting as live: dictation checks this to leave the call audio alone,
/// the tray shows the meeting controls, and the orb and live transcript start.
fn begin_meeting(app: &tauri::AppHandle, ws: &Arc<Workspace>, doc: &Document) {
    ws.meeting_active.store(true, Ordering::SeqCst);
    crate::tray::set_tray_meeting(app, Some(false));
    let session = LiveSession::start(
        app,
        ws.clone(),
        doc.id.clone(),
        super::language_code(&doc.options.language).to_string(),
    );
    *ws.live.lock().unwrap() = Some(session);
    crate::meeting_orb::show(app, &doc.id, &doc.title);
}
/// Clears live-meeting state. Runs on every way a meeting ends, including failures.
fn end_meeting(app: &tauri::AppHandle, ws: &Arc<Workspace>) {
    ws.meeting_active.store(false, Ordering::SeqCst);
    crate::tray::set_tray_meeting(app, None);
    crate::meeting_orb::hide(app);
    let _ = app.emit("meeting-status", RecordingStatus::default());
    if let Some(manager) =
        app.try_state::<Arc<crate::managers::transcription::TranscriptionManager>>()
    {
        manager.maybe_unload_immediately("meeting ended");
    }
}
/// Stop transcribing queued audio, keeping the lines already made, so stopping
/// the meeting doesn't wait for them (e.g. on quit).
pub fn abandon_live_transcript(ws: &Workspace) {
    if let Some(session) = ws.live.lock().unwrap().as_ref() {
        session.cancel_pending();
    }
}
pub fn status(ws: &Workspace) -> Result<RecordingStatus> {
    let mut recording = ws.recording.lock().unwrap();
    status_locked(&mut recording)
}
/// Like [`status`], but returns `None` instead of waiting when a pause, resume,
/// or stop holds the capture lock (a stop holds it for the whole mixdown).
pub fn try_status(ws: &Workspace) -> Option<Result<RecordingStatus>> {
    match ws.recording.try_lock() {
        Ok(mut recording) => Some(status_locked(&mut recording)),
        Err(TryLockError::Poisoned(e)) => Some(status_locked(&mut e.into_inner())),
        Err(TryLockError::WouldBlock) => None,
    }
}
fn status_locked(recording: &mut Option<Recording>) -> Result<RecordingStatus> {
    let Some(r) = recording.as_mut() else {
        return Ok(RecordingStatus::default());
    };
    match call(json!({"operation":"status"})) {
        Ok(v) => {
            r.last_status = RecordingStatus {
                document_id: Some(r.document_id.clone()),
                paused: v["paused"].as_bool().unwrap_or(r.last_status.paused),
                seconds: v["seconds"].as_f64().unwrap_or(r.last_status.seconds),
                microphone_level: v["microphone_level"].as_f64().unwrap_or(0.0),
                system_level: v["system_level"].as_f64().unwrap_or(0.0),
                error: v["error"].as_str().map(String::from),
                mic_gated: v["mic_gated"].as_bool().unwrap_or(false),
            }
        }
        Err(e) => {
            r.last_status.error = Some(e.to_string());
            r.last_status.document_id = Some(r.document_id.clone());
        }
    }
    Ok(r.last_status.clone())
}
pub fn control(
    app: &tauri::AppHandle,
    ws: &Arc<Workspace>,
    operation: &str,
) -> Result<RecordingStatus> {
    if !["pause", "resume", "stop", "save"].contains(&operation) {
        bail!("Unknown recording operation");
    }
    if operation == "resume" && fs4::available_space(&ws.store.media)? < 64 * 1024 * 1024 {
        bail!("Free up disk space to keep recording.");
    }
    let stopping = matches!(operation, "stop" | "save");
    // Take the live session before locking capture: its status check needs that
    // lock, and a stop holds it through the whole mixdown.
    let live = if stopping {
        let session = ws.live.lock().unwrap().take();
        if let Some(session) = &session {
            session.stop_polling();
        }
        crate::meeting_orb::set_finishing(app);
        session
    } else {
        None
    };
    let mut recording = ws.recording.lock().unwrap();
    let Some(r) = recording.as_ref() else {
        if stopping {
            drop(recording);
            end_meeting(app, ws);
            return Ok(RecordingStatus::default());
        }
        bail!("No meeting is recording.");
    };
    let mut doc = match ws.store.get(&r.document_id) {
        Ok(doc) => doc,
        Err(e) => {
            if stopping {
                // Put the session back so a retry can still stop it cleanly.
                *ws.live.lock().unwrap() = live;
            }
            return Err(e);
        }
    };
    // Capture has stopped once this returns, so the live ring holds every sample.
    let stopped = call(json!({"operation":if operation=="save" {"stop"} else {operation}}));
    if stopping {
        doc.live_segments = live
            .map(|session| session.finish(LIVE_FLUSH_DEADLINE))
            .unwrap_or_default();
    }
    if let Err(error) = stopped {
        if stopping {
            doc.duration = doc.duration.max(r.last_status.seconds);
            *recording = None;
            doc.stage = Stage::Interrupted;
            doc.failed_stage = Some(Stage::Recording);
            doc.error = Some(format!("Audio finalization needs recovery: {error}"));
            ws.store.put_processed(&doc)?;
            drop(recording);
            end_meeting(app, ws);
            ws.emit(app);
        }
        return Err(error);
    }
    let can_process = operation == "stop"
        && super::readiness::assess(app, &doc.options)
            .map(|assessment| assessment.can_process)
            .unwrap_or(false);
    doc.duration = doc
        .audio_path
        .as_ref()
        .and_then(|path| hound::WavReader::open(path).ok())
        .map(|reader| reader.duration() as f64 / reader.spec().sample_rate as f64)
        .unwrap_or(r.last_status.seconds);
    doc.stage = match operation {
        "pause" => Stage::Paused,
        "resume" => Stage::Recording,
        "save" => Stage::Interrupted,
        _ if can_process => Stage::Queued,
        _ => Stage::Interrupted,
    };
    if matches!(operation, "pause" | "resume") {
        // Keep the cached state current so the tray shows Pause or Resume.
        if let Some(r) = recording.as_mut() {
            r.last_status.paused = operation == "pause";
        }
    }
    if stopping {
        if operation == "save" || !can_process {
            doc.error = Some("Recording saved. Choose how to process it when you're ready.".into());
        }
        *recording = None;
    }
    // One write carries both the final stage and the live lines: the queue may
    // pick the document up as soon as it's Queued and re-save its own copy.
    ws.store.put_processed(&doc)?;
    drop(recording);
    if stopping {
        end_meeting(app, ws);
    } else {
        crate::tray::set_tray_meeting(app, Some(operation == "pause"));
    }
    ws.emit(app);
    if operation == "stop" && can_process {
        ws.start_queue(app.clone());
    }
    status(ws)
}

/// Recover incremental microphone/system tracks after a process interruption.
pub fn recover_audio(path: &std::path::Path) -> Result<()> {
    use std::io::Read;
    let open_track = |suffix: &str| -> Result<Option<Box<dyn Read>>> {
        let track = std::path::PathBuf::from(format!("{}{suffix}", path.display()));
        if !track.exists() {
            return Ok(None);
        }
        let reader = hound::WavReader::open(track)?;
        let spec = reader.spec();
        if spec.channels != 1
            || spec.sample_rate != 16000
            || spec.bits_per_sample != 32
            || spec.sample_format != hound::SampleFormat::Float
        {
            bail!("Recovery track has an unsupported format");
        }
        let remaining = reader.duration() as u64 * 4;
        let source = std::io::BufReader::new(reader.into_inner());
        // A crashed writer can leave an unfinalized zero-length data header.
        if remaining > 0 {
            Ok(Some(Box::new(source.take(remaining))))
        } else {
            Ok(Some(Box::new(source)))
        }
    };
    let mut mic = open_track(".mic.wav")?;
    let mut system = open_track(".system.wav")?;
    if mic.is_none() && system.is_none() {
        bail!("No recoverable recording tracks were found");
    }
    let temporary = path.with_extension("recovering.wav");
    let mut writer = hound::WavWriter::create(
        &temporary,
        hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        },
    )?;
    let sample = |track: &mut Option<Box<dyn Read>>| -> Result<Option<f32>> {
        if let Some(source) = track {
            let mut bytes = [0u8; 4];
            match source.read_exact(&mut bytes) {
                Ok(()) => {
                    let value = f32::from_le_bytes(bytes);
                    if !value.is_finite() {
                        bail!("Recovery track contains invalid audio samples");
                    }
                    return Ok(Some(value));
                }
                Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => {}
                Err(e) => return Err(e.into()),
            }
        }
        Ok(None)
    };
    let mut count = 0;
    loop {
        let a = sample(&mut mic)?;
        let b = sample(&mut system)?;
        if a.is_none() && b.is_none() {
            break;
        }
        writer.write_sample((a.unwrap_or(0.0) + b.unwrap_or(0.0)).clamp(-1.0, 1.0))?;
        count += 1;
    }
    writer.finalize()?;
    if count == 0 {
        bail!("The interrupted recording contains no saved audio");
    }
    // Flush repaired audio before replacing the destination. Source tracks stay
    // available if writing, finalization or the atomic rename fails.
    std::fs::File::open(&temporary)?.sync_all()?;
    std::fs::rename(temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn track(path: &std::path::Path, suffix: &str, samples: &[f32], unfinished: bool) {
        let file = std::path::PathBuf::from(format!("{}{suffix}", path.display()));
        let mut writer = hound::WavWriter::create(
            &file,
            hound::WavSpec {
                channels: 1,
                sample_rate: 16000,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            },
        )
        .unwrap();
        for sample in samples {
            writer.write_sample(*sample).unwrap();
        }
        writer.finalize().unwrap();
        if unfinished {
            let mut bytes = std::fs::read(&file).unwrap();
            let at = bytes.windows(4).position(|value| value == b"data").unwrap();
            bytes[at + 4..at + 8].copy_from_slice(&[0u8; 4]);
            std::fs::write(&file, bytes).unwrap();
        }
    }
    #[test]
    fn recovery_preserves_longer_source_and_unfinished_header() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("meeting.wav");
        track(&path, ".mic.wav", &[0.3, 0.8, 0.4], true);
        track(&path, ".system.wav", &[0.2, 0.9], false);
        recover_audio(&path).unwrap();
        let mut reader = hound::WavReader::open(&path).unwrap();
        let values: Vec<f32> = reader.samples().map(Result::unwrap).collect();
        assert_eq!(values, vec![0.5, 1.0, 0.4]);
        recover_audio(&path).unwrap(); // retry finalization is safe and repeatable
        assert_eq!(hound::WavReader::open(path).unwrap().duration(), 3);
    }
    #[test]
    fn recovery_supports_microphone_only_and_rejects_empty_tracks() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("meeting.wav");
        assert!(recover_audio(&path).is_err());
        track(&path, ".mic.wav", &[], false);
        assert!(recover_audio(&path).is_err());
        track(&path, ".mic.wav", &[0.4], false);
        recover_audio(&path).unwrap();
        assert_eq!(hound::WavReader::open(path).unwrap().duration(), 1);
    }
    #[test]
    fn failed_recovery_preserves_existing_audio_and_source_tracks() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("meeting.wav");
        track(&path, ".mic.wav", &[0.4], false);
        recover_audio(&path).unwrap();
        let previous = std::fs::read(&path).unwrap();
        track(&path, ".mic.wav", &[0.2, f32::NAN], false);
        assert!(recover_audio(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), previous);
        assert!(dir.path().join("meeting.wav.mic.wav").exists());
    }
}
