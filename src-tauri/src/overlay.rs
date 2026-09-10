use crate::input;
use crate::settings;
use crate::settings::{OverlayAppearance, OverlayPosition, ThemePreference};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize};

#[cfg(not(target_os = "macos"))]
use log::debug;

#[cfg(not(target_os = "macos"))]
use tauri::WebviewWindowBuilder;

#[cfg(target_os = "macos")]
use tauri::WebviewUrl;

#[cfg(target_os = "macos")]
use tauri_nspanel::{tauri_panel, CollectionBehavior, PanelBuilder, PanelLevel};

#[cfg(target_os = "linux")]
use gtk_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
#[cfg(target_os = "linux")]
use std::env;

#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(RecordingOverlayPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

// The native window is deliberately larger than the pill it contains. The pill
// is centred inside it and morphs its own width per state, so the surplus is
// what gives the drop shadow and the recording glow room to render instead of
// being clipped at the window edge. Pill max is roughly 340x84.
const OVERLAY_WIDTH: f64 = 400.0;
const OVERLAY_HEIGHT: f64 = 116.0;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OverlayPayload {
    state: String,
    /// Theme *preference* for the overlay webview: "light", "dark" or "system".
    /// "system" is resolved on the TypeScript side via `matchMedia`, which keeps
    /// this off the platform window-theme APIs (the macOS overlay is an NSPanel).
    theme: String,
    /// i18n key suffix under `overlay.detail.*`. Rust has no access to the
    /// user's translation bundle, so it sends a code and the webview renders it.
    detail_code: Option<String>,
    /// A short excerpt of what was actually transcribed, shown on success.
    preview_text: Option<String>,
    /// Screen edge the overlay is anchored to, so it can animate in from there.
    position: String,
    can_cancel: bool,
}

/// Longest transcript excerpt the overlay will show. The pill is one line wide;
/// past this the text is truncated on a word boundary and ellipsised.
const PREVIEW_MAX_CHARS: usize = 64;

fn build_preview(text: &str) -> Option<String> {
    let trimmed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.chars().count() <= PREVIEW_MAX_CHARS {
        return Some(trimmed);
    }

    let head: String = trimmed.chars().take(PREVIEW_MAX_CHARS).collect();
    let cut = head.rfind(' ').unwrap_or(head.len());
    let clipped = head[..cut].trim_end();
    Some(format!("{}\u{2026}", clipped))
}

/// Resolve which theme preference to hand the overlay webview.
///
/// `OverlayAppearance::Auto` defers to the app-wide theme preference; the other
/// two pin the overlay regardless of what the rest of the app is doing.
fn resolve_overlay_theme(settings: &settings::AppSettings) -> String {
    match settings.overlay_appearance {
        OverlayAppearance::Light => "light",
        OverlayAppearance::Dark => "dark",
        OverlayAppearance::Auto => match settings.theme {
            ThemePreference::Light => "light",
            ThemePreference::Dark => "dark",
            ThemePreference::System => "system",
        },
    }
    .to_string()
}

#[cfg(target_os = "macos")]
const OVERLAY_TOP_OFFSET: f64 = 30.0;
#[cfg(any(target_os = "windows", target_os = "linux"))]
const OVERLAY_TOP_OFFSET: f64 = 0.0;

#[cfg(target_os = "macos")]
const OVERLAY_BOTTOM_OFFSET: f64 = 0.0;

#[cfg(any(target_os = "windows", target_os = "linux"))]
const OVERLAY_BOTTOM_OFFSET: f64 = 24.0;

#[cfg(target_os = "linux")]
fn update_gtk_layer_shell_anchors(overlay_window: &tauri::webview::WebviewWindow) {
    let window_clone = overlay_window.clone();
    let _ = overlay_window.run_on_main_thread(move || {
        // Try to get the GTK window from the Tauri webview
        if let Ok(gtk_window) = window_clone.gtk_window() {
            let settings = settings::get_settings(window_clone.app_handle());
            match settings.overlay_position {
                OverlayPosition::Top => {
                    gtk_window.set_anchor(Edge::Top, true);
                    gtk_window.set_anchor(Edge::Bottom, false);
                }
                OverlayPosition::Bottom | OverlayPosition::None => {
                    gtk_window.set_anchor(Edge::Bottom, true);
                    gtk_window.set_anchor(Edge::Top, false);
                }
            }
        }
    });
}

