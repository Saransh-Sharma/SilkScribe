use crate::settings::SoundTheme;
use crate::settings::{self, AppSettings};
use cpal::traits::{DeviceTrait, HostTrait};
use log::{debug, error, warn};
use rodio::OutputStreamBuilder;
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::thread;
use tauri::{AppHandle, Manager};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SoundType {
    /// Recording has started and the microphone is live.
    Start,
    /// Recording stopped; the transcription pipeline has taken the audio.
    Transcribing,
    /// Text was produced and delivered. The one cue the user is waiting on.
    Done,
    /// Something went wrong — transcription failed, or the paste did.
    Error,
    /// The user backed out before anything was transcribed.
    Cancel,
}

impl SoundType {
    /// Filename stem for this cue in the current (five-cue) scheme.
    fn cue(self) -> &'static str {
        match self {
            SoundType::Start => "start",
            SoundType::Transcribing => "transcribing",
            SoundType::Done => "done",
            SoundType::Error => "error",
            SoundType::Cancel => "cancel",
        }
    }

    /// Filename stem in the original two-cue scheme, for themes that predate
    /// the full set. `Transcribing` fires at exactly the moment the old `stop`
    /// sound did, so it maps cleanly; the remaining cues have no equivalent and
    /// fall through to the Silk set instead.
    fn legacy_cue(self) -> Option<&'static str> {
        match self {
            SoundType::Start => Some("start"),
            SoundType::Transcribing => Some("stop"),
            SoundType::Done | SoundType::Error | SoundType::Cancel => None,
        }
    }
}

/// Locate the audio file for a cue.
///
/// Resolution order, first hit wins:
///   1. the selected theme's file for this cue (`marimba_done.wav`)
///   2. the selected theme's legacy file, if the cue has one (`marimba_stop.wav`)
///   3. the Silk file for this cue (`silk_done.wav`)
///
/// This is what lets Marimba and Pop keep working while shipping only the two
/// WAVs they always had: the three new cues borrow Silk's.
fn resolve_sound_path(
    app: &AppHandle,
    settings: &AppSettings,
    sound_type: SoundType,
) -> Option<PathBuf> {
    let theme = settings.sound_theme;

    let mut candidates: Vec<(String, tauri::path::BaseDirectory)> = Vec::new();
    let base_dir = theme_base_dir(theme);

    candidates.push((theme.sound_file(sound_type.cue()), base_dir));
    if let Some(legacy) = sound_type.legacy_cue() {
        candidates.push((theme.sound_file(legacy), base_dir));
    }
    if theme != SoundTheme::Silk {
        candidates.push((
            SoundTheme::Silk.sound_file(sound_type.cue()),
            tauri::path::BaseDirectory::Resource,
        ));
    }

    for (file, dir) in candidates {
        if let Some(path) = resolve_candidate(app, &file, dir) {
            return Some(path);
        }
    }

    debug!(
        "No sound file found for cue '{}' in theme '{}'",
        sound_type.cue(),
        theme.as_str()
    );
    None
}

fn resolve_candidate(
    app: &AppHandle,
    file: &str,
    base_dir: tauri::path::BaseDirectory,
) -> Option<PathBuf> {
    let path = match base_dir {
        // Custom sounds live beside the app data, which the portable build
        // relocates; go through the helper that knows about that.
        tauri::path::BaseDirectory::AppData => crate::portable::resolve_app_data(app, file).ok()?,
        other => app.path().resolve(file, other).ok()?,
    };

    path.is_file().then_some(path)
}

fn theme_base_dir(theme: SoundTheme) -> tauri::path::BaseDirectory {
    match theme {
        SoundTheme::Custom => tauri::path::BaseDirectory::AppData,
        _ => tauri::path::BaseDirectory::Resource,
    }
}

/// Play a cue without blocking the caller. Used everywhere the pipeline must
/// keep moving — notably the `Done` cue, which must never delay the paste.
pub fn play_feedback_sound(app: &AppHandle, sound_type: SoundType) {
    let settings = settings::get_settings(app);
    if !settings.audio_feedback {
        return;
    }
    if let Some(path) = resolve_sound_path(app, &settings, sound_type) {
        play_sound_async(app, path);
    }
}

/// Play a cue and wait for it to finish. Used at recording start so the
/// microphone mute can be applied only once the sound has stopped.
pub fn play_feedback_sound_blocking(app: &AppHandle, sound_type: SoundType) {
    let settings = settings::get_settings(app);
    if !settings.audio_feedback {
        return;
    }
    if let Some(path) = resolve_sound_path(app, &settings, sound_type) {
        play_sound_blocking(app, &path);
    }
}

pub fn play_test_sound(app: &AppHandle, sound_type: SoundType) {
    let settings = settings::get_settings(app);
    if let Some(path) = resolve_sound_path(app, &settings, sound_type) {
        play_sound_blocking(app, &path);
    }
}

fn play_sound_async(app: &AppHandle, path: PathBuf) {
    let app_handle = app.clone();
    thread::spawn(move || {
        if let Err(e) = play_sound_at_path(&app_handle, path.as_path()) {
            error!("Failed to play sound '{}': {}", path.display(), e);
        }
    });
}

fn play_sound_blocking(app: &AppHandle, path: &Path) {
    if let Err(e) = play_sound_at_path(app, path) {
        error!("Failed to play sound '{}': {}", path.display(), e);
    }
}

fn play_sound_at_path(app: &AppHandle, path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let settings = settings::get_settings(app);
    let volume = settings.audio_feedback_volume;
    let selected_device = settings.selected_output_device.clone();
    play_audio_file(path, selected_device, volume)
}

fn play_audio_file(
    path: &std::path::Path,
    selected_device: Option<String>,
    volume: f32,
) -> Result<(), Box<dyn std::error::Error>> {
    let stream_builder = if let Some(device_name) = selected_device {
        if device_name == "Default" {
            debug!("Using default device");
            OutputStreamBuilder::from_default_device()?
        } else {
            let host = crate::audio_toolkit::get_cpal_host();
            let devices = host.output_devices()?;

            let mut found_device = None;
            for device in devices {
                if device.name()? == device_name {
                    found_device = Some(device);
                    break;
                }
            }

            match found_device {
                Some(device) => OutputStreamBuilder::from_device(device)?,
                None => {
                    warn!("Device '{}' not found, using default device", device_name);
                    OutputStreamBuilder::from_default_device()?
                }
            }
        }
    } else {
        debug!("Using default device");
        OutputStreamBuilder::from_default_device()?
    };

    let stream_handle = stream_builder.open_stream()?;
    let mixer = stream_handle.mixer();

    let file = File::open(path)?;
    let buf_reader = BufReader::new(file);

    let sink = rodio::play(mixer, buf_reader)?;
    sink.set_volume(volume);
    sink.sleep_until_end();

    Ok(())
}
