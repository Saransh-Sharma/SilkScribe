pub mod capture;
mod checkpoint;
pub mod commands;
mod decode;
mod export;
pub mod packs;
mod store;
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
use tauri::{Emitter, Manager};
use types::*;

pub struct Workspace {
    pub store: store::Store,
    pub root: PathBuf,
    lock: Mutex<()>,
    pub active: Mutex<Option<String>>,
    pub cancelled: AtomicBool,
    pub child: Arc<Mutex<Option<Child>>>,
    pub recording: Mutex<Option<capture::Recording>>,
    pub installing: AtomicBool,
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
            installing: AtomicBool::new(false),
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
    ) -> Result<Vec<Document>> {
        let _lock = self.lock.lock().unwrap();
        self.store.sync_history(&self.root)?;
        self.store.list(query, filter, limit, offset)
    }
    pub fn create(&self, title: String, source: Source, options: JobOptions) -> Result<Document> {
        let id = format!(
            "{}-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            std::process::id()
        );
        let doc = Document {
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
            options,
            revision: 0,
            history_id: None,
            diarized: false,
        };
        self.store.put(&doc)?;
        Ok(doc)
    }
    pub fn import(&self, paths: Vec<String>, options: JobOptions) -> Result<ImportResult> {
        let mut result = ImportResult {
            documents: vec![],
            errors: vec![],
        };
        for path in paths {
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
                    bail!("Unsupported audio format");
                }
                if !input.is_file() {
                    bail!("The selected file is unavailable");
                }
                let mut doc = self.create(name.clone(), Source::File, options.clone())?;
                let dest = self.store.media.join(format!("{}.{}", doc.id, ext));
                if let Err(e) = std::fs::copy(input, &dest) {
                    let _ = self.store.delete(&doc.id);
                    return Err(e.into());
                }
                doc.audio_path = Some(dest.to_string_lossy().into());
                doc.stage = Stage::Queued;
                self.store.put(&doc)?;
                Ok(doc)
            })();
            match attempt {
                Ok(doc) => result.documents.push(doc),
                Err(e) => result.errors.push(format!("{name}: {e}")),
            }
        }
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
            bail!("Stop the meeting before cancelling transcription");
        }
        if self.active.lock().unwrap().as_deref() == Some(id) {
            self.cancelled.store(true, Ordering::Relaxed);
        }
        doc.failed_stage = Some(doc.stage.clone());
        doc.stage = Stage::Cancelled;
        self.store.put(&doc)
    }
    pub fn retry(&self, id: &str, notes_only: bool, notes_model: Option<String>) -> Result<()> {
        let _lock = self.lock.lock().unwrap();
        if self.active.lock().unwrap().as_deref() == Some(id) {
            bail!("Wait for the current job to stop");
        }
        let mut doc = self.store.get(id)?;
        if matches!(doc.stage, Stage::Recording | Stage::Paused) {
            bail!("Stop recording first");
        }
        if notes_only {
            if doc.segments.is_empty() {
                bail!("A transcript is required before generating notes");
            }
            if let Some(model) = notes_model {
                if !matches!(model.as_str(), "qwen3.5-9b" | "qwen3.6-27b") {
                    bail!("Unknown notes model");
                }
                doc.options.notes_model = Some(model);
            }
            if doc.options.notes_model.is_none() {
                bail!("Choose a local notes model first");
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
            bail!("Stop or cancel this job before deleting it");
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
                if active.is_some() {
                    return;
                }
                let docs = match this.store.list(None, None, 10000, 0) {
                    Ok(d) => d,
                    Err(_) => return,
                };
                let Some(doc) = docs.into_iter().rev().find(|d| d.stage == Stage::Queued) else {
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
                    let _ = this.store.put(&current);
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
        self.store.put(doc)?;
        self.emit(app);
        Ok(())
    }
    fn process(&self, app: &tauri::AppHandle, mut doc: Document) -> Result<()> {
        let notes_only = doc.failed_stage == Some(Stage::Notes) && !doc.segments.is_empty();
        if doc.segments.is_empty() {
            // Freeze the explicitly chosen "current dictation model" for this job.
            // A settings change must not mix different models across resumed chunks.
            if doc.options.model == "native" {
                doc.options.model = crate::settings::get_settings(app).selected_model;
                if doc.options.model.is_empty() {
                    bail!("Choose a transcription model in Settings first");
                }
            }
            self.stage(app, &mut doc, Stage::Preparing, 0.0)?;
            let source = doc
                .audio_path
                .as_ref()
                .context("The recording has no audio to transcribe")?;
            let normalized = self.store.media.join(format!("{}.pcm.wav", doc.id));
            if !Path::new(source).exists() && matches!(doc.source, Source::Meeting) {
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
                    "{}:{}:{}:{}",
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
                        serde_json::json!({"protocol":1,"task":"transcribe","audio_path":normalized,"model_path":model_path,"aligner_path":aligner_path,"language":doc.options.language,"start_seconds":start,"end_seconds":end}),
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
                        serde_json::json!({"id":doc.id,"progress":end/doc.duration}),
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
                    .context("Unknown transcription model")?;
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
                    // Let shortcut recordings finish before taking the next inference slot.
                    while app
                        .state::<Arc<crate::managers::audio::AudioRecordingManager>>()
                        .is_recording()
                    {
                        if self.cancelled.load(Ordering::Relaxed) {
                            bail!("Cancelled");
                        }
                        std::thread::sleep(Duration::from_millis(100));
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
                    let result =
                        manager.transcribe_with_options(chunk, selected, Some(language))?;
                    let segments = result.segments.unwrap_or_default();
                    if segments.is_empty() && !result.text.trim().is_empty() {
                        bail!("The selected model did not return timestamps. Select Whisper or Parakeet in Settings.");
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
                        serde_json::json!({"id":doc.id,"progress":doc.progress}),
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
                    bail!("The model returned invalid timestamps");
                }
            }
            if !doc.options.speakers {
                coalesce_segments(&mut doc.segments);
            }
            self.store.put(&doc)?;
        }
        if !notes_only && doc.options.speakers && !doc.diarized && !doc.segments.is_empty() {
            self.stage(app, &mut doc, Stage::Diarizing, 0.0)?;
            let audio = self.store.media.join(format!("{}.pcm.wav", doc.id));
            let result = worker::run(
                app,
                serde_json::json!({"protocol":1,"task":"diarize","audio_path":audio,"model_path":packs::model_path(app,"community-1")?}),
                &self.child,
                &self.cancelled,
            )?;
            doc.turns = serde_json::from_value(result["turns"].clone())?;
            let exclusive: Vec<SpeakerTurn> = serde_json::from_value(result["exclusive"].clone())?;
            assign_speakers(&mut doc, &exclusive);
            coalesce_segments(&mut doc.segments);
            doc.diarized = true;
            self.store.put(&doc)?;
        }
        if let Some(model) = doc.options.notes_model.clone() {
            if doc.notes.is_none() || notes_only {
                self.stage(app, &mut doc, Stage::Notes, 0.0)?;
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
                let key = format!(
                    "{:x}",
                    Sha256::digest(serde_json::to_vec(&serde_json::json!({
                        "version":1,"segments":note_segments,"model":std::fs::read_to_string(model_path.join("installed.json"))?
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
                        serde_json::json!({"protocol":1,"task":"notes","step":true,"continuation":continuation,"model_path":model_path,"segments":note_segments}),
                        &self.child,
                        &self.cancelled,
                    )?;
                    if step.get("notes").is_some() {
                        break step["notes"].clone();
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
                store::validate_notes(&notes, &doc.segments)?;
                doc.notes = Some(notes);
            }
        }
        doc.error = None;
        doc.failed_stage = None;
        self.stage(app, &mut doc, Stage::Complete, 1.0)?;
        // Only discard recovery state after the complete document is durable.
        // Explicit note regeneration must start fresh after a successful run.
        for suffix in ["notes-checkpoint", "qwen-checkpoint", "native-checkpoint"] {
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
        "Chinese" => "zh",
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
