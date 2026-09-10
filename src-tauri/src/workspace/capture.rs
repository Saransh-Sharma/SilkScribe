use super::{types::*, Workspace};
use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::Manager;
pub struct Recording {
    pub document_id: String,
}
#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn ss_capture_call(json: *const std::ffi::c_char) -> *mut std::ffi::c_char;
    fn ss_capture_free(json: *mut std::ffi::c_char);
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
        if let Some(error) = result.get("error").and_then(Value::as_str) {
            bail!("{error}");
        }
        Ok(result)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        bail!("Meeting recording is currently available on macOS.")
    }
}
pub fn start(
    app: &tauri::AppHandle,
    ws: &Arc<Workspace>,
    options: RecordingOptions,
) -> Result<RecordingStatus> {
    let mut recording = ws.recording.lock().unwrap();
    if recording.is_some()
        || app
            .state::<Arc<crate::managers::audio::AudioRecordingManager>>()
            .is_recording()
    {
        bail!("Another recording is active. Stop it before starting a meeting.");
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
    // Reserve microphone ownership before crossing the native bridge.
    *recording = Some(Recording {
        document_id: doc.id.clone(),
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
    if app.try_state::<tauri::tray::TrayIcon>().is_some() {
        crate::tray::update_tray_menu(app, &crate::tray::TrayIconState::Idle, None);
    }
    ws.emit(app);
    status(ws)
}
pub fn status(ws: &Workspace) -> Result<RecordingStatus> {
    let recording = ws.recording.lock().unwrap();
    let Some(r) = recording.as_ref() else {
        return Ok(RecordingStatus::default());
    };
    let value = call(json!({"operation":"status"}));
    match value {
        Ok(v) => Ok(RecordingStatus {
            document_id: Some(r.document_id.clone()),
            paused: v["paused"].as_bool().unwrap_or(false),
            seconds: v["seconds"].as_f64().unwrap_or(0.0),
            microphone_level: v["microphone_level"].as_f64().unwrap_or(0.0),
            system_level: v["system_level"].as_f64().unwrap_or(0.0),
            error: None,
        }),
        Err(e) => Ok(RecordingStatus {
            document_id: Some(r.document_id.clone()),
            error: Some(e.to_string()),
            ..Default::default()
        }),
    }
}
pub fn control(
    app: &tauri::AppHandle,
    ws: &Arc<Workspace>,
    operation: &str,
) -> Result<RecordingStatus> {
    if !["pause", "resume", "stop"].contains(&operation) {
        bail!("Unknown recording operation");
    }
    let mut recording = ws.recording.lock().unwrap();
    let Some(r) = recording.as_ref() else {
        bail!("No meeting is recording");
    };
    let mut doc = ws.store.get(&r.document_id)?;
    call(json!({"operation":operation}))?;
    doc.stage = match operation {
        "pause" => Stage::Paused,
        "resume" => Stage::Recording,
        _ => Stage::Queued,
    };
    ws.store.put(&doc)?;
    if operation == "stop" {
        *recording = None;
    }
    drop(recording);
    if app.try_state::<tauri::tray::TrayIcon>().is_some() {
        crate::tray::update_tray_menu(app, &crate::tray::TrayIconState::Idle, None);
    }
    ws.emit(app);
    if operation == "stop" {
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
        let source = reader.into_inner();
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
                Ok(()) => return Ok(Some(f32::from_le_bytes(bytes))),
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
    std::fs::rename(temporary, path)?;
    Ok(())
}
