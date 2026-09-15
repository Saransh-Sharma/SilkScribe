use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::{Emitter, Manager};
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct Artifact {
    pub path: String,
    pub url: String,
    pub sha256: String,
    pub bytes: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ModelPack {
    pub id: String,
    pub name: String,
    pub purpose: String,
    pub revision: String,
    pub license: String,
    pub languages: Vec<String>,
    pub artifacts: Vec<Artifact>,
    pub minimum_memory_gb: u32,
    #[serde(default)]
    pub installed: bool,
}
pub fn valid_relative(path: &str) -> bool {
    !path.is_empty()
        && Path::new(path)
            .components()
            .all(|c| matches!(c, std::path::Component::Normal(_)))
        && !path.contains('\\')
}
pub fn catalog(app: &tauri::AppHandle) -> Result<Vec<ModelPack>> {
    let path = app.path().resolve(
        "resources/local-models.json",
        tauri::path::BaseDirectory::Resource,
    )?;
    let mut packs: Vec<ModelPack> = serde_json::from_slice(&std::fs::read(path)?)?;
    let root = crate::portable::app_data_dir(app)?.join("local-models");
    for pack in &mut packs {
        if !valid_relative(&pack.id) || pack.id.contains('/') {
            bail!("Invalid model pack identifier");
        }
        let installed = root.join(&pack.id).join("installed.json");
        pack.installed = std::fs::read(installed)
            .ok()
            .and_then(|s| serde_json::from_slice::<ModelPack>(&s).ok())
            .is_some_and(|p| {
                p.id == pack.id
                    && p.revision == pack.revision
                    && !p.artifacts.is_empty()
                    && p.artifacts.len() == pack.artifacts.len()
                    && p.artifacts
                        .iter()
                        .zip(&pack.artifacts)
                        .all(|(installed, expected)| {
                            installed.path == expected.path
                                && installed.sha256 == expected.sha256
                                && installed.bytes == expected.bytes
                                && valid_relative(&expected.path)
                                && std::fs::metadata(root.join(&pack.id).join(&expected.path))
                                    .is_ok_and(|m| m.is_file() && m.len() == expected.bytes)
                        })
            });
    }
    Ok(packs)
}
pub fn model_path(app: &tauri::AppHandle, id: &str) -> Result<PathBuf> {
    let packs = catalog(app)?;
    let pack = packs
        .iter()
        .find(|p| p.id == id)
        .context("Unknown model pack")?;
    if !pack.installed {
        bail!(
            "Download {} in Settings → Models & language first.",
            pack.name
        );
    }
    Ok(crate::portable::app_data_dir(app)?
        .join("local-models")
        .join(id))
}
pub async fn install(
    app: tauri::AppHandle,
    id: String,
    cancelled: &std::sync::atomic::AtomicBool,
) -> Result<()> {
    let pack = catalog(&app)?
        .into_iter()
        .find(|p| p.id == id)
        .context("Unknown model pack")?;
    if pack.artifacts.is_empty() {
        bail!("This model bundle has not been published yet. Publish the generated model manifest with its download URLs first.");
    }
    let root = crate::portable::app_data_dir(&app)?.join("local-models");
    std::fs::create_dir_all(&root)?;
    let temp = root.join(format!(".{}.download", pack.id));
    std::fs::create_dir_all(&temp)?;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(1800))
        .build()?;
    let total = pack.artifacts.iter().map(|a| a.bytes).sum::<u64>();
    let existing = pack
        .artifacts
        .iter()
        .map(|a| {
            std::fs::metadata(temp.join(&a.path))
                .map(|m| m.len().min(a.bytes))
                .unwrap_or(0)
        })
        .sum::<u64>();
    if fs4::available_space(&root)? < total.saturating_sub(existing) + 512 * 1024 * 1024 {
        bail!("Not enough disk space for this model. Free space and retry; partial downloads are kept.");
    }

    let mut complete = 0u64;
    for artifact in &pack.artifacts {
        if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
            bail!("Download paused. Partial files are saved; choose Resume to continue.");
        }
        if !valid_relative(&artifact.path)
            || artifact.path == "installed.json"
            || artifact.sha256.len() != 64
            || !artifact.url.starts_with("https://")
        {
            bail!("Invalid model artifact manifest");
        }
        let path = temp.join(&artifact.path);
        std::fs::create_dir_all(path.parent().unwrap())?;
        let mut offset = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if offset > artifact.bytes {
            std::fs::remove_file(&path)?;
            offset = 0;
        }
        if offset < artifact.bytes {
            let mut request = client.get(&artifact.url);
            if offset > 0 {
                request = request.header(reqwest::header::RANGE, format!("bytes={offset}-"));
            }
            let mut response = request.send().await?.error_for_status()?;
            let append = response.status() == reqwest::StatusCode::PARTIAL_CONTENT && offset > 0;
            if append {
                let expected = format!("bytes {offset}-");
                if !response
                    .headers()
                    .get(reqwest::header::CONTENT_RANGE)
                    .and_then(|h| h.to_str().ok())
                    .is_some_and(|h| h.starts_with(&expected))
                {
                    bail!("Invalid resumed download range");
                }
            } else {
                offset = 0;
            }
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .append(append)
                .truncate(!append)
                .open(&path)?;
            while let Some(chunk) = response.chunk().await? {
                if cancelled.load(std::sync::atomic::Ordering::Relaxed) {
                    file.sync_all()?;
                    bail!("Download paused. Partial files are saved; choose Resume to continue.");
                }
                file.write_all(&chunk)?;
                offset += chunk.len() as u64;
                if offset > artifact.bytes {
                    bail!("Model download exceeds its manifest size");
                }
                let _ = app.emit(
                    "workspace-download",
                    serde_json::json!({"id":id,"downloaded":complete+offset,"total":total}),
                );
            }
            file.sync_all()?;
        }
        let mut file = std::fs::File::open(&path)?;
        let mut hash = Sha256::new();
        let mut buffer = [0u8; 65536];
        loop {
            let n = file.read(&mut buffer)?;
            if n == 0 {
                break;
            }
            hash.update(&buffer[..n]);
        }
        if offset != artifact.bytes
            || format!("{:x}", hash.finalize()) != artifact.sha256.to_lowercase()
        {
            std::fs::remove_file(&path)?;
            bail!("Model checksum failed. Retry the download.");
        }
        complete += offset;
    }
    std::fs::write(
        temp.join("installed.json"),
        serde_json::to_vec_pretty(&pack)?,
    )?;
    let dest = root.join(&pack.id);
    let previous = root.join(format!(".{}.previous", pack.id));
    if previous.exists() {
        std::fs::remove_dir_all(&previous)?;
    }
    if dest.exists() {
        std::fs::rename(&dest, &previous)?;
    }
    if let Err(e) = std::fs::rename(&temp, &dest) {
        if previous.exists() {
            let _ = std::fs::rename(&previous, &dest);
        }
        return Err(e.into());
    }
    if previous.exists() {
        std::fs::remove_dir_all(previous)?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confines_artifact_paths() {
        for p in ["../weights", "/tmp/x", "weights/../../x", "a\\b", ""] {
            assert!(!valid_relative(p));
        }
        assert!(valid_relative("embedding/model.safetensors"));
    }
}

