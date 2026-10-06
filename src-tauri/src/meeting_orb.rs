//! The meeting orb: a small panel docked to the right screen edge while a meeting
//! records. Hovering it opens a live transcript card; the webview runs the
//! hover/pin/drag state machine and this module owns the native panel.
//!
//! Meeting capture is macOS-only, so everywhere else the orb never appears and
//! its commands are no-ops (they still exist so the bindings are the same).

use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};

const LABEL: &str = "meeting_orb";

/// Panel sizes in points. They include a transparent margin so the orb and card
/// shadows aren't clipped; MeetingOrb.css and the presentation tests pin the same
/// numbers.
const COLLAPSED: (f64, f64) = (64.0, 64.0);
const EXPANDED: (f64, f64) = (384.0, 520.0);
/// Gap between the panel and the right edge of the usable screen area.
const EDGE_MARGIN: f64 = 2.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum MeetingOrbPhase {
    Hidden,
    Recording,
    /// Capture has stopped and the audio is being finalised.
    Finishing,
    /// A call started: offering to take notes for it.
    Prompt,
}

/// What the orb offers to take notes for: a call that started, a calendar
/// meeting that's starting, or both.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct MeetingPrompt {
    /// The call app, when a call was noticed; recording captures just it.
    pub app: Option<crate::app_context::FocusedApp>,
    /// The calendar meeting's title, when there is one.
    pub title: Option<String>,
}

#[derive(Clone, Debug, Serialize, Type)]
pub struct MeetingOrbSnapshot {
    pub phase: MeetingOrbPhase,
    pub document_id: Option<String>,
    pub title: String,
    /// What the prompt phase is asking about.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt: Option<MeetingPrompt>,
}

#[derive(Clone, Serialize)]
struct PointerPayload {
    inside: bool,
}

struct OrbInner {
    snapshot: MeetingOrbSnapshot,
    expanded: bool,
    /// Vertical position (fraction from the top) when the current drag began.
    drag_origin: Option<f64>,
    /// Position while dragging; saved to settings when the drag ends.
    dragged_to: Option<f64>,
    /// Stops the hover poller for the current showing.
    poller: Option<Arc<AtomicBool>>,
    /// What the current prompt is about.
    prompt: Option<MeetingPrompt>,
}

pub struct MeetingOrbState(Mutex<OrbInner>);

impl Default for MeetingOrbState {
    fn default() -> Self {
        Self(Mutex::new(OrbInner {
            snapshot: MeetingOrbSnapshot {
                phase: MeetingOrbPhase::Hidden,
                document_id: None,
                title: String::new(),
                prompt: None,
            },
            expanded: false,
            drag_origin: None,
            dragged_to: None,
            poller: None,
            prompt: None,
        }))
    }
}

fn with_state<T>(app: &AppHandle, f: impl FnOnce(&mut OrbInner) -> T) -> Option<T> {
    let state = app.try_state::<MeetingOrbState>()?;
    let mut inner = state.0.lock().unwrap_or_else(|e| e.into_inner());
    Some(f(&mut inner))
}

fn emit_state(app: &AppHandle) {
    if let Some(snapshot) = with_state(app, |inner| inner.snapshot.clone()) {
        let _ = app.emit("meeting-orb-state", snapshot);
    }
}

/// Show the orb for a meeting that just started recording.
pub fn show(app: &AppHandle, document_id: &str, title: &str) {
    let poller = Arc::new(AtomicBool::new(true));
    let previous = with_state(app, |inner| {
        inner.snapshot = MeetingOrbSnapshot {
            phase: MeetingOrbPhase::Recording,
            document_id: Some(document_id.to_string()),
            title: title.to_string(),
            prompt: None,
        };
        inner.expanded = false;
        inner.drag_origin = None;
        inner.poller.replace(poller.clone())
    })
    .flatten();
    if let Some(previous) = previous {
        previous.store(false, Ordering::SeqCst);
    }
    emit_state(app);
    platform::show(app);
    platform::start_hover_poller(app, poller);
}

