use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Dictation,
    Meeting,
    File,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Recording,
    Paused,
    Queued,
    Preparing,
    Transcribing,
    Diarizing,
    Notes,
    Complete,
    Failed,
    Cancelled,
    Interrupted,
}
impl Stage {
    pub fn active(&self) -> bool {
        matches!(
            self,
            Self::Preparing | Self::Transcribing | Self::Diarizing | Self::Notes
        )
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct Segment {
    pub id: String,
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub original_text: String,
    pub speaker: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct Speaker {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct SpeakerTurn {
    pub start: f64,
    pub end: f64,
    pub speaker: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct NoteItem {
    pub text: String,
    pub sources: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ActionItem {
    pub text: String,
    pub owner: Option<String>,
    pub due: Option<String>,
    pub sources: Vec<String>,
    pub done: bool,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, Type)]
pub struct Notes {
    pub summary: Vec<NoteItem>,
    pub decisions: Vec<NoteItem>,
    pub actions: Vec<ActionItem>,
    pub transcript_revision: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct JobOptions {
    pub model: String,
    pub language: String,
    pub speakers: bool,
    pub notes_model: Option<String>,
}
impl Default for JobOptions {
    fn default() -> Self {
        Self {
            model: "qwen3-asr".into(),
            language: "auto".into(),
            speakers: true,
            notes_model: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub source: Source,
    pub created_at: i64,
    pub duration: f64,
    pub stage: Stage,
    pub progress: f64,
    pub error: Option<String>,
    pub failed_stage: Option<Stage>,
    pub saved: bool,
    pub audio_path: Option<String>,
    pub segments: Vec<Segment>,
    pub speakers: Vec<Speaker>,
    pub turns: Vec<SpeakerTurn>,
    pub notes: Option<Notes>,
    pub options: JobOptions,
    pub revision: u32,
    pub history_id: Option<i64>,
    pub diarized: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct DocumentEdit {
    pub id: String,
    pub expected_revision: u32,
    pub title: String,
    pub segments: Vec<Segment>,
    pub speakers: Vec<Speaker>,
    pub notes: Option<Notes>,
    pub saved: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ImportResult {
    pub documents: Vec<Document>,
    pub errors: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct RecordingStatus {
    pub document_id: Option<String>,
    pub paused: bool,
    pub seconds: f64,
    pub microphone_level: f64,
    pub system_level: f64,
    pub error: Option<String>,
}
impl Default for RecordingStatus {
    fn default() -> Self {
        Self {
            document_id: None,
            paused: false,
            seconds: 0.0,
            microphone_level: 0.0,
            system_level: 0.0,
            error: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct RecordingOptions {
    pub title: String,
    pub microphone_id: Option<String>,
    pub system_audio: bool,
    pub options: JobOptions,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct CaptureDevice {
    pub id: String,
    pub name: String,
}
