pub mod capture;
mod checkpoint;
pub mod commands;
mod decode;
mod export;
pub mod live;
mod memory;
pub mod packs;
pub mod readiness;
pub(crate) mod store;
pub mod templates;
pub mod types;
mod worker;

use anyhow::{bail, Context, Result};
use std::{
    path::{Path, PathBuf},
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Listener, Manager};
use types::*;

pub struct Workspace {
    pub store: store::Store,
    pub root: PathBuf,
    lock: Mutex<()>,
    pub active: Mutex<Option<String>>,
    pub cancelled: AtomicBool,
    pub child: Arc<Mutex<Option<Child>>>,
    pub recording: Mutex<Option<capture::Recording>>,
    /// True while a meeting is recording or paused. Cheap to read from any thread,
    /// unlike `recording`, which is held across native capture calls.
    pub meeting_active: AtomicBool,
    /// The live transcript of the meeting being recorded. A leaf lock: never held
    /// while taking another lock or calling into capture.
    pub live: Mutex<Option<live::LiveSession>>,
    pub installing: AtomicBool,
    pub download_cancelled: AtomicBool,
    pub importing: AtomicBool,
    pub import_cancelled: AtomicBool,
    /// A question's worker, kept apart from the processing job's so stopping
    /// one doesn't stop the other. Questions wait for processing to finish.
    pub ask_child: Arc<Mutex<Option<Child>>>,
    pub ask_cancelled: AtomicBool,
}
impl Workspace {
    pub fn new(app: &tauri::AppHandle) -> Result<Arc<Self>> {
        let root = crate::portable::app_data_dir(app)?;
        let workspace = Arc::new(Self {
            store: store::Store::new(&root)?,
            root,
            lock: Mutex::new(()),
            active: Mutex::new(None),
            cancelled: AtomicBool::new(false),
            child: Arc::new(Mutex::new(None)),
            recording: Mutex::new(None),
            meeting_active: AtomicBool::new(false),
            live: Mutex::new(None),
            installing: AtomicBool::new(false),
            download_cancelled: AtomicBool::new(false),
            importing: AtomicBool::new(false),
            import_cancelled: AtomicBool::new(false),
            ask_child: Arc::new(Mutex::new(None)),
            ask_cancelled: AtomicBool::new(false),
        });
        workspace.store.sync_history(&workspace.root)?;
        let history_workspace = workspace.clone();
        let event_app = app.clone();
        app.listen("history-updated", move |_| {
            let workspace = history_workspace.clone();
            let app = event_app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let _lock = workspace.lock.lock().unwrap();
                if let Err(error) = workspace.store.sync_history(&workspace.root) {
                    log::error!("Workspace history synchronization failed: {error}");
                } else {
                    workspace.emit(&app);
                }
            });
        });
        Ok(workspace)
    }
    pub fn emit(&self, app: &tauri::AppHandle) {
        let _ = app.emit("workspace-updated", ());
    }
    pub fn list(
        &self,
        query: Option<&str>,
        filter: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<DocumentSummary>> {
        let _lock = self.lock.lock().unwrap();
        self.store.summaries(query, filter, limit, offset)
    }
    pub fn create(&self, title: String, source: Source, options: JobOptions) -> Result<Document> {
        let doc = Self::new_document(title, source, options);
        self.store.put(&doc)?;
        Ok(doc)
    }
    fn new_document(title: String, source: Source, options: JobOptions) -> Document {
        let id = format!(
            "{}-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            std::process::id()
        );
        Document {
            id,
            title,
            source,
            created_at: chrono::Utc::now().timestamp(),
            duration: 0.0,
            stage: Stage::Interrupted,
            progress: 0.0,
            error: None,
            failed_stage: None,
            saved: false,
            audio_path: None,
            segments: vec![],
            speakers: vec![],
            turns: vec![],
            notes: None,
            notes_candidate: None,
            original_turns: None,
            retry_stage: None,
            options,
            notes_section: None,
            attempt_id: String::new(),
            revision: 0,
            history_id: None,
            diarized: false,
            stage_errors: vec![],
            live_segments: vec![],
            consent: None,
        }
    }
    pub fn import(
        &self,
        app: &tauri::AppHandle,
        paths: Vec<String>,
        options: JobOptions,
        request_id: String,
    ) -> Result<ImportResult> {
        self.store.save_batch(&ImportBatch {
            request_id: request_id.clone(),
            paths: paths.clone(),
            options: options.clone(),
            errors: vec![],
        })?;
        let mut result = ImportResult {
            documents: vec![],
            errors: vec![],
            remaining_paths: paths.clone(),
        };
        for path in paths {
            if self.import_cancelled.load(Ordering::Relaxed) {
                result
                    .errors
                    .push("Import cancelled. Files already copied are in your Library.".into());
                break;
            }
            let input = Path::new(&path);
            let name = input
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Audio file")
                .to_string();
            let attempt = (|| -> Result<Document> {
                let ext = input
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if !["wav", "mp3", "m4a", "flac", "ogg"].contains(&ext.as_str()) {
                    bail!("This audio format isn't supported.");
                }
                if !input.is_file() {
                    bail!("This file isn't available.");
                }
                let (bytes, duration) = decode::inspect(input)?;
                use sha2::{Digest, Sha256};
                let canonical = std::fs::canonicalize(input)?;
                let fingerprint = format!(
                    "{:x}",
                    Sha256::digest(canonical.to_string_lossy().as_bytes())
                );
                let metadata = std::fs::metadata(&canonical)?;
                let request_key = format!(
                    "{:x}",
                    Sha256::digest(
                        format!(
                            "{request_id}:{fingerprint}:{}:{:?}",
                            metadata.len(),
                            metadata.modified()?
                        )
                        .as_bytes()
                    )
                );
                let mut proposed = Self::new_document(name.clone(), Source::File, options.clone());
                proposed.duration = duration.unwrap_or(0.0);
                proposed.audio_path = Some(
                    self.store
                        .media
                        .join(format!("{}.{}", proposed.id, ext))
                        .to_string_lossy()
                        .into(),
                );
                let mut doc = self.store.prepare_import(&request_key, &proposed)?;
                if let Ok(existing) = self.store.get(&doc.id) {
                    return Ok(existing);
                }
                let dest = PathBuf::from(
                    doc.audio_path
                        .as_ref()
                        .context("Import destination missing")?,
                );
                if dest.is_file() {
                    // Only the fully synced copy is atomically renamed here.
                    doc.stage = Stage::Queued;
                    self.store.put(&doc)?;
                    return Ok(doc);
                }
                let temporary = decode::partial_copy_path(&self.store.media, input)?;
                let existing = std::fs::metadata(&temporary)
                    .map(|m| m.len().min(bytes))
                    .unwrap_or(0);
                let needed = bytes
                    .saturating_sub(existing)
                    .saturating_add((duration.unwrap_or(0.0) * 64000.0) as u64)
                    .saturating_add(64 * 1024 * 1024);
                if fs4::available_space(&self.store.media)? < needed {
                    bail!("Not enough disk space. Free some up and try again.");
                }
                let mut last_progress = std::time::Instant::now();
                let copied =
                    decode::copy_audio(input, &temporary, &self.import_cancelled, |copied| {
                        if last_progress.elapsed() >= Duration::from_millis(100) || copied == bytes
                        {
                            let _ = app.emit(
                                "workspace-import-progress",
                                serde_json::json!({"name":name,"copied":copied,"total":bytes}),
                            );
                            last_progress = std::time::Instant::now();
                        }
                    });
                copied?;
                if let Err(error) = std::fs::rename(&temporary, &dest) {
                    return Err(error.into());
                }
                doc.audio_path = Some(dest.to_string_lossy().into());
                doc.stage = Stage::Queued;
                self.store.put(&doc)?;
                Ok(doc)
            })();
            match attempt {
                Ok(doc) => {
                    result
                        .remaining_paths
                        .retain(|remaining| remaining != &path);
                    result.documents.push(doc);
                }
                Err(e) => result.errors.push(format!("{name}: {e}")),
            }
            self.store.save_batch(&ImportBatch {
                request_id: request_id.clone(),
                paths: result.remaining_paths.clone(),
                options: options.clone(),
                errors: result.errors.clone(),
            })?;
        }
        self.store.save_batch(&ImportBatch {
            request_id,
            paths: result.remaining_paths.clone(),
            options,
            errors: result.errors.clone(),
        })?;
        Ok(result)
    }
    pub fn edit(&self, edit: DocumentEdit) -> Result<Document> {
        let _lock = self.lock.lock().unwrap();
        self.store.edit(edit)
    }
    pub fn cancel(&self, id: &str) -> Result<()> {
        let _lock = self.lock.lock().unwrap();
        let mut doc = self.store.get(id)?;
        if matches!(doc.stage, Stage::Recording | Stage::Paused) {
            bail!("Stop the meeting first.");
        }
        if self.active.lock().unwrap().as_deref() == Some(id) {
            self.cancelled.store(true, Ordering::Relaxed);
        }
        doc.failed_stage = Some(doc.stage.clone());
        doc.stage = Stage::Cancelled;
        self.store.put(&doc)
    }
    pub fn retry(
        &self,
        id: &str,
        notes_only: bool,
        notes_model: Option<String>,
        only_stage: Option<Stage>,
        notes_section: Option<NotesSection>,
        notes_template: Option<String>,
    ) -> Result<()> {
        let _lock = self.lock.lock().unwrap();
        if self.active.lock().unwrap().as_deref() == Some(id) {
            bail!("Wait for the current job to finish.");
        }
        let mut doc = self.store.get(id)?;
        if matches!(doc.stage, Stage::Recording | Stage::Paused) {
            bail!("Stop recording first.");
        }
        if only_stage
            .as_ref()
            .is_some_and(|stage| !matches!(stage, Stage::Notes | Stage::Diarizing))
        {
            bail!("Unsupported retry stage");
        }
        doc.retry_stage = if notes_only {
            Some(Stage::Notes)
        } else {
            only_stage
        };
        let notes_only = doc.retry_stage == Some(Stage::Notes);
        if doc.retry_stage == Some(Stage::Diarizing) && doc.segments.is_empty() {
            bail!("Transcribe the audio before identifying speakers.");
        }
        if notes_section.is_some() && !notes_only {
            bail!("A notes section requires notes-only processing");
        }
        if notes_only {
            // Explicit generation chooses a fresh scope; retrying a failed stage
            // without a new model keeps the persisted section and checkpoint.
            if notes_model.is_some() || notes_section.is_some() {
                doc.notes_section = notes_section;
            }
            if doc.notes_candidate.is_some() {
                bail!("Review the new notes before generating more.");
            }
            if doc.segments.is_empty() {
                bail!("Transcribe the audio before generating notes.");
            }
            if let Some(model) = notes_model {
                if !matches!(model.as_str(), "qwen3.5-9b" | "qwen3.6-27b") {
                    bail!("Unknown notes engine.");
                }
                doc.options.notes_model = Some(model);
            }
            // Regenerating with another template rewrites every section, so
            // it can't be combined with regenerating one.
            if let Some(template) = notes_template {
                let template = templates::normalize(Some(template))?;
                if template != doc.options.notes_template && notes_section.is_some() {
                    bail!("Regenerate all notes to use a different template.");
                }
                doc.options.notes_template = template;
            }
            if doc.options.notes_model.is_none() {
                bail!("Choose a notes engine first.");
            }
            doc.failed_stage = Some(Stage::Notes);
        }
        doc.stage = Stage::Queued;
        doc.error = None;
        self.store.put(&doc)
    }
    pub fn remove(&self, id: &str, audio_only: bool) -> Result<()> {
        let _lock = self.lock.lock().unwrap();
        let mut doc = self.store.get(id)?;
        if self.active.lock().unwrap().as_deref() == Some(id)
            || matches!(doc.stage, Stage::Recording | Stage::Paused | Stage::Queued)
        {
            bail!("Stop this job before deleting it.");
        }
        if let Some(path) = &doc.audio_path {
            let path = Path::new(path);
            if path.starts_with(self.root.join("recordings")) && path.exists() {
                std::fs::remove_file(path)?;
            }
        }
        // Delete every managed source, recovery track and normalization temporary.
        let prefix = format!("{}.", doc.id);
        for entry in std::fs::read_dir(&self.store.media)? {
            let entry = entry?;
            if entry.file_name().to_string_lossy().starts_with(&prefix)
                && entry.file_type()?.is_file()
            {
                std::fs::remove_file(entry.path())?;
            }
        }
        if audio_only {
            doc.audio_path = None;
            self.store.put(&doc)?;
        } else {
            if let Some(id) = doc.history_id {
                self.store
                    .conn()?
                    .execute("DELETE FROM transcription_history WHERE id=?1", [id])?;
            }
            self.store.delete(&doc.id)?;
        }
        Ok(())
    }
    pub fn start_queue(self: &Arc<Self>, app: tauri::AppHandle) {
        let this = self.clone();
        std::thread::spawn(move || loop {
            let doc = {
                let _guard = this.lock.lock().unwrap();
                let mut active = this.active.lock().unwrap();
                if active.is_some() || this.installing.load(Ordering::SeqCst) {
                    return;
                }
                let Some(doc) = (match this.store.next_queued() {
                    Ok(doc) => doc,
                    Err(_) => return,
                }) else {
                    return;
                };
                this.cancelled.store(false, Ordering::Relaxed);
                *active = Some(doc.id.clone());
                doc
            };
            if let Err(error) = this.process(&app, doc.clone()) {
                let _guard = this.lock.lock().unwrap();
                if let Ok(mut current) = this.store.get(&doc.id) {
                    current.failed_stage = Some(current.stage.clone());
                    current.stage = if this.cancelled.load(Ordering::Relaxed) {
                        Stage::Cancelled
                    } else {
                        Stage::Failed
                    };
                    current.error = Some(error.to_string());
                    let _ = this.store.put_processed(&current);
                }
            }
            *this.active.lock().unwrap() = None;
            this.emit(&app);
        });
    }
    fn stage(
        &self,
        app: &tauri::AppHandle,
        doc: &mut Document,
        stage: Stage,
        progress: f64,
    ) -> Result<()> {
        let _guard = self.lock.lock().unwrap();
        if self.cancelled.load(Ordering::Relaxed) {
            bail!("Cancelled");
        }
        doc.stage = stage;
        doc.progress = progress;
        self.store.put_processed(doc)?;
        self.emit(app);
        Ok(())
    }
    fn process(&self, app: &tauri::AppHandle, mut doc: Document) -> Result<()> {
        self.store.begin_attempt(&mut doc)?;
        self.emit(app);
        let notes_only = (doc.retry_stage == Some(Stage::Notes)
            || (doc.retry_stage.is_none() && doc.failed_stage == Some(Stage::Notes)))
            && !doc.segments.is_empty();
        let speakers_only = doc.retry_stage == Some(Stage::Diarizing);
        if doc.segments.is_empty() {
            // Freeze the explicitly chosen "current dictation model" for this job.
            // A settings change must not mix different models across resumed chunks.
            if doc.options.model == "native" {
                doc.options.model = crate::settings::get_settings(app).selected_model;
                if doc.options.model.is_empty() {
                    bail!("Choose an engine in Settings first.");
                }
            }
            doc.options.model = readiness::transcription_model(&doc.options).to_string();
            self.stage(app, &mut doc, Stage::Preparing, 0.0)?;
            let source = doc
                .audio_path
                .as_ref()
                .context("This recording has no audio.")?;
            let normalized = self.store.media.join(format!("{}.pcm.wav", doc.id));
            if (!Path::new(source).exists() || doc.failed_stage == Some(Stage::Recording))
                && matches!(doc.source, Source::Meeting)
            {
                capture::recover_audio(Path::new(source))?;
            }
            if !normalized.exists() {
                let temp = normalized.with_extension("partial.wav");
                doc.duration = decode::decode(Path::new(source), &temp, &self.cancelled)?;
                std::fs::rename(&temp, &normalized)?;
            } else {
                let r = hound::WavReader::open(&normalized)?;
                doc.duration = r.duration() as f64 / r.spec().sample_rate as f64;
            }
            self.stage(app, &mut doc, Stage::Transcribing, 0.0)?;
            if doc.options.model == "qwen3-asr" {
                let model_path = packs::model_path(app, "qwen3-asr")?;
                let aligner_path = packs::model_path(app, "qwen3-aligner")?;
                let checkpoint_path = self.store.media.join(format!("{}.qwen-checkpoint", doc.id));
                let key = format!(
                    "{}:{}:{}:{}:{}",
                    worker::fingerprint(&worker::binary(app, false)?)?,
                    doc.options.language,
                    doc.duration,
                    std::fs::read_to_string(model_path.join("installed.json"))?,
                    std::fs::read_to_string(aligner_path.join("installed.json"))?
                );
                let mut start = 0.0;
                if let Some(saved) =
                    checkpoint::Checkpoint::load(&checkpoint_path, &key, doc.duration)
                {
                    start = saved.next;
                    doc.segments = saved.segments;
                }
                while start < doc.duration {
                    let end = (start + 120.0).min(doc.duration);
                    let result = worker::run(
                        app,
                        serde_json::json!({"protocol":1,"task":"transcribe","audio_path":normalized,"model_path":model_path,"aligner_path":aligner_path,"language":readiness::qwen_language(&doc.options.language),"start_seconds":start,"end_seconds":end}),
                        &self.child,
                        &self.cancelled,
                    )?;
                    if result["fallback"] == "large" {
                        doc.options.model = "large".into();
                        doc.options.language = result["language"].as_str().unwrap_or("auto").into();
                        doc.segments.clear();
                        break;
                    }
                    let chunk: Vec<Segment> = serde_json::from_value(result["segments"].clone())?;
                    for mut segment in chunk {
                        segment.id = format!("s{}", doc.segments.len());
                        doc.segments.push(segment);
                    }
                    start = end;
                    checkpoint::Checkpoint {
                        key: key.clone(),
                        next: end,
                        segments: doc.segments.clone(),
                    }
                    .save(&checkpoint_path)?;
                    let _ = app.emit(
                        "workspace-progress",
                        serde_json::json!({"version":2,"id":doc.id,"attempt_id":doc.attempt_id,"stage":doc.stage,"revision":doc.revision,"progress":end/doc.duration}),
                    );
                }
            }
            if doc.options.model != "qwen3-asr" {
                let manager =
                    app.state::<Arc<crate::managers::transcription::TranscriptionManager>>();
                let mut reader = hound::WavReader::open(&normalized)?;
                let total = reader.duration() as usize;
                let models = app.state::<Arc<crate::managers::model::ModelManager>>();
                let info = models
                    .get_model_info(&doc.options.model)
                    .context("Unknown engine.")?;
                let model_file = models.get_model_path(&doc.options.model)?;
                let metadata = std::fs::metadata(&model_file)?;
                let checkpoint_path = self
                    .store
                    .media
                    .join(format!("{}.native-checkpoint", doc.id));
                let key = format!(
                    "native-v1:{}:{}:{:?}:{:?}:{:?}:{}:{}",
                    info.id,
                    doc.options.language,
                    info.sha256,
                    info.url,
                    metadata.modified()?,
                    metadata.len(),
                    total
                );
                let mut offset = 0;
                if let Some(saved) =
                    checkpoint::Checkpoint::load(&checkpoint_path, &key, doc.duration)
                {
                    offset = (saved.next * 16000.0).round() as usize;
                    reader.seek(
                        u32::try_from(offset).context("Recording exceeds WAV seek limits")?,
                    )?;
                    doc.segments = saved.segments;
                }
                let mut samples = reader.samples::<f32>();
                loop {
                    if self.cancelled.load(Ordering::Relaxed) {
                        bail!("Cancelled");
                    }
                    // A live meeting transcribes with the dictation engine. Don't
                    // make the shared engine swap models under it; jobs on another
                    // engine continue once the meeting ends.
                    while self.meeting_active.load(Ordering::SeqCst)
                        && doc.options.model != crate::settings::get_settings(app).selected_model
                    {
                        if self.cancelled.load(Ordering::Relaxed) {
                            bail!("Cancelled");
                        }
                        std::thread::sleep(Duration::from_millis(500));
                    }
                    let chunk: Vec<f32> = samples
                        .by_ref()
                        .take(16000 * 30)
                        .collect::<std::result::Result<_, _>>()?;
                    if chunk.is_empty() {
                        break;
                    }
                    let count = chunk.len();
                    let selected = Some(doc.options.model.as_str());
                    let language = language_code(&doc.options.language);
                    // Background priority: dictation always goes first.
                    let result = loop {
                        match manager.transcribe_background(
                            chunk.clone(),
                            selected,
                            Some(language),
                            &self.cancelled,
                        )? {
                            Some(result) => break result,
                            None => std::thread::sleep(Duration::from_millis(250)),
                        }
                    };
                    let segments = result.segments.unwrap_or_default();
                    if segments.is_empty() && !result.text.trim().is_empty() {
                        bail!("This engine doesn't give timestamps. Pick Whisper or Parakeet in Settings.");
                    }
                    for s in segments {
                        doc.segments.push(Segment {
                            id: format!("s{}", doc.segments.len()),
                            start: s.start as f64 + offset as f64 / 16000.0,
                            end: s.end as f64 + offset as f64 / 16000.0,
                            text: s.text.clone(),
                            original_text: s.text,
                            speaker: None,
                        });
                    }
                    offset += count;
                    checkpoint::Checkpoint {
                        key: key.clone(),
                        next: offset as f64 / 16000.0,
                        segments: doc.segments.clone(),
                    }
                    .save(&checkpoint_path)?;
                    doc.progress = offset as f64 / total.max(1) as f64;
                    let _ = app.emit(
                        "workspace-progress",
                        serde_json::json!({"version":2,"id":doc.id,"attempt_id":doc.attempt_id,"stage":doc.stage,"revision":doc.revision,"progress":doc.progress}),
                    );
                }
            }
            for s in &doc.segments {
                if !s.start.is_finite()
                    || !s.end.is_finite()
                    || s.start < 0.0
                    || s.end < s.start
                    || s.end > doc.duration + 1.0
                {
                    bail!("The engine returned broken timestamps. Try again.");
                }
            }
            if !doc.options.speakers {
                coalesce_segments(&mut doc.segments);
            }
            self.store.put_processed(&doc)?;
        }
        if !notes_only && doc.options.speakers && !doc.diarized && !doc.segments.is_empty() {
            doc.stage_errors.retain(|e| e.stage != Stage::Diarizing);
            self.stage(app, &mut doc, Stage::Diarizing, 0.0)?;
            let attempt = (|| -> Result<()> {
                let audio = self.store.media.join(format!("{}.pcm.wav", doc.id));
                let result = worker::run(
                    app,
                    serde_json::json!({"protocol":1,"task":"diarize","audio_path":audio,"model_path":packs::model_path(app,"community-1")?}),
                    &self.child,
                    &self.cancelled,
                )?;
                let turns: Vec<SpeakerTurn> = serde_json::from_value(result["turns"].clone())?;
                let exclusive: Vec<SpeakerTurn> =
                    serde_json::from_value(result["exclusive"].clone())?;
                for turn in turns.iter().chain(&exclusive) {
                    if !turn.start.is_finite()
                        || !turn.end.is_finite()
                        || turn.start < 0.0
                        || turn.end <= turn.start
                        || turn.end > doc.duration + 1.0
                        || turn.speaker.is_empty()
                    {
                        bail!("Speaker detection went wrong. Try again.");
                    }
                }
                doc.turns = turns;
                doc.original_turns = Some(doc.turns.clone());
                assign_speakers(&mut doc, &exclusive);
                // Keep stable source IDs if a user has edited or notes already cite them.
                if doc.revision == 0 && doc.notes.is_none() {
                    coalesce_segments(&mut doc.segments);
                }
                doc.diarized = true;
                doc.revision = doc.revision.saturating_add(1);
                Ok(())
            })();
            if let Err(error) = attempt {
                if self.cancelled.load(Ordering::Relaxed) {
                    return Err(error);
                }
                doc.stage_errors.push(StageError {
                    stage: Stage::Diarizing,
                    message: error.to_string(),
                });
            }
            self.store.put_processed(&doc)?;
        }
        if let Some(model) = doc.options.notes_model.clone().filter(|_| !speakers_only) {
            if doc.notes.is_none() || notes_only {
                doc.stage_errors.retain(|e| e.stage != Stage::Notes);
                self.stage(app, &mut doc, Stage::Notes, 0.0)?;
                let attempt = (|| -> Result<()> {
                    let model_path = packs::model_path(app, &model)?;
                    let checkpoint_path = self
                        .store
                        .media
                        .join(format!("{}.notes-checkpoint", doc.id));
                    use sha2::{Digest, Sha256};
                    let note_segments: Vec<serde_json::Value> = doc
                    .segments
                    .iter()
                    .map(|segment| {
                        let speaker = segment
                            .speaker
                            .as_ref()
                            .and_then(|id| doc.speakers.iter().find(|speaker| &speaker.id == id))
                            .map(|speaker| speaker.name.as_str());
                        serde_json::json!({"id":segment.id,"text":segment.text,"speaker":speaker})
                    })
                    .collect();
                    // The person's own notes: the job keeps their points and
                    // adds cited detail from the transcript ("Enhance").
                    let user_notes = self.store.user_notes(&doc.id)?;
                    let key = format!(
                        "{:x}",
                        Sha256::digest(serde_json::to_vec(&serde_json::json!({
                            "version":5,"section":doc.notes_section,"template":doc.options.notes_template,"runtime":worker::fingerprint(&worker::binary(app, true)?)?,"segments":note_segments,"user_notes":user_notes,"model":std::fs::read_to_string(model_path.join("installed.json"))?
                        }))?)
                    );
                    let mut continuation = std::fs::read(&checkpoint_path)
                        .ok()
                        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
                        .filter(|saved| saved["key"] == key)
                        .map(|saved| saved["continuation"].clone())
                        .unwrap_or(serde_json::Value::Null);
                    let result = loop {
                        let step = worker::run(
                            app,
                            serde_json::json!({"protocol":1,"task":"notes","section":doc.notes_section,"template":templates::worker_spec(doc.options.notes_template.as_deref()),"step":true,"continuation":continuation,"model_path":model_path,"segments":note_segments,"user_notes":user_notes}),
                            &self.child,
                            &self.cancelled,
                        )?;
                        if step.get("notes").is_some() {
                            break step["notes"].clone();
                        }
                        if let Some(progress) =
                            step.get("progress").and_then(serde_json::Value::as_f64)
                        {
                            let _ = app.emit(
                                "workspace-progress",
                                serde_json::json!({"version":2,"id":doc.id,"attempt_id":doc.attempt_id,"stage":doc.stage,"revision":doc.revision,"progress":progress}),
                            );
                        }
                        continuation = step
                            .get("continuation")
                            .context("Missing notes continuation")?
                            .clone();
                        let temp = checkpoint_path.with_extension("notes-partial");
                        let file = std::fs::File::create(&temp)?;
                        serde_json::to_writer(
                            &file,
                            &serde_json::json!({"key":key,"continuation":continuation}),
                        )?;
                        file.sync_all()?;
                        std::fs::rename(temp, &checkpoint_path)?;
                    };
                    let mut notes: Notes = serde_json::from_value({
                        let mut v = result;
                        v["transcript_revision"] = serde_json::json!(doc.revision);
                        v
                    })?;
                    notes.transcript_revision = doc.revision;
                    notes.generated_section = doc.notes_section;
                    notes.template = doc.options.notes_template.clone();
                    store::validate_notes(&notes, &doc.segments)?;
                    store::capture_note_evidence(
                        &mut notes,
                        &doc.segments,
                        Some(doc.revision),
                        doc.history_id.is_none(),
                    );
                    if doc.notes.is_some() {
                        doc.notes_candidate = Some(notes);
                    } else {
                        doc.notes = Some(notes);
                    }
                    Ok(())
                })();
                if let Err(error) = attempt {
                    if self.cancelled.load(Ordering::Relaxed) {
                        return Err(error);
                    }
                    doc.stage_errors.push(StageError {
                        stage: Stage::Notes,
                        message: error.to_string(),
                    });
                }
            }
        }
        doc.error = None;
        doc.failed_stage = None;
        doc.retry_stage = None;
        self.stage(app, &mut doc, Stage::Complete, 1.0)?;
        // Only discard recovery state after the complete document is durable.
        // Explicit note regeneration must start fresh after a successful run.
        for suffix in ["notes-checkpoint", "qwen-checkpoint", "native-checkpoint"] {
            if suffix == "notes-checkpoint"
                && doc.stage_errors.iter().any(|e| e.stage == Stage::Notes)
            {
                continue;
            }
            let _ = std::fs::remove_file(self.store.media.join(format!("{}.{}", doc.id, suffix)));
        }
        Ok(())
    }
}
fn assign_speakers(doc: &mut Document, turns: &[SpeakerTurn]) {
    let mut ids: Vec<String> = turns.iter().map(|t| t.speaker.clone()).collect();
    ids.sort();
    ids.dedup();
    doc.speakers = ids
        .iter()
        .enumerate()
        .map(|(i, id)| Speaker {
            id: id.clone(),
            name: format!("Speaker {}", i + 1),
        })
        .collect();
    for s in &mut doc.segments {
        s.speaker = turns
            .iter()
            .filter_map(|t| {
                let overlap = s.end.min(t.end) - s.start.max(t.start);
                (overlap > 0.0).then_some((overlap, &t.speaker))
            })
            .max_by(|a, b| a.0.total_cmp(&b.0))
            .map(|(_, id)| id.clone());
    }
}

