use super::{capture, export, packs, types::*, worker, Workspace};
use std::sync::{atomic::Ordering, Arc};
use tauri::{AppHandle, Manager};
fn ws(app: &AppHandle) -> Arc<Workspace> {
    app.state::<Arc<Workspace>>().inner().clone()
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_list(
    app: AppHandle,
    query: Option<String>,
    filter: Option<String>,
    offset: Option<u32>,
) -> Result<Vec<DocumentSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ws(&app)
            .list(
                query.as_deref(),
                filter.as_deref(),
                100,
                offset.unwrap_or(0) as usize,
            )
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_get(app: AppHandle, id: String) -> Result<Document, String> {
    ws(&app).store.get(&id).map_err(|e| e.to_string())
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_import_batches(app: AppHandle) -> Result<Vec<ImportBatch>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ws(&app).store.batches().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_discard_import_batch(
    app: AppHandle,
    request_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ws = ws(&app);
        if ws.importing.swap(true, Ordering::SeqCst) {
            return Err("Wait for the current import to stop.".into());
        }
        let result = (|| -> anyhow::Result<()> {
            if let Some(batch) = ws
                .store
                .batches()?
                .into_iter()
                .find(|batch| batch.request_id == request_id)
            {
                for path in batch.paths {
                    let partial = super::decode::partial_copy_path(
                        &ws.store.media,
                        std::path::Path::new(&path),
                    )?;
                    match std::fs::remove_file(partial) {
                        Ok(()) => {}
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                        Err(e) => return Err(e.into()),
                    }
                }
            }
            ws.store.discard_batch(&request_id)
        })();
        ws.importing.store(false, Ordering::SeqCst);
        result.map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_get_draft(app: AppHandle, id: String) -> Result<Option<Document>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ws(&app).store.draft(&id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_save_draft(app: AppHandle, draft: Document) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        ws(&app).store.save_draft(&draft).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_discard_draft(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        ws(&app).store.discard_draft(&id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_import(
    app: AppHandle,
    paths: Vec<String>,
    options: JobOptions,
    request_id: String,
) -> Result<ImportResult, String> {
    if request_id.is_empty() || request_id.len() > 128 || paths.len() > 500 {
        return Err("Invalid import request".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let ws = ws(&app);
        let assessment = super::readiness::assess(&app, &options).map_err(|e| e.to_string())?;
        if !assessment.can_process {
            return Err(
                "Complete model setup or remove unavailable optional steps before importing."
                    .into(),
            );
        }
        if ws.importing.swap(true, Ordering::SeqCst) {
            return Err("Another audio import is already in progress.".into());
        }
        ws.import_cancelled.store(false, Ordering::SeqCst);
        let result = (|| {
            super::readiness::verify_runtimes(&app, &options, &ws.import_cancelled)
                .map_err(|error| format!("Local model runtime is not ready: {error}"))?;
            if ws.import_cancelled.load(Ordering::SeqCst) {
                return Err("Import cancelled before copying audio.".into());
            }
            ws.import(&app, paths, options, request_id)
                .map_err(|e| e.to_string())
        })();
        ws.importing.store(false, Ordering::SeqCst);
        let result = result?;
        ws.emit(&app);
        ws.start_queue(app);
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_edit(app: AppHandle, edit: DocumentEdit) -> Result<Document, String> {
    let ws = ws(&app);
    let doc = ws.edit(edit).map_err(|e| e.to_string())?;
    ws.emit(&app);
    Ok(doc)
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_cancel(app: AppHandle, id: String) -> Result<(), String> {
    let ws = ws(&app);
    ws.cancel(&id).map_err(|e| e.to_string())?;
    ws.emit(&app);
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_retry(
    app: AppHandle,
    id: String,
    notes_only: bool,
    notes_model: Option<String>,
    only_stage: Option<Stage>,
    notes_section: Option<NotesSection>,
) -> Result<(), String> {
    let ws = ws(&app);
    let doc = ws.store.get(&id).map_err(|e| e.to_string())?;
    let mut options = doc.options.clone();
    if let Some(model) = &notes_model {
        options.notes_model = Some(model.clone());
    }
    let notes_only = notes_only
        || only_stage == Some(Stage::Notes)
        || (only_stage.is_none()
            && doc.failed_stage == Some(Stage::Notes)
            && options.notes_model.is_some());
    let speakers_only = only_stage == Some(Stage::Diarizing);
    let assessment = super::readiness::assess_steps(
        &app,
        &options,
        !notes_only && doc.segments.is_empty(),
        !notes_only && options.speakers && !doc.diarized,
        !speakers_only && (notes_only || (doc.notes.is_none() && options.notes_model.is_some())),
    )
    .map_err(|e| e.to_string())?;
    if !assessment.can_process {
        return Err(
            "Set up the selected models in Settings → Models & language before retrying.".into(),
        );
    }
    ws.retry(&id, notes_only, notes_model, only_stage, notes_section)
        .map_err(|e| e.to_string())?;
    ws.start_queue(app.clone());
    ws.emit(&app);
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_delete(app: AppHandle, id: String, audio_only: bool) -> Result<(), String> {
    let ws = ws(&app);
    ws.remove(&id, audio_only).map_err(|e| e.to_string())?;
    ws.emit(&app);
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_export(
    app: AppHandle,
    id: String,
    format: String,
    path: String,
    content: Option<export::ExportContent>,
) -> Result<(), String> {
    let doc = ws(&app).store.get(&id).map_err(|e| e.to_string())?;
    let text = export::render_content(&doc, &format, content).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_export_preview(
    app: AppHandle,
    id: String,
    format: String,
    content: Option<export::ExportContent>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let doc = ws(&app).store.get(&id).map_err(|e| e.to_string())?;
        export::render_content(&doc, &format, content).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_packs(app: AppHandle) -> Result<Vec<packs::ModelPack>, String> {
    packs::catalog(&app).map_err(|e| e.to_string())
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_install_pack(app: AppHandle, id: String) -> Result<(), String> {
    let ws = ws(&app);
    {
        let _guard = ws.lock.lock().unwrap();
        if ws.active.lock().unwrap().is_some() {
            return Err(
                "Wait for processing to finish before installing or repairing models.".into(),
            );
        }
        if ws.installing.swap(true, Ordering::SeqCst) {
            return Err("Another model download is in progress".into());
        }
        ws.download_cancelled.store(false, Ordering::SeqCst);
    }
    let result = packs::install(app.clone(), id, &ws.download_cancelled)
        .await
        .map_err(|e| e.to_string());
    ws.installing.store(false, Ordering::SeqCst);
    ws.emit(&app);
    ws.start_queue(app.clone());
    result
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_runtime_ready(app: AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if worker::binary(&app, false).is_err() || worker::binary(&app, true).is_err() {
            return Ok(false);
        }
        worker::health(&app, false).map_err(|e| format!("Speech runtime: {e}"))?;
        worker::health(&app, true).map_err(|e| format!("Notes runtime: {e}"))?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_recording_status(app: AppHandle) -> Result<RecordingStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        capture::status(&ws(&app)).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_recording_start(
    app: AppHandle,
    options: RecordingOptions,
) -> Result<RecordingStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        capture::start(&app, &ws(&app), options).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_recording_control(
    app: AppHandle,
    operation: String,
) -> Result<RecordingStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        capture::control(&app, &ws(&app), &operation).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_capture_devices() -> Result<Vec<CaptureDevice>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let result =
            capture::call(serde_json::json!({"operation":"devices"})).map_err(|e| e.to_string())?;
        serde_json::from_value(result["devices"].clone()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_assess(
    app: AppHandle,
    options: JobOptions,
) -> Result<super::readiness::WorkflowAssessment, String> {
    super::readiness::assess(&app, &options).map_err(|e| e.to_string())
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_playback(app: AppHandle, id: String) -> Result<Option<String>, String> {
    let workspace = ws(&app);
    let doc = workspace.store.get(&id).map_err(|e| e.to_string())?;
    if doc.audio_path.is_none() {
        return Ok(None);
    }
    let normalized = workspace.store.media.join(format!("{}.pcm.wav", id));
    if normalized.is_file() {
        return Ok(Some(normalized.to_string_lossy().into()));
    }
    Ok(doc.audio_path.filter(|p| std::path::Path::new(p).is_file()))
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_cancel_download(app: AppHandle) -> Result<(), String> {
    ws(&app).download_cancelled.store(true, Ordering::SeqCst);
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_remove_pack(app: AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || remove_pack(&app, id))
        .await
        .map_err(|e| e.to_string())?
}
fn remove_pack(app: &AppHandle, id: String) -> Result<(), String> {
    let workspace = ws(&app);
    let _guard = workspace.lock.lock().unwrap();
    if workspace.active.lock().unwrap().is_some() || workspace.installing.load(Ordering::SeqCst) {
        return Err("Stop processing and downloads before removing a model.".into());
    }
    if !packs::catalog(&app)
        .map_err(|e| e.to_string())?
        .iter()
        .any(|p| p.id == id)
    {
        return Err("Unknown model pack".into());
    }
    let root = crate::portable::app_data_dir(&app)
        .map_err(|e| e.to_string())?
        .join("local-models");
    for name in [
        id.clone(),
        format!(".{id}.download"),
        format!(".{id}.previous"),
    ] {
        let path = root.join(name);
        if path.exists() {
            std::fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        }
    }
    workspace.emit(&app);
    Ok(())
}
#[derive(serde::Serialize, specta::Type)]
pub struct WorkspaceStorage {
    pub audio_bytes: u64,
    pub model_bytes: u64,
    pub free_bytes: u64,
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_storage(app: AppHandle) -> Result<WorkspaceStorage, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fn size(path: &std::path::Path) -> u64 {
            std::fs::read_dir(path)
                .into_iter()
                .flatten()
                .flatten()
                .map(|entry| {
                    let kind = entry.file_type().ok();
                    if kind.is_some_and(|k| k.is_symlink()) {
                        0
                    } else if kind.is_some_and(|k| k.is_dir()) {
                        size(&entry.path())
                    } else {
                        entry.metadata().map(|m| m.len()).unwrap_or(0)
                    }
                })
                .sum()
        }
        let root = crate::portable::app_data_dir(&app).map_err(|e| e.to_string())?;
        Ok(WorkspaceStorage {
            audio_bytes: size(&root.join("workspace-audio")) + size(&root.join("recordings")),
            model_bytes: size(&root.join("local-models")) + size(&root.join("models")),
            free_bytes: fs4::available_space(root).map_err(|e| e.to_string())?,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_configure_job(
    app: AppHandle,
    id: String,
    options: JobOptions,
) -> Result<(), String> {
    let workspace = ws(&app);
    let _guard = workspace.lock.lock().unwrap();
    let mut doc = workspace.store.get(&id).map_err(|e| e.to_string())?;
    if workspace.active.lock().unwrap().as_deref() == Some(&id)
        || doc.stage.active()
        || matches!(doc.stage, Stage::Recording | Stage::Paused | Stage::Queued)
    {
        return Err("Stop processing before changing job options.".into());
    }
    if !doc.segments.is_empty()
        && (options.model != doc.options.model || options.language != doc.options.language)
    {
        return Err("Existing transcript text is preserved. Change only speaker and notes options for this job.".into());
    }
    doc.options = options;
    doc.stage_errors.retain(|error| match error.stage {
        Stage::Diarizing => doc.options.speakers,
        Stage::Notes => doc.options.notes_model.is_some(),
        _ => true,
    });
    doc.error = None;
    if (doc.failed_stage == Some(Stage::Notes) && doc.options.notes_model.is_none())
        || (doc.failed_stage == Some(Stage::Diarizing) && !doc.options.speakers)
    {
        doc.failed_stage = None;
    }
    workspace.store.put(&doc).map_err(|e| e.to_string())?;
    workspace.emit(&app);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_resolve_notes(
    app: AppHandle,
    id: String,
    accept: bool,
    expected_revision: u32,
    section: Option<String>,
) -> Result<Document, String> {
    let workspace = ws(&app);
    let _guard = workspace.lock.lock().unwrap();
    let doc = workspace
        .store
        .resolve_notes(&id, accept, expected_revision, section.as_deref())
        .map_err(|e| e.to_string())?;
    workspace.emit(&app);
    Ok(doc)
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_inspect_files(
    paths: Vec<String>,
) -> Result<Vec<super::decode::FileInspection>, String> {
    if paths.len() > 500 {
        return Err("Select at most 500 files in one batch.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        paths
            .into_iter()
            .map(|path| {
                let result = super::decode::inspect(std::path::Path::new(&path));
                match result {
                    Ok((bytes, duration)) => super::decode::FileInspection {
                        path,
                        bytes,
                        duration,
                        error: None,
                    },
                    Err(error) => super::decode::FileInspection {
                        path,
                        bytes: 0,
                        duration: None,
                        error: Some(error.to_string()),
                    },
                }
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_verify_pack(
    app: AppHandle,
    id: String,
) -> Result<packs::PackVerification, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let workspace = ws(&app);
        let _guard = workspace.lock.lock().unwrap();
        if workspace.installing.load(Ordering::SeqCst) || workspace.active.lock().unwrap().is_some()
        {
            return Err(
                "Wait for processing and downloads to finish before verifying models.".into(),
            );
        }
        let pack = packs::catalog(&app)
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|pack| pack.id == id)
            .ok_or("Unknown model pack")?;
        let root = crate::portable::app_data_dir(&app)
            .map_err(|e| e.to_string())?
            .join("local-models")
            .join(&id);
        packs::verify_at(&root, &pack).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_cancel_import(app: AppHandle) -> Result<(), String> {
    ws(&app).import_cancelled.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn workspace_discard_partial_import(app: AppHandle, path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ws = ws(&app);
        if ws.importing.swap(true, Ordering::SeqCst) {
            return Err("Wait for the current import to stop before removing a file.".into());
        }
        let result = (|| -> anyhow::Result<()> {
            let partial =
                super::decode::partial_copy_path(&ws.store.media, std::path::Path::new(&path))?;
            match std::fs::remove_file(partial) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(error.into()),
            }
        })();
        ws.importing.store(false, Ordering::SeqCst);
        result.map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}
