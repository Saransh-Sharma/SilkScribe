use crate::audio_feedback::{play_feedback_sound, play_feedback_sound_blocking, SoundType};
use crate::dictation::{finish_dictation, CleanupOutcome};
use crate::managers::audio::AudioRecordingManager;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::get_settings;
use crate::shortcut;
use crate::tray::{change_tray_icon, TrayIconState};
use crate::utils::{
    self, show_empty_overlay, show_error_overlay_with_reason, show_processing_overlay,
    show_recording_overlay, show_success_overlay_with_notice, show_success_overlay_with_preview,
    show_transcribing_overlay,
};
use crate::TranscriptionCoordinator;
use log::{debug, error};
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Drop guard that notifies the [`TranscriptionCoordinator`] when the
/// transcription pipeline finishes — whether it completes normally or panics.
struct FinishGuard(AppHandle);
impl Drop for FinishGuard {
    fn drop(&mut self) {
        if let Some(c) = self.0.try_state::<TranscriptionCoordinator>() {
            c.notify_processing_finished();
        }
    }
}

fn handle_recording_start_failure(app: &AppHandle) {
    change_tray_icon(app, TrayIconState::Idle);
    show_error_overlay_with_reason(app, "recordingFailed");
    play_feedback_sound(app, SoundType::Error);
    utils::hide_recording_overlay_after(app, 1600);
}

pub(crate) struct ProcessedTranscription {
    pub post_processed_text: Option<String>,
    pub post_process_prompt: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PasteFailedPayload {
    code: PasteFailureCode,
    copied_to_clipboard: bool,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
enum PasteFailureCode {
    Copied,
    CopyFailed,
}

// Shortcut Action Trait
pub trait ShortcutAction: Send + Sync {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str);
}

// Transcribe Action
struct TranscribeAction {
    post_process: bool,
}

pub(crate) async fn process_transcription_output(
    app: &AppHandle,
    transcription: &str,
    post_process: bool,
) -> ProcessedTranscription {
    let settings = get_settings(app);
    let finished = finish_dictation(&settings, transcription, post_process).await;
    ProcessedTranscription {
        post_processed_text: finished.cleaned,
        post_process_prompt: finished.prompt,
    }
}

/// One line per dictation for `scripts/dictation-latency.ts`. Each time is
/// measured from releasing the shortcut.
fn log_dictation_timing(
    engine: &str,
    cleanup: &CleanupOutcome,
    audio_ms: usize,
    stopped: Duration,
    transcribed: Duration,
    text_ready: Duration,
    pasted: Duration,
) {
    log::info!(
        target: "dictation_timing",
        "engine={engine} cleanup={cleanup:?} audio_ms={audio_ms} stop_ms={} asr_ms={} text_ms={} paste_ms={} total_ms={}",
        stopped.as_millis(),
        transcribed.as_millis(),
        text_ready.as_millis(),
        pasted.as_millis(),
        pasted.as_millis(),
    );
}

impl ShortcutAction for TranscribeAction {
    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let start_time = Instant::now();
        debug!("TranscribeAction::start called for binding: {}", binding_id);

        // Load model in the background
        let tm = app.state::<Arc<TranscriptionManager>>();
        tm.initiate_model_load();

        let binding_id = binding_id.to_string();
        change_tray_icon(app, TrayIconState::Recording);
        show_recording_overlay(app);

        let rm = app.state::<Arc<AudioRecordingManager>>();

        // Get the microphone mode to determine audio feedback timing
        let settings = get_settings(app);
        let is_always_on = settings.always_on_microphone;
        debug!("Microphone mode - always_on: {}", is_always_on);