fn language_code(language: &str) -> &str {
    match language {
        "English" => "en",
        "Chinese" | "zh-Hans" | "zh-Hant" => "zh",
        "Cantonese" => "yue",
        "French" => "fr",
        "German" => "de",
        "Italian" => "it",
        "Japanese" => "ja",
        "Korean" => "ko",
        "Portuguese" => "pt",
        "Russian" => "ru",
        "Spanish" => "es",
        "Hindi" => "hi",
        "Arabic" => "ar",
        "Indonesian" => "id",
        "Thai" => "th",
        "Vietnamese" => "vi",
        "Turkish" => "tr",
        "Malay" => "ms",
        "Dutch" => "nl",
        "Swedish" => "sv",
        "Danish" => "da",
        "Finnish" => "fi",
        "Polish" => "pl",
        "Czech" => "cs",
        "Filipino" => "tl",
        "Persian" => "fa",
        "Greek" => "el",
        "Hungarian" => "hu",
        "Macedonian" => "mk",
        "Romanian" => "ro",
        value => value,
    }
}

fn coalesce_segments(segments: &mut Vec<Segment>) {
    let mut grouped: Vec<Segment> = Vec::new();
    for segment in std::mem::take(segments) {
        if let Some(previous) = grouped.last_mut() {
            if previous.speaker == segment.speaker
                && segment.start - previous.end < 1.0
                && segment.end - previous.start <= 12.0
            {
                previous.text.push(' ');
                previous.text.push_str(&segment.text);
                previous.original_text.push(' ');
                previous.original_text.push_str(&segment.original_text);
                previous.end = segment.end;
                continue;
            }
        }
        grouped.push(segment);
    }
    *segments = grouped;
}

