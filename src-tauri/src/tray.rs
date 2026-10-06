use crate::managers::history::{HistoryEntry, HistoryManager};
use crate::managers::transcription::TranscriptionManager;
use crate::settings;
use crate::tray_i18n::get_tray_translations;
use log::{error, info, warn};
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIcon;
use tauri::{AppHandle, Manager, Theme};
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Clone, Debug, PartialEq)]
pub enum TrayIconState {
    Idle,
    Recording,
    Transcribing,
}

#[derive(Clone, Debug, PartialEq)]
pub enum AppTheme {
    Dark,
    Light,
    Colored, // Pink/colored theme for Linux
}

/// Gets the current app theme, with Linux defaulting to Colored theme
pub fn get_current_theme(app: &AppHandle) -> AppTheme {
    if cfg!(target_os = "linux") {
        // On Linux, always use the colored theme
        AppTheme::Colored
    } else {
        // On other platforms, map system theme to our app theme
        if let Some(main_window) = app.get_webview_window("main") {
            match main_window.theme().unwrap_or(Theme::Dark) {
                Theme::Light => AppTheme::Light,
                Theme::Dark => AppTheme::Dark,
                _ => AppTheme::Dark, // Default fallback
            }
        } else {
            AppTheme::Dark
        }
    }
}

/// Gets the appropriate icon path for the given theme and state
pub fn get_icon_path(theme: AppTheme, state: TrayIconState) -> &'static str {
    match (theme, state) {
        // Dark theme uses light icons
        (AppTheme::Dark, TrayIconState::Idle) => "resources/tray_idle.png",
        (AppTheme::Dark, TrayIconState::Recording) => "resources/tray_recording.png",
        (AppTheme::Dark, TrayIconState::Transcribing) => "resources/tray_transcribing.png",
        // Light theme uses dark icons
        (AppTheme::Light, TrayIconState::Idle) => "resources/tray_idle_dark.png",
        (AppTheme::Light, TrayIconState::Recording) => "resources/tray_recording_dark.png",
        (AppTheme::Light, TrayIconState::Transcribing) => "resources/tray_transcribing_dark.png",
        // Colored theme uses pink icons (for Linux)
        (AppTheme::Colored, TrayIconState::Idle) => "resources/silkscribe.png",
        (AppTheme::Colored, TrayIconState::Recording) => "resources/recording.png",
        (AppTheme::Colored, TrayIconState::Transcribing) => "resources/transcribing.png",
    }
}

/// What the tray shows. Any thread may update it; only the main thread renders it.
#[derive(Clone, Debug)]
struct TrayView {
    dictation: TrayIconState,
    /// `Some(paused)` while a meeting is recording or paused.
    meeting: Option<bool>,
}

impl Default for TrayView {
    fn default() -> Self {
        Self {
            dictation: TrayIconState::Idle,
            meeting: None,
        }
    }
}

/// Tray state shared by dictation and meeting recording. The lock is a leaf: it is
/// only held to copy fields, never across menu, icon, or other native calls.
#[derive(Default)]
pub struct TrayModel(Mutex<TrayView>);

/// Show the dictation state in the tray icon and menu.
pub fn change_tray_icon(app: &AppHandle, icon: TrayIconState) {
    update_view(app, |view| view.dictation = icon);
}

/// Rebuild the tray from the current state, e.g. after a language, theme, or model change.
pub fn refresh_tray(app: &AppHandle) {
    update_view(app, |_| {});
}

/// Show or clear the meeting controls. `Some(paused)` while a meeting is active.
pub fn set_tray_meeting(app: &AppHandle, meeting: Option<bool>) {
    update_view(app, |view| view.meeting = meeting);
}

fn update_view(app: &AppHandle, update: impl FnOnce(&mut TrayView)) {
    if let Some(model) = app.try_state::<TrayModel>() {
        update(&mut model.0.lock().unwrap_or_else(|e| e.into_inner()));
    }
    // Menu and icon calls made off the main thread block until the main thread runs
    // them, which can deadlock against locks held there. Post the render instead;
    // renders run in order and always read the latest state.
    let handle = app.clone();
    if let Err(e) = app.run_on_main_thread(move || render(&handle)) {
        error!("Failed to schedule tray update: {}", e);
    }
}

