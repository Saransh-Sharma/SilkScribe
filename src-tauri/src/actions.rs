use crate::audio_feedback::{play_feedback_sound, play_feedback_sound_blocking, SoundType};
use crate::dictation::{finish_dictation, CleanupOutcome, CommandOutcome};
use crate::managers::audio::AudioRecordingManager;
use crate::managers::history::HistoryManager;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::get_settings;
use crate::shortcut;
use crate::tray::{change_tray_icon, TrayIconState};
use crate::utils::{
    self, show_command_processing_overlay, show_command_recording_overlay, show_empty_overlay,
    show_error_overlay_with_reason, show_locked_recording_overlay, show_processing_overlay,
    show_processing_overlay_for, show_recording_overlay, show_success_overlay_with_notice,
    show_success_overlay_with_preview, show_transcribing_overlay,
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
    /// A tap turned the recording hands-free; the next press stops it.
    fn lock(&self, _app: &AppHandle) {}
}

// Transcribe Action
struct TranscribeAction {
    /// The "Dictate with AI cleanup" shortcut always cleans up; the main one
    /// follows the "Clean up every dictation" setting.
    always_clean_up: bool,
}

pub(crate) async fn process_transcription_output(
    app: &AppHandle,
    transcription: &str,
    post_process: bool,
) -> ProcessedTranscription {
    let settings = get_settings(app);
    let finished = finish_dictation(&settings, transcription, post_process, None).await;
    ProcessedTranscription {
        post_processed_text: finished.cleaned,
        post_process_prompt: finished.prompt,
    }
}

/// The style shown in the recording indicator while cleanup runs: the tone,
/// or what code and AI-chat targets do instead.
fn target_style_code(target: &crate::app_context::DictationTarget) -> &'static str {
    use crate::app_context::{AppCategory, DictationStyle};
    match (target.category, target.style) {
        (AppCategory::Code, _) => "code",
        (AppCategory::AiChat, _) => "ai_chat",
        (_, DictationStyle::Casual) => "casual",
        (_, DictationStyle::Neutral) => "neutral",
        (_, DictationStyle::Formal) => "formal",
    }
}

/// One line per dictation for `scripts/dictation-latency.ts`. Each time is
/// measured from releasing the shortcut.
fn log_dictation_timing(
    engine: &str,
    partials: bool,
    cleanup: &CleanupOutcome,
    audio_ms: usize,
    stopped: Duration,
    transcribed: Duration,
    text_ready: Duration,
    pasted: Duration,
) {
    log::info!(
        target: "dictation_timing",
        "engine={engine} partials={} cleanup={cleanup:?} audio_ms={audio_ms} stop_ms={} asr_ms={} text_ms={} paste_ms={} total_ms={}",
        if partials { "on" } else { "off" },
        stopped.as_millis(),
        transcribed.as_millis(),
        text_ready.as_millis(),
        pasted.as_millis(),
        pasted.as_millis(),
    );
}

