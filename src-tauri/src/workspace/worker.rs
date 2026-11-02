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
        bail!("These engines need a Mac with Apple silicon. Dictation still works.");
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
        // Called on every readiness check, so keep this at debug level.
        log::debug!(
            "Local AI runtime missing at {}. Package it with `bun run local:runtime` before distributing the app.",
            path.display()
        );
        bail!("This build doesn't include these engines.");
    }
    Ok(path)
}
/// Memory below which any worker frees the dictation engine first.
const LOW_MEMORY: u64 = 2 * 1024 * 1024 * 1024;
/// Free memory a question needs to leave the dictation engine loaded: room for
/// the 9B notes model with some to spare.
const ASK_HEADROOM: u64 = 10 * 1024 * 1024 * 1024;

/// Whether to unload the dictation engine before running a worker task.
fn should_evict(task: Option<&str>, uses_notes_model: bool, available: u64) -> bool {
    if available < LOW_MEMORY {
        return true;
    }
    match task {
        Some("ask") => available < ASK_HEADROOM,
        _ => uses_notes_model,
    }
}

/// How long a task may run before it's stopped. Processing a long meeting
/// legitimately takes as long as it takes.
fn time_limit(task: Option<&str>) -> Option<Duration> {
    match task {
        Some("health") => Some(Duration::from_secs(240)),
        // Loading the model cold and answering fits well inside this.
        Some("ask") => Some(Duration::from_secs(180)),
        _ => None,
    }
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
    // Asking a question loads the same notes model.
    let uses_notes_model = matches!(request["task"].as_str(), Some("notes" | "ask"));
    let note_model = uses_notes_model
        .then(|| request["model_path"].as_str())
        .flatten()
        .map(std::path::Path::new);
    // Workers run out of process and don't block dictation. Only free the
    // dictation engine's memory for a large notes model or when memory is tight.
    // A question is answered while someone may be about to dictate, so it keeps
    // the dictation engine loaded unless the Mac is short of room for both.
    let evict = should_evict(
        request["task"].as_str(),
        note_model.is_some(),
        super::memory::available(),
    );
    let manager = app.state::<Arc<crate::managers::transcription::TranscriptionManager>>();
    let _job = manager.external_job(cancelled, evict)?;
    if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
        bail!("Cancelled");
    }
    let runtime = binary(
        app,
        uses_notes_model || (request["task"] == "health" && request["kind"] == "notes"),
    )?;
    let root = crate::portable::app_data_dir(app)?;
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
        if let Some(limit) = time_limit(request["task"].as_str()) {
            if started.elapsed() > limit {
                timed_out = true;
                let _ = child.kill();
            }
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
        if request["task"] == "ask" {
            bail!("ask:timeout");
        }
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
    fn questions_keep_the_dictation_engine_when_there_is_room() {
        const GB: u64 = 1024 * 1024 * 1024;
        assert!(!should_evict(Some("ask"), true, 24 * GB));
        assert!(should_evict(Some("ask"), true, 8 * GB));
        assert!(should_evict(Some("notes"), true, 24 * GB));
        assert!(!should_evict(Some("transcribe"), false, 24 * GB));
        assert!(should_evict(Some("transcribe"), false, GB));
        assert_eq!(time_limit(Some("ask")), Some(Duration::from_secs(180)));
        assert_eq!(time_limit(Some("notes")), None);
    }
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
