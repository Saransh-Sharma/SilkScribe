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
) -> Result<Vec<Document>, String> {
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
pub async fn workspace_import(
    app: AppHandle,
    paths: Vec<String>,
    options: JobOptions,
) -> Result<ImportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ws = ws(&app);
        let result = ws.import(paths, options).map_err(|e| e.to_string())?;
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
) -> Result<(), String> {
    let ws = ws(&app);
    ws.retry(&id, notes_only, notes_model)
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
) -> Result<(), String> {
    let doc = ws(&app).store.get(&id).map_err(|e| e.to_string())?;
    let text = export::render(&doc, &format).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
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
    if ws.installing.swap(true, Ordering::SeqCst) {
        return Err("Another model download is in progress".into());
    }
    let result = packs::install(app.clone(), id)
        .await
        .map_err(|e| e.to_string());
    ws.installing.store(false, Ordering::SeqCst);
    ws.emit(&app);
    result
}
#[tauri::command]
#[specta::specta]
pub async fn workspace_runtime_ready(app: AppHandle) -> Result<bool, String> {
    Ok(worker::binary(&app, false).is_ok() && worker::binary(&app, true).is_ok())
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
