use anyhow::{bail, Context, Result};
use serde_json::Value;
use std::{
    io::{Read, Write},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};
use tauri::Manager;
/// Successful checks are process-local and tied to the installed runtime bytes.
/// Import checks share inference admission so loading Python dependencies cannot
/// compete with an active model stage. No model weights are loaded here.
pub fn health(app: &tauri::AppHandle, notes: bool) -> Result<()> {
    health_cancellable(app, notes, &std::sync::atomic::AtomicBool::new(false))
}
fn cancellable_lock<'a, T>(
    mutex: &'a Mutex<T>,
    cancelled: &std::sync::atomic::AtomicBool,
) -> Result<std::sync::MutexGuard<'a, T>> {
    loop {
        if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
            bail!("Cancelled");
        }
        match mutex.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(std::sync::TryLockError::Poisoned(_)) => {
                bail!("Runtime health state is unavailable")
            }
            Err(std::sync::TryLockError::WouldBlock) => thread::sleep(Duration::from_millis(50)),
        }
    }
}
pub fn health_cancellable(
    app: &tauri::AppHandle,
    notes: bool,
    cancelled: &std::sync::atomic::AtomicBool,
) -> Result<()> {
    static CHECKED: std::sync::OnceLock<Mutex<std::collections::HashSet<String>>> =
        std::sync::OnceLock::new();
    let runtime = binary(app, notes)?;
    let key = fingerprint(&runtime)?;
    let mut checked = cancellable_lock(CHECKED.get_or_init(Default::default), cancelled)?;
    if checked.contains(&key) {
        return Ok(());
    }
    let response = run(
        app,
        serde_json::json!({"protocol":1,"task":"health","kind":if notes {"notes"} else {"speech"}}),
        &Arc::new(Mutex::new(None)),
        cancelled,
    )?;
    if response["ready"] != true {
        bail!("Local runtime dependency check failed");
    }
    checked.insert(key);
    Ok(())
}
/// Runtime identity used by resumable work and successful dependency checks.
/// A packaged manifest covers worker code and every bundled dependency.
pub fn fingerprint(runtime: &std::path::Path) -> Result<String> {
    use sha2::{Digest, Sha256};
    let metadata = std::fs::metadata(runtime)?;
    let manifest = std::fs::read(
        runtime
            .parent()
            .context("Missing runtime directory")?
            .join("runtime-manifest.json"),
    )
    .unwrap_or_default();
    Ok(format!(
        "{}:{}:{:?}:{:x}",
        runtime.display(),
        metadata.len(),
        metadata.modified()?,
        Sha256::digest(manifest)
    ))
}
pub fn binary(app: &tauri::AppHandle, notes: bool) -> Result<std::path::PathBuf> {
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        bail!("The premium local AI runtime currently requires Apple Silicon macOS. Existing dictation models remain available.");
    }
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
    let runtime = binary(
        app,
        request["task"] == "notes" || (request["task"] == "health" && request["kind"] == "notes"),
    )?;
    let root = crate::portable::app_data_dir(app)?;
    let note_model = (request["task"] == "notes")
        .then(|| request["model_path"].as_str())
        .flatten()
        .map(std::path::Path::new);
    if let Some(model) = note_model {
        super::memory::admit(
            super::memory::observation(&root, model, &runtime).as_ref(),
            super::memory::available(),
        )?;
    }
    let mut child = Command::new(&runtime)
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
        let mut reader = stderr;
        let mut buffer = [0u8; 8192];
        while reader.read(&mut buffer).unwrap_or(0) > 0 {}
    });
    *child_slot.lock().unwrap() = Some(child);
    let started = std::time::Instant::now();
    let mut timed_out = false;
    let status = loop {
        let mut slot = child_slot.lock().unwrap();
        let child = slot.as_mut().context("Worker disappeared")?;
        if request["task"] == "health" && started.elapsed() > Duration::from_secs(240) {
            timed_out = true;
            let _ = child.kill();
        }
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
    if timed_out {
        bail!("Local runtime dependency check timed out");
    }
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
    if let Some(model) = note_model {
        if let Err(error) = super::memory::record(&root, model, &runtime, &response["metrics"]) {
            log::warn!("Could not save local memory observation: {error}");
        }
    }
    Ok(response["result"].clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn waiting_health_check_can_cancel_without_acquiring_the_lock() {
        let mutex = Arc::new(Mutex::new(()));
        let cancelled = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let guard = mutex.lock().unwrap();
        let waiting = mutex.clone();
        let flag = cancelled.clone();
        let (send, receive) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            send.send(cancellable_lock(&waiting, &flag).is_err())
                .unwrap();
        });
        cancelled.store(true, std::sync::atomic::Ordering::Relaxed);
        assert!(receive.recv_timeout(Duration::from_secs(1)).unwrap());
        drop(guard);
        thread.join().unwrap();
    }
    #[test]
    fn checkpoint_runtime_identity_changes_with_dependency_manifest() {
        let dir = tempfile::tempdir().unwrap();
        let binary = dir.path().join("worker");
        std::fs::write(&binary, "binary").unwrap();
        let first = fingerprint(&binary).unwrap();
        assert_eq!(first, fingerprint(&binary).unwrap());
        std::fs::write(dir.path().join("runtime-manifest.json"), "dependencies-v1").unwrap();
        let second = fingerprint(&binary).unwrap();
        assert_ne!(first, second);
        std::fs::write(dir.path().join("runtime-manifest.json"), "dependencies-v2").unwrap();
        assert_ne!(second, fingerprint(&binary).unwrap());
    }
}
