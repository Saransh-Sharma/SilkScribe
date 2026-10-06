use crate::actions::ACTION_MAP;
use crate::managers::audio::AudioRecordingManager;
use log::{debug, error, warn};
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const DEBOUNCE: Duration = Duration::from_millis(30);

/// A press that arrives while the previous dictation is still being transcribed
/// is held and started once that one finishes, instead of being dropped. In
/// toggle mode, past this age the intent is stale and a surprise recording would
/// be worse. Push-to-talk needs no limit: release withdraws the press, so one
/// still queued means the key is still held.
const QUEUED_PRESS_MAX_AGE: Duration = Duration::from_secs(5);

/// In hold mode, letting go sooner than this was a tap: recording carries on
/// hands-free until the next press, instead of stopping almost at once.
const TAP_TO_LOCK: Duration = Duration::from_millis(300);

/// Commands processed sequentially by the coordinator thread.
enum Command {
    Input {
        binding_id: String,
        hotkey_string: String,
        is_pressed: bool,
        push_to_talk: bool,
        tap_to_lock: bool,
        /// When the key event happened, not when it's handled: a slow start
        /// mustn't turn a tap into a hold.
        at: Instant,
    },
    Cancel {
        recording_was_active: bool,
    },
    ProcessingFinished,
}

/// Pipeline lifecycle, owned exclusively by the coordinator thread.
enum Stage {
    Idle,
    Recording {
        binding_id: String,
        pressed_at: Instant,
        /// Hands-free after a tap: the next press stops it.
        locked: bool,
    },
    Processing,
}

impl Stage {
    fn is_recording(&self, binding: &str) -> bool {
        matches!(self, Stage::Recording { binding_id, .. } if binding_id == binding)
    }
}

/// What letting go of a hold-mode shortcut does to its recording.
#[derive(Debug, PartialEq, Eq)]
enum Release {
    Stop,
    Lock,
    /// Already hands-free: the release of the press that locked it, or of the
    /// press that stops it.
    Ignore,
}

fn on_release(locked: bool, tap_to_lock: bool, held: Duration) -> Release {
    if locked {
        Release::Ignore
    } else if tap_to_lock && held < TAP_TO_LOCK {
        Release::Lock
    } else {
        Release::Stop
    }
}

/// A start request held until the pipeline is free again.
struct QueuedPress {
    binding_id: String,
    hotkey_string: String,
    push_to_talk: bool,
    at: Instant,
    /// Tapped while the last one finished: start it hands-free.
    locked: bool,
}

/// Serialises all transcription lifecycle events through a single thread
/// to eliminate race conditions between keyboard shortcuts, signals, and
/// the async transcribe-paste pipeline.
pub struct TranscriptionCoordinator {
    tx: Sender<Command>,
}

/// Bindings that record speech. They share one pipeline, so presses queue and
/// cancel the same way whichever one started it.
pub fn is_transcribe_binding(id: &str) -> bool {
    matches!(
        id,
        "transcribe" | "transcribe_with_post_process" | "command"
    )
}

