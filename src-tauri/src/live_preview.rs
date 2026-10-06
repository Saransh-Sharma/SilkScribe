//! Live text while dictating (experimental, off by default): about once a
//! second the last few seconds of speech are transcribed again and shown in
//! the recording indicator. The pasted text still comes from the full
//! transcription when recording stops.
//!
//! The cost is that the final transcription may wait for a preview that's
//! still running. `scripts/dictation-latency.ts` compares dictations with
//! previews on and off (the `partials` field of the timing log).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::managers::audio::AudioRecordingManager;
use crate::managers::transcription::TranscriptionManager;

/// How much recent speech each preview transcribes (16 kHz). Shorter means a
/// shorter wait if one is running when recording stops.
const WINDOW_SAMPLES: usize = 16_000 * 6;
/// At least this much new speech before transcribing again.
const MIN_NEW_SAMPLES: usize = 16_000;
const INTERVAL: Duration = Duration::from_secs(1);

/// The running preview's stop flag.
static RUNNING: Mutex<Option<Arc<AtomicBool>>> = Mutex::new(None);

/// Whether a preview should run for this dictation.
pub fn wanted(app: &AppHandle) -> bool {
    let settings = crate::settings::get_settings(app);
    settings.live_text_preview
        && settings.overlay_position != crate::settings::OverlayPosition::None
}

/// Starts previewing the dictation that just started recording.
pub fn start(app: &AppHandle) {
    stop();
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut running) = RUNNING.lock() {
        *running = Some(flag.clone());
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let (Some(audio), Some(engine)) = (
            app.try_state::<Arc<AudioRecordingManager>>()
                .map(|s| Arc::clone(&s)),
            app.try_state::<Arc<TranscriptionManager>>()
                .map(|s| Arc::clone(&s)),
        ) else {
            return;
        };
        let mut transcribed_up_to = 0;
        loop {
            std::thread::sleep(INTERVAL);
            if flag.load(Ordering::SeqCst) {
                break;
            }
            // Slow engines would make the final transcription wait too long.
            if !engine.is_model_loaded() || !engine.engine_is_fast() {
                continue;
            }
            let Some((total, tail)) = audio.snapshot(WINDOW_SAMPLES) else {
                break;
            };
            if total < transcribed_up_to + MIN_NEW_SAMPLES {
                continue;
            }
            transcribed_up_to = total;
            let Some(text) = engine.transcribe_partial(tail) else {
                continue;
            };
            // Recording may have stopped while it ran; don't show stale text.
            if flag.load(Ordering::SeqCst) || !audio.is_recording() {
                break;
            }
            let text = text.trim();
            if !text.is_empty() {
                if let Some(overlay) = app.get_webview_window("recording_overlay") {
                    let _ = overlay.emit("overlay-partial", text);
                }
            }
        }
    });
}

/// Stops the preview, if one is running. The final transcription takes over.
pub fn stop() {
    if let Ok(mut running) = RUNNING.lock() {
        if let Some(flag) = running.take() {
            flag.store(true, Ordering::SeqCst);
        }
    }
}