fn render(app: &AppHandle) {
    let Some(tray) = app.try_state::<TrayIcon>() else {
        return;
    };
    let view = app
        .try_state::<TrayModel>()
        .map(|model| model.0.lock().unwrap_or_else(|e| e.into_inner()).clone())
        .unwrap_or_default();

    let icon_path = get_icon_path(get_current_theme(app), view.dictation.clone());
    match app
        .path()
        .resolve(icon_path, tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())
        .and_then(|path| Image::from_path(path).map_err(|e| e.to_string()))
    {
        Ok(image) => {
            let _ = tray.set_icon(Some(image));
        }
        Err(e) => error!("Failed to load tray icon {}: {}", icon_path, e),
    }

    match build_menu(app, &view) {
        Ok(menu) => {
            let _ = tray.set_menu(Some(menu));
        }
        Err(e) => error!("Failed to build tray menu: {}", e),
    }
    let _ = tray.set_icon_as_template(true);
}

/// Menu entries from top to bottom; `"-"` is a separator.
fn menu_items(dictation: &TrayIconState, meeting: Option<bool>) -> Vec<&'static str> {
    let mut items = vec!["version"];
    if meeting.is_some() {
        items.extend(["meeting_pause", "meeting_stop"]);
    }
    items.push("-");
    if *dictation != TrayIconState::Idle {
        items.extend(["cancel", "-"]);
    }
    items.extend(["copy_last_transcript", "copy_last_original"]);
    if *dictation == TrayIconState::Idle {
        items.push("unload_model");
    }
    items.extend(["-", "settings", "check_updates", "-", "quit"]);
    items
}

fn build_menu(app: &AppHandle, view: &TrayView) -> tauri::Result<Menu<tauri::Wry>> {
    let settings = settings::get_settings(app);
    let strings = get_tray_translations(Some(settings.app_language.clone()));

    // Platform-specific accelerators
    #[cfg(target_os = "macos")]
    let (settings_accelerator, quit_accelerator) = (Some("Cmd+,"), Some("Cmd+Q"));
    #[cfg(not(target_os = "macos"))]
    let (settings_accelerator, quit_accelerator) = (Some("Ctrl+,"), Some("Ctrl+Q"));

    let version_label = if cfg!(debug_assertions) {
        format!("SilkScribe v{} (Dev)", env!("CARGO_PKG_VERSION"))
    } else {
        format!("SilkScribe v{}", env!("CARGO_PKG_VERSION"))
    };
    // The "meeting_pause" id toggles pause/resume; only the label changes.
    let pause_label = if view.meeting == Some(true) {
        &strings.meeting_resume
    } else {
        &strings.meeting_pause
    };

    let menu = Menu::new(app)?;
    for id in menu_items(&view.dictation, view.meeting) {
        let item = |text: &str, enabled: bool, accelerator: Option<&str>| {
            MenuItem::with_id(app, id, text, enabled, accelerator)
        };
        match id {
            "-" => menu.append(&PredefinedMenuItem::separator(app)?)?,
            "version" => menu.append(&item(&version_label, false, None)?)?,
            "meeting_pause" => menu.append(&item(pause_label, true, None)?)?,
            "meeting_stop" => menu.append(&item(&strings.meeting_stop, true, None)?)?,
            "cancel" => menu.append(&item(&strings.cancel, true, None)?)?,
            "copy_last_transcript" => {
                menu.append(&item(&strings.copy_last_transcript, true, None)?)?
            }
            "copy_last_original" => menu.append(&item(&strings.copy_last_original, true, None)?)?,
            "unload_model" => {
                let model_loaded = app.state::<Arc<TranscriptionManager>>().is_model_loaded();
                menu.append(&item(&strings.unload_model, model_loaded, None)?)?
            }
            "settings" => menu.append(&item(&strings.settings, true, settings_accelerator)?)?,
            "check_updates" => menu.append(&item(
                &strings.check_updates,
                settings.update_checks_enabled,
                None,
            )?)?,
            "quit" => menu.append(&item(&strings.quit, true, quit_accelerator)?)?,
            other => warn!("Unknown tray menu item '{}'", other),
        }
    }
    Ok(menu)
}