/// Builds what the model reads for a question from index hits, best first:
/// each transcript hit with the segment either side for context (merged where
/// windows overlap), typed notes as they are, up to `limit` passages.
fn assemble_passages(
    hits: Vec<store::PassageHit>,
    documents: &std::collections::HashMap<String, Document>,
    limit: usize,
) -> Vec<AskSource> {
    const MAX_CHARS: usize = 1200;
    let mut passages: Vec<AskSource> = Vec::new();
    let mut taken: Vec<(String, usize)> = Vec::new();
    for hit in hits {
        if passages.len() == limit {
            break;
        }
        let Some(doc) = documents.get(&hit.document_id) else {
            continue;
        };
        let (start, text) = if hit.segment_id == "user-notes" {
            (None, hit.text)
        } else {
            let Some(index) = doc.segments.iter().position(|s| s.id == hit.segment_id) else {
                continue;
            };
            if taken.contains(&(doc.id.clone(), index)) {
                continue;
            }
            let window = index.saturating_sub(1)..(index + 2).min(doc.segments.len());
            taken.extend(window.clone().map(|i| (doc.id.clone(), i)));
            let segments = &doc.segments[window];
            (
                segments.first().map(|s| s.start),
                segments
                    .iter()
                    .map(|s| s.text.trim())
                    .collect::<Vec<_>>()
                    .join(" "),
            )
        };
        let text: String = text.chars().take(MAX_CHARS).collect();
        passages.push(AskSource {
            id: format!("p{}", passages.len() + 1),
            document_id: doc.id.clone(),
            title: doc.title.clone(),
            created_at: doc.created_at,
            start,
            text,
        });
    }
    passages
}