impl TranscriptionCoordinator {
    pub fn new(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel();

        thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let mut stage = Stage::Idle;
                let mut last_press: Option<Instant> = None;
                let mut queued: Option<QueuedPress> = None;

                while let Ok(cmd) = rx.recv() {
                    match cmd {
                        Command::Input {
                            binding_id,
                            hotkey_string,
                            is_pressed,
                            push_to_talk,
                            tap_to_lock,
                            at,
                        } => {
                            // Debounce rapid-fire press events (key repeat / double-tap).
                            // Releases always pass through for push-to-talk.
                            if is_pressed {
                                let now = Instant::now();
                                if last_press.map_or(false, |t| now.duration_since(t) < DEBOUNCE) {
                                    debug!("Debounced press for '{binding_id}'");
                                    continue;
                                }
                                last_press = Some(now);
                            }

                            let is_queued =
                                queued.as_ref().is_some_and(|q| q.binding_id == binding_id);

                            if push_to_talk {
                                if is_pressed && matches!(stage, Stage::Idle) {
                                    start(&app, &mut stage, &binding_id, &hotkey_string, at);
                                } else if is_pressed
                                    && matches!(&stage, Stage::Recording { binding_id: id, locked: true, .. } if id == &binding_id)
                                {
                                    // Hands-free: this press finishes it.
                                    stop(&app, &mut stage, &binding_id, &hotkey_string);
                                } else if is_pressed && matches!(stage, Stage::Processing) {
                                    queued = Some(queue_press(
                                        &binding_id,
                                        &hotkey_string,
                                        push_to_talk,
                                        at,
                                    ));
                                } else if !is_pressed && stage.is_recording(&binding_id) {
                                    let Stage::Recording {
                                        pressed_at, locked, ..
                                    } = &mut stage
                                    else {
                                        continue;
                                    };
                                    match on_release(
                                        *locked,
                                        tap_to_lock,
                                        at.saturating_duration_since(*pressed_at),
                                    ) {
                                        Release::Lock => {
                                            *locked = true;
                                            lock(&app, &binding_id);
                                        }
                                        Release::Stop => {
                                            stop(&app, &mut stage, &binding_id, &hotkey_string)
                                        }
                                        Release::Ignore => {}
                                    }
                                } else if !is_pressed && is_queued {
                                    let tapped = queued.as_ref().is_some_and(|press| {
                                        tap_to_lock
                                            && at.saturating_duration_since(press.at) < TAP_TO_LOCK
                                    });
                                    if tapped {
                                        debug!("Tapped '{binding_id}' while busy; it will start hands-free");
                                        if let Some(press) = queued.as_mut() {
                                            press.locked = true;
                                        }
                                    } else {
                                        debug!("Released '{binding_id}' before its queued dictation started");
                                        queued = None;
                                    }
                                }
                            } else if is_pressed {
                                match &stage {
                                    Stage::Idle => {
                                        start(&app, &mut stage, &binding_id, &hotkey_string, at);
                                    }
                                    Stage::Recording { binding_id: id, .. }
                                        if id == &binding_id =>
                                    {
                                        stop(&app, &mut stage, &binding_id, &hotkey_string);
                                    }
                                    // Toggling again before it started takes the request back.
                                    Stage::Processing if is_queued => {
                                        debug!("Withdrew queued dictation for '{binding_id}'");
                                        queued = None;
                                    }
                                    Stage::Processing => {
                                        queued = Some(queue_press(
                                            &binding_id,
                                            &hotkey_string,
                                            push_to_talk,
                                            at,
                                        ));
                                    }
                                    _ => {
                                        debug!("Ignoring press for '{binding_id}': pipeline busy")
                                    }
                                }
                            }
                        }
                        Command::Cancel {
                            recording_was_active,
                        } => {
                            queued = None;
                            // Don't reset during processing — wait for the pipeline to finish.
                            if !matches!(stage, Stage::Processing)
                                && (recording_was_active
                                    || matches!(stage, Stage::Recording { .. }))
                            {
                                stage = Stage::Idle;
                            }
                        }
                        Command::ProcessingFinished => {
                            stage = Stage::Idle;
                            if let Some(press) = queued.take() {
                                // A held key is still held; anything else may be stale.
                                let held = press.push_to_talk && !press.locked;
                                if held || press.at.elapsed() <= QUEUED_PRESS_MAX_AGE {
                                    debug!("Starting queued dictation for '{}'", press.binding_id);
                                    start(
                                        &app,
                                        &mut stage,
                                        &press.binding_id,
                                        &press.hotkey_string,
                                        press.at,
                                    );
                                    if press.locked {
                                        if let Stage::Recording { locked, .. } = &mut stage {
                                            *locked = true;
                                            lock(&app, &press.binding_id);
                                        }
                                    }
                                } else {
                                    debug!(
                                        "Dropped stale queued dictation for '{}'",
                                        press.binding_id
                                    );
                                }
                            }
                        }
                    }
                }
                debug!("Transcription coordinator exited");
            }));
            if let Err(e) = result {
                error!("Transcription coordinator panicked: {e:?}");
            }
        });

        Self { tx }
    }

    /// Send a keyboard/signal input event for a transcribe binding.
    /// For signal-based toggles, use `is_pressed: true` and `push_to_talk: false`.
    /// `tap_to_lock` applies in push-to-talk mode: a quick tap keeps
    /// recording hands-free.
    pub fn send_input(
        &self,
        binding_id: &str,
        hotkey_string: &str,
        is_pressed: bool,
        push_to_talk: bool,
        tap_to_lock: bool,
    ) {
        if self
            .tx
            .send(Command::Input {
                binding_id: binding_id.to_string(),
                hotkey_string: hotkey_string.to_string(),
                is_pressed,
                push_to_talk,
                tap_to_lock,
                at: Instant::now(),
            })
            .is_err()
        {
            warn!("Transcription coordinator channel closed");
        }
    }

    pub fn notify_cancel(&self, recording_was_active: bool) {
        if self
            .tx
            .send(Command::Cancel {
                recording_was_active,
            })
            .is_err()
        {
            warn!("Transcription coordinator channel closed");
        }
    }

    pub fn notify_processing_finished(&self) {
        if self.tx.send(Command::ProcessingFinished).is_err() {
            warn!("Transcription coordinator channel closed");
        }
    }
}

