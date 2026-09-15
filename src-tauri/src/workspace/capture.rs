use super::{types::*, Workspace};
use anyhow::{bail, Result};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::Manager;
pub struct Recording {
    pub document_id: String,
    pub last_status: RecordingStatus,
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
    if fs4::available_space(&ws.store.media)? < 64 * 1024 * 1024 {
        bail!("Free disk space before starting a meeting recording.");
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
    if app.try_state::<tauri::tray::TrayIcon>().is_some() {
        crate::tray::update_tray_menu(app, &crate::tray::TrayIconState::Idle, None);
    }
    ws.emit(app);
    status(ws)
}
pub fn status(ws: &Workspace) -> Result<RecordingStatus> {
    let mut recording = ws.recording.lock().unwrap();
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
        bail!("Free disk space before resuming the meeting recording.");
    }
    let mut recording = ws.recording.lock().unwrap();
    let Some(r) = recording.as_ref() else {
        if matches!(operation, "stop" | "save") {
            return Ok(RecordingStatus::default());
        }
        bail!("No meeting is recording");
    };
    let mut doc = ws.store.get(&r.document_id)?;
    if let Err(error) = call(json!({"operation":if operation=="save" {"stop"} else {operation}})) {
        if operation == "stop" || operation == "save" {
            doc.duration = doc.duration.max(r.last_status.seconds);
            *recording = None;
            doc.stage = Stage::Interrupted;
            doc.failed_stage = Some(Stage::Recording);
            doc.error = Some(format!("Audio finalization needs recovery: {error}"));
            ws.store.put(&doc)?;
            drop(recording);
            if app.try_state::<tauri::tray::TrayIcon>().is_some() {
                crate::tray::update_tray_menu(app, &crate::tray::TrayIconState::Idle, None);
            }
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
    if operation == "stop" || operation == "save" {
        if operation == "save" || !can_process {
            doc.error =
                Some("Recording saved. Choose processing options to transcribe when ready.".into());
        }
        *recording = None;
    }
    ws.store.put(&doc)?;
    drop(recording);
    if app.try_state::<tauri::tray::TrayIcon>().is_some() {
        crate::tray::update_tray_menu(app, &crate::tray::TrayIconState::Idle, None);
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