/// The text couldn't be pasted: copy it instead, and say which happened.
fn report_paste_failure(app: &AppHandle, text: &str) {
    let copied_to_clipboard = match app.clipboard().write_text(text) {
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
    let _ = app.emit(
        "transcription-paste-failed",
        PasteFailedPayload {
            code,
            copied_to_clipboard,
        },
    );
    show_error_overlay_with_reason(
        app,
        if copied_to_clipboard {
            "pasteCopied"
        } else {
            "pasteFailed"
        },
    );
    play_feedback_sound(app, SoundType::Error);
    utils::hide_recording_overlay_after(app, 2000);
}

/// Ends a shortcut with an error the overlay explains. `code` is a key suffix
/// under `overlay.detail.*`.
fn finish_with_error(app: &AppHandle, code: &str) {
    show_error_overlay_with_reason(app, code);
    play_feedback_sound(app, SoundType::Error);
    utils::hide_recording_overlay_after(app, 2500);
    change_tray_icon(app, TrayIconState::Idle);
}

/// Opens the mic for a shortcut, with the start sound and mute timed to the
/// microphone mode, and arms the cancel shortcut. Returns whether recording
/// started; on failure the user has already been told.
fn begin_recording(app: &AppHandle, binding_id: &str) -> bool {
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

        recording_started = rm.try_start_recording(binding_id);
        debug!("Recording started: {}", recording_started);
        if !recording_started {
            handle_recording_start_failure(app);
        }
    } else {
        // On-demand mode: Start recording first, then play audio feedback, then apply mute
        // This allows the microphone to be activated before playing the sound
        debug!("On-demand mode: Starting recording first, then audio feedback");
        let recording_start_time = Instant::now();
        if rm.try_start_recording(binding_id) {
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

    recording_started
}

impl ShortcutAction for TranscribeAction {
    fn lock(&self, app: &AppHandle) {
        show_locked_recording_overlay(app, false);
    }

    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        let start_time = Instant::now();
        debug!("TranscribeAction::start called for binding: {}", binding_id);

        // The target app still has focus: note it before anything else can
        // take it, for per-app styles and history.
        crate::app_context::remember_target_app();

        // Load model in the background
        let tm = app.state::<Arc<TranscriptionManager>>();
        tm.initiate_model_load();

        let binding_id = binding_id.to_string();
        change_tray_icon(app, TrayIconState::Recording);
        show_recording_overlay(app);

        let recording_started = begin_recording(app, &binding_id);
        if recording_started && crate::live_preview::wanted(app) {
            crate::live_preview::start(app);
        }

        // Read the text around the cursor now that recording is under way, so
        // a slow app can't delay the mic. Only when cleanup could use it.
        let wants_context = {
            let settings = get_settings(app);
            recording_started
                && settings.post_process_enabled
                && crate::text_context::context_allowed(&settings)
        };
        crate::text_context::remember_focused_text(if wants_context {
            crate::text_context::read_focused_text()
        } else {
            None
        });

        debug!(
            "TranscribeAction::start completed in {:?}",
            start_time.elapsed()
        );
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        // Unregister the cancel shortcut when transcription stops
        shortcut::unregister_cancel_shortcut(app);
        let partials = crate::live_preview::wanted(app);
        crate::live_preview::stop();

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

        let target_app = crate::app_context::take_target_app();
        let focused_text = crate::text_context::take_focused_text();
        let binding_id = binding_id.to_string(); // Clone binding_id for the async task
        let post_process = self.always_clean_up || {
            let settings = get_settings(app);
            settings.post_process_enabled && settings.ai_cleanup_on_main
        };

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
                            let target = target_app
                                .clone()
                                .filter(|_| settings.per_app_styles)
                                .map(|app| crate::app_context::resolve_target(app, &settings));
                            // Nearby text, re-checked: settings may have changed
                            // since recording started.
                            let nearby = focused_text
                                .as_ref()
                                .filter(|_| crate::text_context::context_allowed(&settings))
                                .and_then(|text| text.cleanup_context());
                            let guidance = [
                                target
                                    .as_ref()
                                    .and_then(|target| target.instruction())
                                    .map(str::to_string),
                                nearby.clone(),
                            ]
                            .into_iter()
                            .flatten()
                            .collect::<Vec<_>>()
                            .join("\n\n");
                            if post_process {
                                match &target {
                                    Some(target) => show_processing_overlay_for(
                                        &ah,
                                        &target.app.name,
                                        target_style_code(target),
                                        nearby.is_some(),
                                    ),
                                    None => show_processing_overlay(&ah),
                                }
                            }
                            let finished = finish_dictation(
                                &settings,
                                &transcription,
                                post_process,
                                (!guidance.is_empty()).then_some(guidance.as_str()),
                            )
                            .await;
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
                            let history_app = target_app.clone();
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
                                        history_app,
                                    )
                                    .await
                                {
                                    error!("Failed to save transcription to history: {}", e);
                                }
                            });

                            // Paste the final text (either processed or original),
                            // once the stop press's modifiers are up if they come
                            // up soon; a dictation is never dropped for it.
                            crate::input::wait_for_modifiers_released_async(
                                crate::input::MODIFIER_RELEASE_WAIT,
                            )
                            .await;
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
                                            partials,
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
                                        report_paste_failure(&ah_clone, &paste_text);
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
                                target_app.clone(),
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

// Command Action