/// Why a question can't be answered, as codes the app turns into its own
/// words: a meeting is being processed, or there's no notes engine to answer.
pub const ASK_BUSY: &str = "ask:busy";
pub const ASK_NO_ENGINE: &str = "ask:no-engine";

impl Workspace {
    /// Answers a question from the meetings and notes in the Library, citing
    /// where each part of the answer comes from. An empty answer means nothing
    /// in the Library mentions it.
    pub fn ask(&self, app: &tauri::AppHandle, question: &str) -> Result<AskAnswer> {
        // A cancel from before this question mustn't stop it, and one during
        // the search must.
        self.ask_cancelled.store(false, Ordering::SeqCst);
        let question = question.trim();
        if question.is_empty() {
            bail!("Ask a question first.");
        }
        if question.chars().count() > 500 {
            bail!("Keep the question under 500 characters.");
        }
        // Processing holds the background engines, so a question would wait
        // behind it for minutes. Say so now instead.
        if self.active.lock().unwrap().is_some() {
            bail!("{ASK_BUSY}");
        }
        let hits = self.store.search_passages(question, 40)?;
        let mut documents = std::collections::HashMap::new();
        for hit in &hits {
            if !documents.contains_key(&hit.document_id) {
                if let Ok(doc) = self.store.get(&hit.document_id) {
                    documents.insert(hit.document_id.clone(), doc);
                }
            }
        }
        let passages = assemble_passages(hits, &documents, 24);
        if passages.is_empty() {
            return Ok(AskAnswer {
                answer: String::new(),
                sources: Vec::new(),
            });
        }
        let model_path = ["qwen3.5-9b", "qwen3.6-27b"]
            .iter()
            .find_map(|id| packs::model_path(app, id).ok())
            .context(ASK_NO_ENGINE)?;
        let request = serde_json::json!({
            "protocol": 1,
            "task": "ask",
            "question": question,
            "model_path": model_path,
            "passages": passages.iter().map(|p| serde_json::json!({
                "id": p.id,
                "title": p.title,
                "date": chrono::DateTime::from_timestamp(p.created_at, 0)
                    .map(|date| date.format("%Y-%m-%d").to_string())
                    .unwrap_or_default(),
                "text": p.text,
            })).collect::<Vec<_>>(),
        });
        let result = worker::run(app, request, &self.ask_child, &self.ask_cancelled)?;
        let answer = result["answer"].as_str().unwrap_or_default().to_string();
        let sources = result["citations"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|id| id.as_str())
            .filter_map(|id| passages.iter().find(|p| p.id == id).cloned())
            .collect();
        Ok(AskAnswer { answer, sources })
    }