/// Initializes GTK layer shell for Linux overlay window
/// Returns true if layer shell was successfully initialized, false otherwise
#[cfg(target_os = "linux")]
fn init_gtk_layer_shell(overlay_window: &tauri::webview::WebviewWindow) -> bool {
    // On KDE Wayland, layer-shell init has shown protocol instability.
    // Fall back to regular always-on-top overlay behavior (as in v0.7.1).
    let is_wayland = env::var("WAYLAND_DISPLAY").is_ok()
        || env::var("XDG_SESSION_TYPE")
            .map(|v| v.eq_ignore_ascii_case("wayland"))
            .unwrap_or(false);
    let is_kde = env::var("XDG_CURRENT_DESKTOP")
        .map(|v| v.to_uppercase().contains("KDE"))
        .unwrap_or(false)
        || env::var("KDE_SESSION_VERSION").is_ok();
    if is_wayland && is_kde {
        debug!("Skipping GTK layer shell init on KDE Wayland");
        return false;
    }

    if !gtk_layer_shell::is_supported() {
        return false;
    }

    // Try to get the GTK window from the Tauri webview
    if let Ok(gtk_window) = overlay_window.gtk_window() {
        // Initialize layer shell
        gtk_window.init_layer_shell();
        gtk_window.set_layer(Layer::Overlay);
        gtk_window.set_keyboard_mode(KeyboardMode::None);
        gtk_window.set_exclusive_zone(0);

        update_gtk_layer_shell_anchors(overlay_window);

        return true;
    }
    false
}

/// Forces a window to be topmost using Win32 API (Windows only)
/// This is more reliable than Tauri's set_always_on_top which can be overridden
#[cfg(target_os = "windows")]
fn force_overlay_topmost(overlay_window: &tauri::webview::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
    };

    // Clone because run_on_main_thread takes 'static
    let overlay_clone = overlay_window.clone();

    // Make sure the Win32 call happens on the UI thread
    let _ = overlay_clone.clone().run_on_main_thread(move || {
        if let Ok(hwnd) = overlay_clone.hwnd() {
            unsafe {
                // Force Z-order: make this window topmost without changing size/pos or stealing focus
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOPMOST),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                );
            }
        }
    });
}

fn get_monitor_with_cursor(app_handle: &AppHandle) -> Option<tauri::Monitor> {
    if let Some(mouse_location) = input::get_cursor_position(app_handle) {
        if let Ok(monitors) = app_handle.available_monitors() {
            for monitor in monitors {
                let is_within =
                    is_mouse_within_monitor(mouse_location, monitor.position(), monitor.size());
                if is_within {
                    return Some(monitor);
                }
            }
        }
    }

    app_handle.primary_monitor().ok().flatten()
}

fn is_mouse_within_monitor(
    mouse_pos: (i32, i32),
    monitor_pos: &PhysicalPosition<i32>,
    monitor_size: &PhysicalSize<u32>,
) -> bool {
    let (mouse_x, mouse_y) = mouse_pos;
    let PhysicalPosition {
        x: monitor_x,
        y: monitor_y,
    } = *monitor_pos;
    let PhysicalSize {
        width: monitor_width,
        height: monitor_height,
    } = *monitor_size;

    mouse_x >= monitor_x
        && mouse_x < (monitor_x + monitor_width as i32)
        && mouse_y >= monitor_y
        && mouse_y < (monitor_y + monitor_height as i32)
}

fn calculate_overlay_position(app_handle: &AppHandle) -> Option<(f64, f64)> {
    if let Some(monitor) = get_monitor_with_cursor(app_handle) {
        let work_area = monitor.work_area();
        let scale = monitor.scale_factor();
        let work_area_width = work_area.size.width as f64 / scale;
        let work_area_height = work_area.size.height as f64 / scale;
        let work_area_x = work_area.position.x as f64 / scale;
        let work_area_y = work_area.position.y as f64 / scale;

        let settings = settings::get_settings(app_handle);

        let x = work_area_x + (work_area_width - OVERLAY_WIDTH) / 2.0;
        let y = match settings.overlay_position {
            OverlayPosition::Top => work_area_y + OVERLAY_TOP_OFFSET,
            OverlayPosition::Bottom | OverlayPosition::None => {
                work_area_y + work_area_height - OVERLAY_HEIGHT - OVERLAY_BOTTOM_OFFSET
            }
        };

        return Some((x, y));
    }
    None
}