#[derive(Serialize, specta::Type)]
pub struct PackVerification {
    pub valid: bool,
    pub damaged: Vec<String>,
}
pub fn verify_at(root: &Path, pack: &ModelPack) -> Result<PackVerification> {
    let mut damaged = Vec::new();
    for artifact in &pack.artifacts {
        if !valid_relative(&artifact.path) {
            bail!("Invalid model artifact path");
        }
        let valid = (|| -> Result<bool> {
            let mut file = std::fs::File::open(root.join(&artifact.path))?;
            if file.metadata()?.len() != artifact.bytes {
                return Ok(false);
            }
            let mut hash = Sha256::new();
            let mut buffer = [0u8; 65536];
            loop {
                let n = file.read(&mut buffer)?;
                if n == 0 {
                    break;
                }
                hash.update(&buffer[..n]);
            }
            Ok(format!("{:x}", hash.finalize()) == artifact.sha256.to_lowercase())
        })()
        .unwrap_or(false);
        if !valid {
            damaged.push(artifact.path.clone());
        }
    }
    Ok(PackVerification {
        valid: !pack.artifacts.is_empty() && damaged.is_empty(),
        damaged,
    })
}
#[cfg(test)]
mod verification_tests {
    use super::*;
    #[test]
    fn same_size_corruption_fails_verification() {
        let dir = tempfile::tempdir().unwrap();
        let artifact = Artifact {
            path: "model.bin".into(),
            url: "https://example.test/model.bin".into(),
            sha256: format!("{:x}", Sha256::digest(b"good")),
            bytes: 4,
        };
        let pack = ModelPack {
            id: "test".into(),
            name: "Test".into(),
            purpose: "notes".into(),
            revision: "one".into(),
            license: "test".into(),
            languages: vec![],
            artifacts: vec![artifact],
            minimum_memory_gb: 1,
            installed: true,
        };
        std::fs::write(dir.path().join("model.bin"), b"good").unwrap();
        assert!(verify_at(dir.path(), &pack).unwrap().valid);
        std::fs::write(dir.path().join("model.bin"), b"oops").unwrap();
        assert!(!verify_at(dir.path(), &pack).unwrap().valid);
    }
}