    /// Stops a question being answered.
    pub fn cancel_ask(&self) {
        self.ask_cancelled.store(true, Ordering::SeqCst);
        if let Some(child) = self.ask_child.lock().unwrap().as_mut() {
            let _ = child.kill();
        }
    }
}

#[cfg(test)]
mod ask_tests {
    use super::*;

    fn segment(id: &str, start: f64, text: &str) -> Segment {
        Segment {
            id: id.into(),
            start,
            end: start + 1.0,
            text: text.into(),
            original_text: text.into(),
            speaker: None,
        }
    }

    fn hit(segment_id: &str, text: &str) -> store::PassageHit {
        store::PassageHit {
            document_id: "m".into(),
            segment_id: segment_id.into(),
            start: None,
            title: "Design review".into(),
            text: text.into(),
            created_at: 0,
        }
    }

    #[test]
    fn passages_carry_context_and_never_repeat_a_segment() {
        let mut doc = Workspace::new_document(
            "Design review".into(),
            Source::Meeting,
            JobOptions::default(),
        );
        doc.id = "m".into();
        doc.segments = vec![
            segment("s0", 0.0, "Pricing came up."),
            segment("s1", 5.0, "We ship Friday."),
            segment("s2", 9.0, "Legal checks terms."),
            segment("s3", 14.0, "Then marketing."),
        ];
        let documents = std::collections::HashMap::from([("m".to_string(), doc)]);
        let passages = assemble_passages(
            vec![
                hit("s1", ""),
                hit("s2", ""),
                hit("user-notes", "- ask legal"),
                hit("gone", ""),
            ],
            &documents,
            10,
        );
        assert_eq!(passages.len(), 2);
        assert_eq!(passages[0].id, "p1");
        assert_eq!(
            passages[0].text,
            "Pricing came up. We ship Friday. Legal checks terms."
        );
        assert_eq!(passages[0].start, Some(0.0));
        // s2 was already shown as context; typed notes have no time.
        assert_eq!(passages[1].id, "p2");
        assert_eq!(passages[1].text, "- ask legal");
        assert_eq!(passages[1].start, None);
        assert_eq!(
            assemble_passages(vec![hit("s0", "")], &documents, 0).len(),
            0
        );
    }
}