/// Command mode: select text, hold the shortcut and say how to change it, or
/// with nothing selected, say what to write. The AI cleanup provider does the
/// work. Commands aren't saved to history: they're edits, not dictations.
struct CommandAction;

/// The text a command works on, found after the instruction is transcribed
/// (by then the shortcut's keys are up, so a simulated copy isn't garbled).
/// `Ok(None)` writes at the cursor. `Err` is an overlay detail code.
fn command_selection(
    app: &AppHandle,
    at_start: Option<crate::text_context::FocusedText>,
) -> Result<Option<String>, &'static str> {
    // Read again: the first read may only have woken an Electron app's text.
    let readings: Vec<_> = [at_start, crate::text_context::read_for_command()]
        .into_iter()
        .flatten()
        .collect();
    if readings.iter().any(|text| text.secure) {
        return Err("commandPassword");
    }
    if let Some(text) = readings.iter().find(|text| !text.selected.is_empty()) {
        if text.selection_truncated {
            return Err("commandTooLong");
        }
        return Ok(Some(text.selected.clone()));
    }
    // A text field said nothing is selected: trust it rather than copy, which
    // could pick up something else (a file in Finder, a whole line in an editor).
    if readings.iter().any(|text| text.is_text_input()) {
        return Ok(None);
    }
    #[cfg(target_os = "macos")]
    {
        use crate::clipboard::CopiedSelection;
        match crate::clipboard::copy_selection(app) {
            Ok(CopiedSelection::Text(text))
                if text.chars().count() > crate::text_context::SELECTION_LIMIT as usize =>
            {
                Err("commandTooLong")
            }
            Ok(CopiedSelection::Text(text)) => Ok(Some(text)),
            Ok(CopiedSelection::Nothing) => Ok(None),
            Ok(CopiedSelection::NotText) => Err("commandNotText"),
            Err(e) if e == crate::clipboard::KEYS_STILL_HELD => Err("commandKeysHeld"),
            Err(e) => {
                error!("Command couldn't copy the selection: {}", e);
                Err("commandFailed")
            }
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(None)
    }
}

impl ShortcutAction for CommandAction {
    fn lock(&self, app: &AppHandle) {
        show_locked_recording_overlay(app, true);
    }

    fn start(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        // Without a provider there's nothing to run the command, so don't
        // make the person talk first to find out.
        if !crate::dictation::commands_ready(&get_settings(app)) {
            show_error_overlay_with_reason(app, "commandNeedsSetup");
            play_feedback_sound(app, SoundType::Error);
            utils::hide_recording_overlay_after(app, 2500);
            return;
        }
        crate::app_context::remember_target_app();
        app.state::<Arc<TranscriptionManager>>()
            .initiate_model_load();
        change_tray_icon(app, TrayIconState::Recording);
        show_command_recording_overlay(app);
        let recording_started = begin_recording(app, binding_id);
        // Read the selection while it's surely still there.
        crate::text_context::remember_focused_text(if recording_started {
            crate::text_context::read_for_command()
        } else {
            None
        });
    }