/// Offer to take notes for a call that just started or a calendar meeting
/// that's starting. Shown expanded, since it needs an answer; recording a
/// meeting replaces it.
pub fn show_prompt(app: &AppHandle, prompt: MeetingPrompt) {
    let title = prompt
        .title
        .clone()
        .or_else(|| prompt.app.as_ref().map(|call| call.name.clone()))
        .unwrap_or_default();
    with_state(app, |inner| {
        inner.snapshot = MeetingOrbSnapshot {
            phase: MeetingOrbPhase::Prompt,
            document_id: None,
            title,
            prompt: Some(prompt.clone()),
        };
        inner.prompt = Some(prompt);
        inner.expanded = true;
        inner.drag_origin = None;
    });
    emit_state(app);
    platform::show(app);
    platform::place(app, true, stored_position(app));
}

/// Whether the orb is currently offering to take notes.
pub fn is_prompting(app: &AppHandle) -> bool {
    with_state(app, |inner| inner.snapshot.phase == MeetingOrbPhase::Prompt).unwrap_or(false)
}

/// Withdraw an unanswered prompt (the call ended, or it timed out).
pub fn dismiss_prompt(app: &AppHandle) {
    if is_prompting(app) {
        with_state(app, |inner| inner.prompt = None);
        hide(app);
    }
}

/// Mark the orb as finishing while the recording is finalised.
pub fn set_finishing(app: &AppHandle) {
    let changed = with_state(app, |inner| {
        let visible = inner.snapshot.phase != MeetingOrbPhase::Hidden;
        if visible {
            inner.snapshot.phase = MeetingOrbPhase::Finishing;
        }
        visible
    })
    .unwrap_or(false);
    if changed {
        emit_state(app);
    }
}

/// Hide the orb once the meeting has ended.
pub fn hide(app: &AppHandle) {
    let poller = with_state(app, |inner| {
        inner.snapshot = MeetingOrbSnapshot {
            phase: MeetingOrbPhase::Hidden,
            document_id: None,
            title: String::new(),
            prompt: None,
        };
        inner.expanded = false;
        inner.drag_origin = None;
        inner.poller.take()
    })
    .flatten();
    if let Some(poller) = poller {
        poller.store(false, Ordering::SeqCst);
    }
    emit_state(app);
    platform::hide(app);
}

fn stored_position(app: &AppHandle) -> f64 {
    with_state(app, |inner| inner.dragged_to)
        .flatten()
        .unwrap_or_else(|| crate::settings::get_settings(app).meeting_orb_y)
}

#[tauri::command]
#[specta::specta]
pub fn meeting_orb_snapshot(app: AppHandle) -> MeetingOrbSnapshot {
    with_state(&app, |inner| inner.snapshot.clone()).unwrap_or(MeetingOrbSnapshot {
        phase: MeetingOrbPhase::Hidden,
        document_id: None,
        title: String::new(),
        prompt: None,
    })
}

/// Grow the panel into the transcript card, or shrink it back to the orb.
/// The orb keeps its screen position either way.
#[tauri::command]
#[specta::specta]
pub fn meeting_orb_set_expanded(app: AppHandle, expanded: bool) {
    with_state(&app, |inner| inner.expanded = expanded);
    platform::place(&app, expanded, stored_position(&app));
}

/// Move the orb along the screen edge. `delta_y` is the pointer's vertical travel
/// since the drag began, in points; `done` ends the drag and remembers the spot.
#[tauri::command]
#[specta::specta]
pub fn meeting_orb_drag(app: AppHandle, delta_y: f64, done: bool) {
    let current = stored_position(&app);
    let Some((origin, expanded)) = with_state(&app, |inner| {
        (*inner.drag_origin.get_or_insert(current), inner.expanded)
    }) else {
        return;
    };
    let position = platform::position_after_drag(origin, delta_y);
    with_state(&app, |inner| {
        inner.dragged_to = Some(position);
        if done {
            inner.drag_origin = None;
        }
    });
    platform::place(&app, expanded, position);
    if done {
        let mut settings = crate::settings::get_settings(&app);
        settings.meeting_orb_y = position;
        crate::settings::write_settings(&app, settings);
        with_state(&app, |inner| inner.dragged_to = None);
    }
}