        let mut recording_started = false;
        if is_always_on {
            // Always-on mode: Play audio feedback immediately, then apply mute after sound finishes
            debug!("Always-on mode: Playing audio feedback immediately");
            let rm_clone = Arc::clone(&rm);
            let app_clone = app.clone();
            // The blocking helper exits immediately if audio feedback is disabled,
            // so we can always reuse this thread to ensure mute happens right after playback.
            std::thread::spawn(move || {
                play_feedback_sound_blocking(&app_clone, SoundType::Start);
                rm_clone.apply_mute();
            });

            recording_started = rm.try_start_recording(&binding_id);
            debug!("Recording started: {}", recording_started);
            if !recording_started {
                handle_recording_start_failure(app);
            }
        } else {
            // On-demand mode: Start recording first, then play audio feedback, then apply mute
            // This allows the microphone to be activated before playing the sound
            debug!("On-demand mode: Starting recording first, then audio feedback");
            let recording_start_time = Instant::now();
            if rm.try_start_recording(&binding_id) {
                recording_started = true;
                debug!("Recording started in {:?}", recording_start_time.elapsed());
                // Small delay to ensure microphone stream is active
                let app_clone = app.clone();
                let rm_clone = Arc::clone(&rm);
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    debug!("Handling delayed audio feedback/mute sequence");
                    // Helper handles disabled audio feedback by returning early, so we reuse it
                    // to keep mute sequencing consistent in every mode.
                    play_feedback_sound_blocking(&app_clone, SoundType::Start);
                    rm_clone.apply_mute();
                });
            } else {
                debug!("Failed to start recording");
                handle_recording_start_failure(app);
            }
        }

        if recording_started {
            // Dynamically register the cancel shortcut in a separate task to avoid deadlock
            shortcut::register_cancel_shortcut(app);
        }

        debug!(
            "TranscribeAction::start completed in {:?}",
            start_time.elapsed()
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        // Unregister the cancel shortcut when transcription stops
        shortcut::unregister_cancel_shortcut(app);

        let stop_time = Instant::now();
        debug!("TranscribeAction::stop called for binding: {}", binding_id);

        let ah = app.clone();
        let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
        let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());
        let hm = Arc::clone(&app.state::<Arc<HistoryManager>>());

        change_tray_icon(app, TrayIconState::Transcribing);
        show_transcribing_overlay(app);

        // Unmute before playing audio feedback so the stop sound is audible
        rm.remove_mute();

        // Fires at the moment the pipeline takes the audio, so this is the
        // "transcribing" cue (it was named `stop` before the cue set grew).
        play_feedback_sound(app, SoundType::Transcribing);

        let binding_id = binding_id.to_string(); // Clone binding_id for the async task
        let post_process = self.post_process;

        tauri::async_runtime::spawn(async move {
            // Signals the coordinator when this dictation is fully done. It moves
            // into the paste closure below so a dictation queued behind this one
            // can't start until the text has landed.
            let finish_guard = FinishGuard(ah.clone());
            let binding_id = binding_id.clone(); // Clone for the inner async task
            debug!(
                "Starting async transcription task for binding: {}",
                binding_id
            );

            let stop_recording_time = Instant::now();
            if let Some(samples) = rm.stop_recording(&binding_id) {
                let stopped = stop_time.elapsed();
                // Recordings are 16 kHz mono.
                let audio_ms = samples.len() / 16;
                debug!(
                    "Recording stopped and samples retrieved in {:?}, sample count: {}",
                    stop_recording_time.elapsed(),
                    samples.len()
                );

                let transcription_time = Instant::now();
                let samples_clone = samples.clone(); // Clone for history saving
                match tm.transcribe(samples) {
                    Ok(transcription) => {
                        let transcribed = stop_time.elapsed();
                        debug!(
                            "Transcription completed in {:?}: '{}'",
                            transcription_time.elapsed(),
                            transcription
                        );
                        if !transcription.is_empty() {
                            let settings = get_settings(&ah);
                            if post_process {
                                show_processing_overlay(&ah);
                            }
                            let finished =
                                finish_dictation(&settings, &transcription, post_process).await;
                            let text_ready = stop_time.elapsed();
                            // The raw text still goes in, but the user asked for
                            // cleanup and should know they didn't get it.
                            let cleanup_skipped = finished.cleanup.missed();
                            let cleanup_outcome = finished.cleanup;
                            let post_processed_text = finished.cleaned;
                            let post_process_prompt = finished.prompt;
                            let final_text = finished.delivered;
                            let engine = tm.get_current_model().unwrap_or_default();

                            // Save to history with post-processed text and prompt
                            let hm_clone = Arc::clone(&hm);
                            let transcription_for_history = transcription.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = hm_clone
                                    .save_transcription(
                                        samples_clone,
                                        transcription_for_history,
                                        post_process,
                                        post_processed_text,
                                        post_process_prompt,
                                    )
                                    .await
                                {
                                    error!("Failed to save transcription to history: {}", e);
                                }
                            });

                            // Paste the final text (either processed or original)
                            let ah_clone = ah.clone();
                            let paste_text = final_text.clone();
                            let paste_time = Instant::now();
                            ah.run_on_main_thread(move || {
                                let _finish_guard = finish_guard;
                                match utils::paste(final_text, ah_clone.clone()) {
                                    Ok(()) => {
                                        debug!(
                                            "Text pasted successfully in {:?}",
                                            paste_time.elapsed()
                                        );
                                        if cleanup_skipped {
                                            show_success_overlay_with_notice(
                                                &ah_clone,
                                                "cleanupSkipped",
                                            );
                                        } else {
                                            show_success_overlay_with_preview(
                                                &ah_clone,
                                                &paste_text,
                                            );
                                        }
                                        play_feedback_sound(&ah_clone, SoundType::Done);
                                        log_dictation_timing(
                                            &engine,
                                            &cleanup_outcome,
                                            audio_ms,
                                            stopped,
                                            transcribed,
                                            text_ready,
                                            stop_time.elapsed(),
                                        );
                                        // A notice needs a beat longer to read than an excerpt.
                                        utils::hide_recording_overlay_after(
                                            &ah_clone,
                                            if cleanup_skipped { 2500 } else { 1500 },
                                        );
                                    }
                                    Err(e) => {
                                        error!("Failed to paste transcription: {}", e);
                                        let copied_to_clipboard = match ah_clone
                                            .clipboard()
                                            .write_text(&paste_text)
                                        {
                                            Ok(()) => true,
                                            Err(copy_error) => {
                                                error!(
                                                    "Failed to copy transcription fallback to clipboard: {}",
                                                    copy_error
                                                );
                                                false
                                            }
                                        };
                                        let code = if copied_to_clipboard {
                                            PasteFailureCode::Copied
                                        } else {
                                            PasteFailureCode::CopyFailed
                                        };
                                        let _ = ah_clone.emit(
                                            "transcription-paste-failed",
                                            PasteFailedPayload {
                                                code,
                                                copied_to_clipboard,
                                            },
                                        );
                                        show_error_overlay_with_reason(
                                            &ah_clone,
                                            if copied_to_clipboard {
                                                "pasteCopied"
                                            } else {
                                                "pasteFailed"
                                            },
                                        );
                                        play_feedback_sound(&ah_clone, SoundType::Error);
                                        utils::hide_recording_overlay_after(&ah_clone, 2000);
                                    }
                                }
                                change_tray_icon(&ah_clone, TrayIconState::Idle);
                            })
                            .unwrap_or_else(|e| {
                                error!("Failed to run paste on main thread: {:?}", e);
                                show_error_overlay_with_reason(&ah, "pasteFailed");
                                play_feedback_sound(&ah, SoundType::Error);
                                utils::hide_recording_overlay_after(&ah, 1800);
                                change_tray_icon(&ah, TrayIconState::Idle);
                            });
                        } else {
                            // Nothing came back. This used to vanish silently, which
                            // left the user unsure whether they had been heard.
                            show_empty_overlay(&ah);
                            play_feedback_sound(&ah, SoundType::Cancel);
                            utils::hide_recording_overlay_after(&ah, 1600);
                            change_tray_icon(&ah, TrayIconState::Idle);
                        }
                    }
                    Err(err) => {
                        debug!("Global Shortcut Transcription error: {}", err);
                        if let Err(e) = hm
                            .save_transcription(
                                samples_clone,
                                String::new(),
                                post_process,
                                None,
                                None,
                            )
                            .await
                        {
                            error!("Failed to save failed transcription to history: {}", e);
                        }
                        show_error_overlay_with_reason(&ah, "transcriptionFailed");
                        play_feedback_sound(&ah, SoundType::Error);
                        utils::hide_recording_overlay_after(&ah, 2000);
                        change_tray_icon(&ah, TrayIconState::Idle);
                    }
                }
            } else {
                debug!("No samples retrieved from recording stop");
                show_empty_overlay(&ah);
                play_feedback_sound(&ah, SoundType::Cancel);
                utils::hide_recording_overlay_after(&ah, 1600);
                change_tray_icon(&ah, TrayIconState::Idle);
            }
        });

        debug!(
            "TranscribeAction::stop completed in {:?}",
            stop_time.elapsed()
        );
    }
}

// Cancel Action
struct CancelAction;

impl ShortcutAction for CancelAction {
    fn start(&self, app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        utils::cancel_current_operation(app);
    }

    fn stop(&self, _app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        // Nothing to do on stop for cancel
    }
}

// Test Action
struct TestAction;

impl ShortcutAction for TestAction {
    fn start(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Started - {} (App: {})", // Changed "Pressed" to "Started" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, shortcut_str: &str) {
        log::info!(
            "Shortcut ID '{}': Stopped - {} (App: {})", // Changed "Released" to "Stopped" for consistency
            binding_id,
            shortcut_str,
            app.package_info().name
        );
    }
}

// Static Action Map
pub static ACTION_MAP: Lazy<HashMap<String, Arc<dyn ShortcutAction>>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(
        "transcribe".to_string(),
        Arc::new(TranscribeAction {
            post_process: false,
        }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "transcribe_with_post_process".to_string(),
        Arc::new(TranscribeAction { post_process: true }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "cancel".to_string(),
        Arc::new(CancelAction) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "test".to_string(),
        Arc::new(TestAction) as Arc<dyn ShortcutAction>,
    );
    map
});