/// Creates the recording overlay window and keeps it hidden by default
#[cfg(not(target_os = "macos"))]
pub fn create_recording_overlay(app_handle: &AppHandle) {
    let position = calculate_overlay_position(app_handle);

    // On Linux (Wayland), monitor detection often fails, but we don't need exact coordinates
    // for Layer Shell as we use anchors. On other platforms, we require a position.
    #[cfg(not(target_os = "linux"))]
    if position.is_none() {
        debug!("Failed to determine overlay position, not creating overlay window");
        return;
    }

    let mut builder = WebviewWindowBuilder::new(
        app_handle,
        "recording_overlay",
        tauri::WebviewUrl::App("src/overlay/index.html".into()),
    )
    .title("Recording")
    .resizable(false)
    .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
    .shadow(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .accept_first_mouse(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .transparent(true)
    .focused(false)
    .visible(false);

    if let Some((x, y)) = position {
        builder = builder.position(x, y);
    }

    match builder.build() {
        Ok(window) => {
            #[cfg(target_os = "linux")]
            {
                // Try to initialize GTK layer shell, ignore errors if compositor doesn't support it
                if init_gtk_layer_shell(&window) {
                    debug!("GTK layer shell initialized for overlay window");
                } else {
                    debug!("GTK layer shell not available, falling back to regular window");
                }
            }

            // The overlay has no interactive elements, and its window is much
            // larger than the visible pill so the shadow has room. Without this
            // the transparent margin would swallow clicks meant for whatever is
            // underneath.
            let _ = window.set_ignore_cursor_events(true);

            debug!("Recording overlay window created successfully (hidden)");
        }
        Err(e) => {
            debug!("Failed to create recording overlay window: {}", e);
        }
    }
}

/// Creates the recording overlay panel and keeps it hidden by default (macOS)
#[cfg(target_os = "macos")]
pub fn create_recording_overlay(app_handle: &AppHandle) {
    if let Some((x, y)) = calculate_overlay_position(app_handle) {
        // PanelBuilder creates a Tauri window then converts it to NSPanel.
        // The window remains registered, so get_webview_window() still works.
        match PanelBuilder::<_, RecordingOverlayPanel>::new(app_handle, "recording_overlay")
            .url(WebviewUrl::App("src/overlay/index.html".into()))
            .title("Recording")
            .position(tauri::Position::Logical(tauri::LogicalPosition { x, y }))
            .level(PanelLevel::Status)
            .size(tauri::Size::Logical(tauri::LogicalSize {
                width: OVERLAY_WIDTH,
                height: OVERLAY_HEIGHT,
            }))
            .has_shadow(false)
            .transparent(true)
            .no_activate(true)
            .corner_radius(0.0)
            .with_window(|w| w.decorations(false).transparent(true))
            .collection_behavior(
                CollectionBehavior::new()
                    .can_join_all_spaces()
                    .full_screen_auxiliary(),
            )
            .build()
        {
            Ok(panel) => {
                let _ = panel.hide();
                // Purely decorative surface — never intercept the pointer.
                if let Some(window) = app_handle.get_webview_window("recording_overlay") {
                    let _ = window.set_ignore_cursor_events(true);
                }
            }
            Err(e) => {
                log::error!("Failed to create recording overlay panel: {}", e);
            }
        }
    }
}

fn create_overlay_payload(
    settings: &settings::AppSettings,
    state: &str,
    detail_code: Option<&str>,
    preview_text: Option<String>,
) -> OverlayPayload {
    OverlayPayload {
        state: state.to_string(),
        theme: resolve_overlay_theme(settings),
        detail_code: detail_code.map(str::to_string),
        preview_text,
        position: match settings.overlay_position {
            OverlayPosition::Top => "top",
            OverlayPosition::Bottom | OverlayPosition::None => "bottom",
        }
        .to_string(),
        can_cancel: state == "recording",
    }
}

fn show_overlay_payload(app_handle: &AppHandle, payload: OverlayPayload) {
    update_overlay_position(app_handle);

    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        OVERLAY_GENERATION.fetch_add(1, Ordering::SeqCst);
        let _ = overlay_window.show();

        // On Windows, aggressively re-assert "topmost" in the native Z-order after showing
        #[cfg(target_os = "windows")]
        force_overlay_topmost(&overlay_window);

        let _ = overlay_window.emit("show-overlay", payload);
    }
}

fn show_overlay_state(
    app_handle: &AppHandle,
    state: &str,
    detail_code: Option<&str>,
    preview_text: Option<String>,
) {
    // Check if overlay should be shown based on position setting
    let settings = settings::get_settings(app_handle);
    if settings.overlay_position == OverlayPosition::None {
        return;
    }

    let payload = create_overlay_payload(&settings, state, detail_code, preview_text);
    show_overlay_payload(app_handle, payload);
}

/// Shows the recording overlay window with fade-in animation
pub fn show_recording_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "recording", None, None);
}