/// The delivered text, or with `original` the transcript before AI cleanup.
fn last_transcript_text(entry: &HistoryEntry, original: bool) -> &str {
    if original {
        return &entry.transcription_text;
    }
    entry
        .post_processed_text
        .as_deref()
        .unwrap_or(&entry.transcription_text)
}

pub fn set_tray_visibility(app: &AppHandle, visible: bool) {
    let tray = app.state::<TrayIcon>();
    if let Err(e) = tray.set_visible(visible) {
        error!("Failed to set tray visibility: {}", e);
    } else {
        info!("Tray visibility set to: {}", visible);
    }
}

/// Copies the last dictation, or with `original` its text before AI cleanup.
pub fn copy_last_transcript(app: &AppHandle, original: bool) {
    let history_manager = app.state::<Arc<HistoryManager>>();
    let entry = match history_manager.get_latest_entry() {
        Ok(Some(entry)) => entry,
        Ok(None) => {
            warn!("No transcription history entries available for tray copy.");
            return;
        }
        Err(err) => {
            error!("Failed to fetch last transcription entry: {}", err);
            return;
        }
    };

    if let Err(err) = app
        .clipboard()
        .write_text(last_transcript_text(&entry, original))
    {
        error!("Failed to copy last transcript to clipboard: {}", err);
        return;
    }

    info!("Copied last transcript to clipboard via tray.");
}

#[cfg(test)]
mod tests {
    use super::{last_transcript_text, menu_items, TrayIconState};
    use crate::managers::history::HistoryEntry;

    fn build_entry(transcription: &str, post_processed: Option<&str>) -> HistoryEntry {
        HistoryEntry {
            id: 1,
            file_name: "silkscribe-1.wav".to_string(),
            timestamp: 0,
            saved: false,
            title: "Recording".to_string(),
            transcription_text: transcription.to_string(),
            post_processed_text: post_processed.map(|text| text.to_string()),
            post_process_prompt: None,
            post_process_requested: post_processed.is_some(),
        }
    }

    #[test]
    fn uses_post_processed_text_when_available() {
        let entry = build_entry("raw", Some("processed"));
        assert_eq!(last_transcript_text(&entry, false), "processed");
        assert_eq!(last_transcript_text(&entry, true), "raw");
    }

    #[test]
    fn falls_back_to_raw_transcription() {
        let entry = build_entry("raw", None);
        assert_eq!(last_transcript_text(&entry, false), "raw");
        assert_eq!(last_transcript_text(&entry, true), "raw");
    }

    #[test]
    fn idle_menu_offers_unload_but_not_cancel() {
        let items = menu_items(&TrayIconState::Idle, None);
        assert!(items.contains(&"unload_model"));
        assert!(!items.contains(&"cancel"));
        assert!(!items.contains(&"meeting_stop"));
    }

    #[test]
    fn dictation_menu_offers_cancel() {
        for state in [TrayIconState::Recording, TrayIconState::Transcribing] {
            let items = menu_items(&state, None);
            assert!(items.contains(&"cancel"));
            assert!(!items.contains(&"unload_model"));
        }
    }

    #[test]
    fn meeting_controls_survive_dictation() {
        for state in [
            TrayIconState::Idle,
            TrayIconState::Recording,
            TrayIconState::Transcribing,
        ] {
            let items = menu_items(&state, Some(false));
            assert_eq!(&items[..3], &["version", "meeting_pause", "meeting_stop"]);
        }
        let items = menu_items(&TrayIconState::Recording, Some(true));
        assert!(items.contains(&"cancel") && items.contains(&"meeting_stop"));
    }
}