#[cfg(test)]
mod section_retry_tests {
    use super::*;

    #[test]
    fn notes_retry_keeps_scope_but_explicit_full_generation_resets_it() {
        let root = tempfile::tempdir().unwrap();
        let workspace = Workspace {
            store: store::Store::new(root.path()).unwrap(),
            root: root.path().into(),
            lock: Mutex::new(()),
            active: Mutex::new(None),
            cancelled: AtomicBool::new(false),
            child: Arc::new(Mutex::new(None)),
            recording: Mutex::new(None),
            meeting_active: AtomicBool::new(false),
            live: Mutex::new(None),
            installing: AtomicBool::new(false),
            download_cancelled: AtomicBool::new(false),
            importing: AtomicBool::new(false),
            import_cancelled: AtomicBool::new(false),
            ask_child: Arc::new(Mutex::new(None)),
            ask_cancelled: AtomicBool::new(false),
        };
        let mut doc =
            Workspace::new_document("Meeting".into(), Source::Meeting, JobOptions::default());
        doc.segments.push(Segment {
            id: "s0".into(),
            start: 0.0,
            end: 1.0,
            text: "Send the draft".into(),
            original_text: "Send the draft".into(),
            speaker: None,
        });
        doc.stage = Stage::Complete;
        workspace.store.put(&doc).unwrap();
        workspace
            .retry(
                &doc.id,
                true,
                Some("qwen3.5-9b".into()),
                None,
                Some(NotesSection::Actions),
                None,
            )
            .unwrap();
        let mut queued = workspace.store.get(&doc.id).unwrap();
        assert_eq!(queued.notes_section, Some(NotesSection::Actions));
        queued.stage = Stage::Interrupted;
        queued.failed_stage = Some(Stage::Notes);
        workspace.store.put(&queued).unwrap();
        workspace
            .retry(&doc.id, true, None, Some(Stage::Notes), None, None)
            .unwrap();
        assert_eq!(
            workspace.store.get(&doc.id).unwrap().notes_section,
            Some(NotesSection::Actions)
        );
        workspace
            .retry(&doc.id, true, Some("qwen3.5-9b".into()), None, None, None)
            .unwrap();
        assert_eq!(workspace.store.get(&doc.id).unwrap().notes_section, None);
        assert!(workspace
            .retry(
                &doc.id,
                false,
                None,
                None,
                Some(NotesSection::Summary),
                None
            )
            .is_err());

        // A template applies to the whole of the notes.
        let mut queued = workspace.store.get(&doc.id).unwrap();
        queued.stage = Stage::Complete;
        queued.failed_stage = None;
        workspace.store.put(&queued).unwrap();
        assert!(workspace
            .retry(
                &doc.id,
                true,
                None,
                None,
                Some(NotesSection::Summary),
                Some("standup".into())
            )
            .is_err());
        assert!(workspace
            .retry(&doc.id, true, None, None, None, Some("nope".into()))
            .is_err());
        workspace
            .retry(&doc.id, true, None, None, None, Some("standup".into()))
            .unwrap();
        assert_eq!(
            workspace
                .store
                .get(&doc.id)
                .unwrap()
                .options
                .notes_template
                .as_deref(),
            Some("standup")
        );
    }
}