/// Open the meeting's document in the main window.
#[tauri::command]
#[specta::specta]
pub fn meeting_orb_open_document(app: AppHandle, document_id: String) {
    crate::show_main_window(&app);
    let _ = app.emit("workspace-open-document", document_id);
}

/// Answer the "take notes?" prompt. Starting opens the main window, which
/// starts the meeting with the person's usual setup.
#[tauri::command]
#[specta::specta]
pub fn meeting_orb_answer_prompt(app: AppHandle, start: bool) {
    let prompt = with_state(&app, |inner| inner.prompt.take()).flatten();
    dismiss_prompt(&app);
    if start {
        if let Some(prompt) = prompt {
            crate::show_main_window(&app);
            let _ = app.emit("meeting-call-start", prompt);
        }
    }
}

/// Copies text for the orb (the "let people know" message). Its panel never
/// becomes the key window, so the web clipboard API isn't reliable there.
#[tauri::command]
#[specta::specta]
pub fn meeting_orb_copy(app: AppHandle, text: String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{PointerPayload, COLLAPSED, EDGE_MARGIN, EXPANDED, LABEL};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;
    use tauri::{AppHandle, Emitter, WebviewUrl};
    use tauri_nspanel::objc2::MainThreadMarker;
    use tauri_nspanel::objc2_app_kit::{NSEvent, NSScreen, NSWindowSharingType};
    use tauri_nspanel::objc2_foundation::{NSPoint, NSRect, NSSize};
    use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

    // The macro brings its own AppKit imports, so it gets a module to itself.
    mod panel_class {
        use tauri::Manager;
        use tauri_nspanel::tauri_panel;
        tauri_panel! {
            panel!(MeetingOrbPanel {
                config: {
                    can_become_key_window: false,
                    is_floating_panel: true
                }
            })
        }
    }
    use panel_class::MeetingOrbPanel;

    const HOVER_POLL: Duration = Duration::from_millis(50);

    /// Creates the orb panel, hidden. Must run on the main thread.
    pub fn create(app: &AppHandle) {
        let result = PanelBuilder::<_, MeetingOrbPanel>::new(app, LABEL)
            .url(WebviewUrl::App("src/meeting-orb/index.html".into()))
            .title("Meeting")
            .level(PanelLevel::Status)
            .size(tauri::Size::Logical(tauri::LogicalSize {
                width: COLLAPSED.0,
                height: COLLAPSED.1,
            }))
            .has_shadow(false)
            .transparent(true)
            .no_activate(true)
            .corner_radius(0.0)
            .accepts_mouse_moved_events(true)
            // Clicking the orb must never take focus from the meeting app.
            .style_mask(StyleMask::empty().nonactivating_panel())
            .with_window(|w| {
                w.decorations(false)
                    .transparent(true)
                    .content_protected(true)
                    .accept_first_mouse(true)
            })
            .collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary()
                    .stationary()
                    .ignores_cycle(),
            )
            .build();
        match result {
            Ok(panel) => {
                // Keep the orb out of screen shares and recordings.
                panel.as_panel().setSharingType(NSWindowSharingType::None);
                panel.hide();
            }
            Err(e) => log::error!("Failed to create meeting orb panel: {}", e),
        }
    }

    fn on_main(app: &AppHandle, f: impl FnOnce(&AppHandle, MainThreadMarker) + Send + 'static) {
        if let Some(mtm) = MainThreadMarker::new() {
            f(app, mtm);
            return;
        }
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(mtm) = MainThreadMarker::new() {
                f(&handle, mtm);
            }
        });
    }

    /// The usable area of the primary display (the one with the menu bar).
    fn visible_frame(mtm: MainThreadMarker) -> Option<NSRect> {
        NSScreen::screens(mtm)
            .firstObject()
            .map(|screen| screen.visibleFrame())
    }

    /// Frame for the panel with its top-right corner fixed to where the collapsed
    /// orb sits, clamped inside the usable screen area.
    fn frame_for(screen: NSRect, expanded: bool, position: f64) -> NSRect {
        let (width, height) = if expanded { EXPANDED } else { COLLAPSED };
        let screen_top = screen.origin.y + screen.size.height;
        let orb_top =
            screen_top - position.clamp(0.0, 1.0) * screen.size.height + COLLAPSED.1 / 2.0;
        let top = orb_top.min(screen_top).max(screen.origin.y + height);
        NSRect::new(
            NSPoint::new(
                screen.origin.x + screen.size.width - width - EDGE_MARGIN,
                top - height,
            ),
            NSSize::new(width, height),
        )
    }

    pub fn place(app: &AppHandle, expanded: bool, position: f64) {
        on_main(app, move |app, mtm| {
            let (Ok(panel), Some(screen)) = (app.get_webview_panel(LABEL), visible_frame(mtm))
            else {
                return;
            };
            // One native call so growing leftward never flashes at the old origin.
            panel
                .as_panel()
                .setFrame_display(frame_for(screen, expanded, position), true);
        });
    }

    pub fn show(app: &AppHandle) {
        let position = super::stored_position(app);
        on_main(app, move |app, mtm| {
            let (Ok(panel), Some(screen)) = (app.get_webview_panel(LABEL), visible_frame(mtm))
            else {
                return;
            };
            panel
                .as_panel()
                .setFrame_display(frame_for(screen, false, position), true);
            panel.show();
        });
    }

    pub fn hide(app: &AppHandle) {
        on_main(app, |app, _| {
            if let Ok(panel) = app.get_webview_panel(LABEL) {
                panel.hide();
            }
        });
    }

    /// Converts pointer travel into a new position, keeping the orb on screen.
    /// Commands without `async` run on the main thread, so the screen is readable.
    pub fn position_after_drag(origin: f64, delta_y: f64) -> f64 {
        let height = MainThreadMarker::new()
            .and_then(visible_frame)
            .map(|screen| screen.size.height)
            .filter(|height| *height > 0.0);
        let Some(height) = height else {
            return origin;
        };
        let margin = COLLAPSED.1 / 2.0 / height;
        (origin + delta_y / height).clamp(margin, 1.0 - margin)
    }

    /// WKWebView doesn't reliably see the pointer in a panel that never becomes
    /// key, so compare the cursor with the panel frame here and tell the webview
    /// when it crosses the edge.
    pub fn start_hover_poller(app: &AppHandle, running: Arc<AtomicBool>) {
        let app = app.clone();
        let inside = Arc::new(AtomicBool::new(false));
        std::thread::spawn(move || {
            while running.load(Ordering::SeqCst) {
                let inside = inside.clone();
                let _ = app.run_on_main_thread({
                    let app = app.clone();
                    move || {
                        let Ok(panel) = app.get_webview_panel(LABEL) else {
                            return;
                        };
                        let frame = panel.as_panel().frame();
                        let cursor = NSEvent::mouseLocation();
                        let now = cursor.x >= frame.origin.x
                            && cursor.x <= frame.origin.x + frame.size.width
                            && cursor.y >= frame.origin.y
                            && cursor.y <= frame.origin.y + frame.size.height;
                        if inside.swap(now, Ordering::SeqCst) != now {
                            let _ = app.emit("meeting-orb-pointer", PointerPayload { inside: now });
                        }
                    }
                });
                std::thread::sleep(HOVER_POLL);
            }
        });
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use std::sync::atomic::AtomicBool;
    use std::sync::Arc;
    use tauri::AppHandle;

    pub fn create(_app: &AppHandle) {}
    pub fn place(_app: &AppHandle, _expanded: bool, _position: f64) {}
    pub fn show(_app: &AppHandle) {}
    pub fn hide(_app: &AppHandle) {}
    pub fn position_after_drag(origin: f64, _delta_y: f64) -> f64 {
        origin
    }
    pub fn start_hover_poller(_app: &AppHandle, _running: Arc<AtomicBool>) {}
}

/// Creates the hidden orb panel. Call once at startup on the main thread.
pub fn create(app: &AppHandle) {
    app.manage(MeetingOrbState::default());
    platform::create(app);
}