/// Shows the transcribing overlay window
pub fn show_transcribing_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "transcribing", None, None);
}

/// Shows the processing overlay window
pub fn show_processing_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "processing", None, None);
}

/// Shows the success overlay with an excerpt of the text that was delivered, so
/// the user can confirm what landed without switching focus to the target app.
pub fn show_success_overlay_with_preview(app_handle: &AppHandle, transcript: &str) {
    show_overlay_state(app_handle, "success", None, build_preview(transcript));
}

/// Shows the error overlay with a reason the webview will translate.
///
/// `code` is a key suffix under `overlay.detail.*` in the i18n bundle.
pub fn show_error_overlay_with_reason(app_handle: &AppHandle, code: &str) {
    show_overlay_state(app_handle, "error", Some(code), None);
}

/// Shows the cancelled overlay state.
pub fn show_cancelled_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "cancelled", Some("cancelled"), None);
}

/// Shows the "nothing was captured" terminal state.
///
/// This path used to hide the overlay silently, which left the user unsure
/// whether the app had heard them at all.
pub fn show_empty_overlay(app_handle: &AppHandle) {
    show_overlay_state(app_handle, "empty", Some("empty"), None);
}

/// Updates the overlay window position based on current settings
pub fn update_overlay_position(app_handle: &AppHandle) {
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        #[cfg(target_os = "linux")]
        {
            update_gtk_layer_shell_anchors(&overlay_window);
        }

        if let Some((x, y)) = calculate_overlay_position(app_handle) {
            let _ = overlay_window
                .set_position(tauri::Position::Logical(tauri::LogicalPosition { x, y }));
        }
    }
}

/// How long the pill's fade-out takes. Must match `--ss-duration-overlay-out`
/// in `src/theme.css`, which `RecordingOverlay.css` uses for its exit.
const OVERLAY_FADE_MS: u64 = 240;

/// Monotonic counter bumped on every show. A pending hide captures the value it
/// was scheduled against and gives up if a newer show has happened since, so a
/// fast stop -> start sequence can't have the old hide kill the new overlay.
static OVERLAY_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Hides the recording overlay after `dwell_ms`.
///
/// `dwell_ms` is the *total* time from now until the window is gone: the pill
/// stays fully visible for `dwell_ms - OVERLAY_FADE_MS`, then `hide-overlay`
/// triggers the CSS fade, then the native window is hidden once it has played.
///
/// This previously emitted `hide-overlay` immediately and only deferred the
/// native hide, which meant terminal states never faded — and, because the show
/// handler happened to be async, `.is-visible` never toggled off, so the entry
/// animation only ever played once per session.
pub fn hide_recording_overlay_after(app_handle: &AppHandle, dwell_ms: u64) {
    // Always hide the overlay regardless of settings - if setting was changed while recording,
    // we still want to hide it properly
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let generation = OVERLAY_GENERATION.load(Ordering::SeqCst);
        let visible_ms = dwell_ms.saturating_sub(OVERLAY_FADE_MS);

        std::thread::spawn(move || {
            if visible_ms > 0 {
                std::thread::sleep(std::time::Duration::from_millis(visible_ms));
            }

            // A newer show has taken over; leave it alone.
            if OVERLAY_GENERATION.load(Ordering::SeqCst) != generation {
                return;
            }

            let _ = overlay_window.emit("hide-overlay", ());
            std::thread::sleep(std::time::Duration::from_millis(OVERLAY_FADE_MS));

            if OVERLAY_GENERATION.load(Ordering::SeqCst) == generation {
                let _ = overlay_window.hide();
            }
        });
    }
}

/// Hides the recording overlay window with the default fade-out timing
pub fn hide_recording_overlay(app_handle: &AppHandle) {
    hide_recording_overlay_after(app_handle, OVERLAY_FADE_MS);
}

pub fn emit_levels(app_handle: &AppHandle, levels: &Vec<f32>) {
    // emit levels to main app
    let _ = app_handle.emit("mic-level", levels);

    // also emit to the recording overlay if it's open
    if let Some(overlay_window) = app_handle.get_webview_window("recording_overlay") {
        let _ = overlay_window.emit("mic-level", levels);
    }
}