    fn stop(&self, app: &AppHandle, binding_id: &str, _shortcut_str: &str) {
        shortcut::unregister_cancel_shortcut(app);

        let ah = app.clone();
        let rm = Arc::clone(&app.state::<Arc<AudioRecordingManager>>());
        let tm = Arc::clone(&app.state::<Arc<TranscriptionManager>>());

        change_tray_icon(app, TrayIconState::Transcribing);
        show_transcribing_overlay(app);
        rm.remove_mute();
        play_feedback_sound(app, SoundType::Transcribing);

        let target_app = crate::app_context::take_target_app();
        let at_start = crate::text_context::take_focused_text();
        let binding_id = binding_id.to_string();

        tauri::async_runtime::spawn(async move {
            // Moves into the paste below, so a press queued behind this
            // command can't start until the text has landed.
            let finish_guard = FinishGuard(ah.clone());

            let Some(samples) = rm.stop_recording(&binding_id) else {
                show_empty_overlay(&ah);
                play_feedback_sound(&ah, SoundType::Cancel);
                utils::hide_recording_overlay_after(&ah, 1600);
                change_tray_icon(&ah, TrayIconState::Idle);
                return;
            };
            let instruction = match tm.transcribe(samples) {
                Ok(text) => text.trim().to_string(),
                Err(err) => {
                    debug!("Command transcription error: {}", err);
                    finish_with_error(&ah, "transcriptionFailed");
                    return;
                }
            };
            if instruction.is_empty() {
                show_empty_overlay(&ah);
                play_feedback_sound(&ah, SoundType::Cancel);
                utils::hide_recording_overlay_after(&ah, 1600);
                change_tray_icon(&ah, TrayIconState::Idle);
                return;
            }

            let settings = get_settings(&ah);
            // Nearby text helps only when writing at the cursor, and only
            // where the person allowed it.
            let nearby = at_start
                .as_ref()
                .filter(|_| crate::text_context::context_allowed(&settings))
                .and_then(|text| text.cleanup_context());
            let app_for_selection = ah.clone();
            let selection = match tauri::async_runtime::spawn_blocking(move || {
                command_selection(&app_for_selection, at_start)
            })
            .await
            {
                Ok(Ok(selection)) => selection,
                Ok(Err(code)) => {
                    finish_with_error(&ah, code);
                    return;
                }
                Err(e) => {
                    error!("Command selection task failed: {}", e);
                    finish_with_error(&ah, "commandFailed");
                    return;
                }
            };

            show_command_processing_overlay(&ah, &instruction, selection.is_some());
            let style = target_app
                .filter(|_| settings.per_app_styles)
                .map(|app| crate::app_context::resolve_target(app, &settings))
                .and_then(|target| target.instruction().map(str::to_string));
            let guidance = [style, nearby.filter(|_| selection.is_none())]
                .into_iter()
                .flatten()
                .collect::<Vec<_>>()
                .join("\n\n");
            let outcome = crate::dictation::run_command(
                &settings,
                &instruction,
                selection.as_deref(),
                (!guidance.is_empty()).then_some(guidance.as_str()),
            )
            .await;
            log::info!(
                "Command ({}) finished: {}",
                if selection.is_some() { "edit" } else { "write" },
                match &outcome {
                    CommandOutcome::Done(_) => "done",
                    CommandOutcome::NotConfigured => "not configured",
                    CommandOutcome::Failed => "failed",
                    CommandOutcome::TimedOut => "timed out",
                }
            );
            let text = match outcome {
                CommandOutcome::Done(text) => text,
                CommandOutcome::NotConfigured => {
                    finish_with_error(&ah, "commandNeedsSetup");
                    return;
                }
                CommandOutcome::Failed => {
                    finish_with_error(&ah, "commandFailed");
                    return;
                }
                CommandOutcome::TimedOut => {
                    finish_with_error(&ah, "commandTimedOut");
                    return;
                }
            };

            // Replacing the selection with a modifier held would type
            // something else, so this one waits and gives up.
            if !crate::input::wait_for_modifiers_released_async(crate::input::MODIFIER_RELEASE_WAIT)
                .await
            {
                finish_with_error(&ah, "commandKeysHeld");
                return;
            }
            let ah_clone = ah.clone();
            ah.run_on_main_thread(move || {
                let _finish_guard = finish_guard;
                match utils::paste_replacement(text.clone(), ah_clone.clone()) {
                    Ok(()) => {
                        show_success_overlay_with_preview(&ah_clone, &text);
                        play_feedback_sound(&ah_clone, SoundType::Done);
                        utils::hide_recording_overlay_after(&ah_clone, 1500);
                    }
                    Err(e) => {
                        error!("Failed to paste command result: {}", e);
                        report_paste_failure(&ah_clone, &text);
                    }
                }
                change_tray_icon(&ah_clone, TrayIconState::Idle);
            })
            .unwrap_or_else(|e| {
                error!("Failed to run paste on main thread: {:?}", e);
                finish_with_error(&ah, "pasteFailed");
            });
        });
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
            always_clean_up: false,
        }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "transcribe_with_post_process".to_string(),
        Arc::new(TranscribeAction {
            always_clean_up: true,
        }) as Arc<dyn ShortcutAction>,
    );
    map.insert(
        "command".to_string(),
        Arc::new(CommandAction) as Arc<dyn ShortcutAction>,
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
