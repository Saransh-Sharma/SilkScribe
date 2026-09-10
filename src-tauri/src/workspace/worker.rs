use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Read, Write},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::Manager;
pub fn binary(app: &tauri::AppHandle, notes: bool) -> Result<std::path::PathBuf> {
    let name = if notes {
        "notes-worker"
    } else {
        "speech-worker"
    };
    let path = app.path().resolve(
        format!("resources/local-runtime/{name}/{name}"),
        tauri::path::BaseDirectory::Resource,
    )?;
    if !path.is_file() {
        bail!("The local AI runtime is not installed in this build. Package it with bun run local:runtime before distributing the app.");
    }
    Ok(path)
}
pub fn run(
    app: &tauri::AppHandle,
    request: Value,
    child_slot: &Arc<Mutex<Option<Child>>>,
    cancelled: &std::sync::atomic::AtomicBool,
) -> Result<Value> {
    while app
        .state::<Arc<crate::managers::audio::AudioRecordingManager>>()
        .is_recording()
    {
        if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
            bail!("Cancelled");
        }
        thread::sleep(Duration::from_millis(100));
    }
    let manager = app.state::<Arc<crate::managers::transcription::TranscriptionManager>>();
    let _inference = manager.external_inference(cancelled)?;
    if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
        bail!("Cancelled");
    }
    let mut child = Command::new(binary(app, request["task"] == "notes")?)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("HF_HUB_OFFLINE", "1")
        .env("TRANSFORMERS_OFFLINE", "1")
        .env("HF_HUB_DISABLE_TELEMETRY", "1")
        .env("PYANNOTE_METRICS_ENABLED", "0")
        .env("DO_NOT_TRACK", "1")
        .spawn()?;
    let stdout = child.stdout.take().context("Missing worker output pipe")?;
    let stderr = child.stderr.take().context("Missing worker error pipe")?;
    let mut stdin = child.stdin.take().context("Missing worker input pipe")?;
    writeln!(stdin, "{request}")?;
    drop(stdin);
    let output = thread::spawn(move || {
        let mut s = String::new();
        stdout
            .take(64 * 1024 * 1024)
            .read_to_string(&mut s)
            .map(|_| s)
    });
    let errors = thread::spawn(move || {
        // Drain logs without retaining transcript content or unbounded output.
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            line.clear();
        }
    });
    *child_slot.lock().unwrap() = Some(child);
    let status = loop {
        let mut slot = child_slot.lock().unwrap();
        let child = slot.as_mut().context("Worker disappeared")?;
        if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
            let _ = child.kill();
        }
        if let Some(status) = child.try_wait()? {
            *slot = None;
            break status;
        }
        drop(slot);
        thread::sleep(Duration::from_millis(100));
    };
    let text = output
        .join()
        .map_err(|_| anyhow::anyhow!("Worker output reader failed"))??;
    let _ = errors.join();
    if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
        bail!("Cancelled");
    }
    let response: Value =
        serde_json::from_str(&text).context("Local worker returned invalid output")?;
    if let Some(error) = response.get("error").and_then(Value::as_str) {
        bail!("{error}");
    }
    if !status.success() || response["protocol"] != 1 {
        bail!("Local worker exited unexpectedly");
    }
    Ok(response["result"].clone())
}