fn queue_press(
    binding_id: &str,
    hotkey_string: &str,
    push_to_talk: bool,
    at: Instant,
) -> QueuedPress {
    debug!("Queued press for '{binding_id}' until the current dictation finishes");
    QueuedPress {
        binding_id: binding_id.to_string(),
        hotkey_string: hotkey_string.to_string(),
        push_to_talk,
        at,
        locked: false,
    }
}

/// Dictation never waits on meeting capture: the two run side by side, and the
/// meeting's mic track is gated while dictation records (see `AudioRecordingManager`).
fn start(
    app: &AppHandle,
    stage: &mut Stage,
    binding_id: &str,
    hotkey_string: &str,
    pressed_at: Instant,
) {
    let Some(action) = ACTION_MAP.get(binding_id) else {
        warn!("No action in ACTION_MAP for '{binding_id}'");
        return;
    };
    action.start(app, binding_id, hotkey_string);
    if app
        .try_state::<Arc<AudioRecordingManager>>()
        .map_or(false, |a| a.is_recording())
    {
        *stage = Stage::Recording {
            binding_id: binding_id.to_string(),
            pressed_at,
            locked: false,
        };
    } else {
        debug!("Start for '{binding_id}' did not begin recording; staying idle");
    }
}

/// A tap locked the recording on: let the action say so.
fn lock(app: &AppHandle, binding_id: &str) {
    debug!("Recording for '{binding_id}' is now hands-free");
    if let Some(action) = ACTION_MAP.get(binding_id) {
        action.lock(app);
    }
}

fn stop(app: &AppHandle, stage: &mut Stage, binding_id: &str, hotkey_string: &str) {
    let Some(action) = ACTION_MAP.get(binding_id) else {
        warn!("No action in ACTION_MAP for '{binding_id}'");
        return;
    };
    action.stop(app, binding_id, hotkey_string);
    *stage = Stage::Processing;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_tap_locks_and_a_hold_stops() {
        let tap = Duration::from_millis(120);
        let hold = Duration::from_millis(900);
        assert_eq!(on_release(false, true, tap), Release::Lock);
        assert_eq!(on_release(false, true, hold), Release::Stop);
        // With tap-to-lock off, every release stops.
        assert_eq!(on_release(false, false, tap), Release::Stop);
        // Once hands-free, releases don't stop it; the next press does.
        assert_eq!(on_release(true, true, hold), Release::Ignore);
    }
}
