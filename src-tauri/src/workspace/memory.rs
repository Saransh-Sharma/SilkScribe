use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::Path;

/// Observations from this machine, not a quality benchmark or guaranteed bound.
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
pub struct MemoryObservation {
    pub peak_bytes: u64,
    pub samples: u32,
}

pub fn available() -> u64 {
    let mut system = sysinfo::System::new();
    system.refresh_memory_specifics(sysinfo::MemoryRefreshKind::nothing().with_ram());
    system.available_memory()
}

fn key(model: &Path, runtime: &Path) -> Result<String> {
    let metadata = std::fs::metadata(runtime)?;
    let signature = serde_json::json!({
        "model": std::fs::read_to_string(model.join("installed.json"))?,
        "runtime_bytes": metadata.len(), "runtime_modified": format!("{:?}", metadata.modified()?),
        // Produced after signing from every shipped runtime file. Older development
        // bundles still use executable metadata until they are repackaged.
        "runtime_manifest": runtime.parent().and_then(|dir|
            std::fs::read_to_string(dir.join("runtime-manifest.json")).ok()),
        "os": std::env::consts::OS, "arch": std::env::consts::ARCH,
    });
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&signature)?)
    ))
}
pub fn observation(root: &Path, model: &Path, runtime: &Path) -> Option<MemoryObservation> {
    let path = root
        .join("workspace-metrics")
        .join(format!("{}.json", key(model, runtime).ok()?));
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}
pub fn admit(observed: Option<&MemoryObservation>, headroom: u64) -> Result<()> {
    if let Some(observed) = observed {
        // Keep a 20% allowance above the largest observed worker allocation.
        if headroom > 0 && observed.peak_bytes.saturating_mul(6) / 5 > headroom {
            bail!("Available memory is below this model's observed requirement. Close other apps and retry, or explicitly choose another model.");
        }
    }
    Ok(())
}
pub fn record(
    root: &Path,
    model: &Path,
    runtime: &Path,
    metrics: &serde_json::Value,
) -> Result<()> {
    let peak = metrics["peak_rss_bytes"]
        .as_u64()
        .unwrap_or(0)
        .max(metrics["peak_device_bytes"].as_u64().unwrap_or(0));
    if peak == 0 {
        return Ok(());
    }
    let mut observed = observation(root, model, runtime).unwrap_or(MemoryObservation {
        peak_bytes: 0,
        samples: 0,
    });
    observed.peak_bytes = observed.peak_bytes.max(peak);
    observed.samples = observed.samples.saturating_add(1);
    let dir = root.join("workspace-metrics");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.json", key(model, runtime)?));
    let temp = path.with_extension("partial");
    let file = std::fs::File::create(&temp)?;
    serde_json::to_writer(&file, &observed)?;
    file.sync_all()?;
    std::fs::rename(temp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn admission_uses_observations_and_never_substitutes_models() {
        let observed = MemoryObservation {
            peak_bytes: 1000,
            samples: 2,
        };
        assert!(admit(Some(&observed), 1199).is_err());
        assert!(admit(Some(&observed), 1200).is_ok());
        assert!(admit(None, 100).is_ok());
        assert!(admit(Some(&observed), 0).is_ok());
    }
    #[test]
    fn observation_is_invalidated_by_model_or_runtime_changes() {
        let dir = tempfile::tempdir().unwrap();
        let model = dir.path().join("model");
        std::fs::create_dir(&model).unwrap();
        std::fs::write(model.join("installed.json"), "revision1").unwrap();
        let runtime = dir.path().join("worker");
        std::fs::write(&runtime, "worker1").unwrap();
        record(
            dir.path(),
            &model,
            &runtime,
            &serde_json::json!({"peak_rss_bytes":1000,"peak_device_bytes":2000}),
        )
        .unwrap();
        assert_eq!(
            observation(dir.path(), &model, &runtime)
                .unwrap()
                .peak_bytes,
            2000
        );
        std::fs::write(dir.path().join("runtime-manifest.json"), "dependencies-v2").unwrap();
        assert!(observation(dir.path(), &model, &runtime).is_none());
        std::fs::remove_file(dir.path().join("runtime-manifest.json")).unwrap();
        assert!(observation(dir.path(), &model, &runtime).is_some());
        std::fs::write(model.join("installed.json"), "revision2").unwrap();
        assert!(observation(dir.path(), &model, &runtime).is_none());
    }
}
