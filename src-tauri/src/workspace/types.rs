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
/// Exact source text retained when a note is generated or created.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, Type)]
pub struct NoteEvidence {
    pub segment_id: String,
    pub text: String,
    pub start: Option<f64>,
    pub end: Option<f64>,
    /// None for legacy notes whose generation-time source was not retained.
    pub transcript_revision: Option<u32>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct NoteItem {
    pub text: String,
    pub sources: Vec<String>,
    #[serde(default)]
    pub evidence: Vec<NoteEvidence>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ActionItem {
    pub text: String,
    pub owner: Option<String>,
    pub due: Option<String>,
    pub sources: Vec<String>,
    #[serde(default)]
    pub evidence: Vec<NoteEvidence>,
    pub done: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum NotesSection {
    Summary,
    Decisions,
    Actions,
}
impl NotesSection {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Summary => "summary",
            Self::Decisions => "decisions",
            Self::Actions => "actions",
        }
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, Type)]
pub struct Notes {
    #[serde(default)]
    pub generated_section: Option<NotesSection>,
    #[serde(default)]
    pub reviewed: bool,
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
pub struct StageError {
    pub stage: Stage,
    pub message: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct Document {
    #[serde(default)]
    pub notes_section: Option<NotesSection>,
    #[serde(default)]
    pub attempt_id: String,
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
    #[serde(default)]
    pub notes_candidate: Option<Notes>,
    #[serde(default)]
    pub original_turns: Option<Vec<SpeakerTurn>>,
    #[serde(default)]
    pub retry_stage: Option<Stage>,
    pub options: JobOptions,
    pub revision: u32,
    pub history_id: Option<i64>,
    pub diarized: bool,
    #[serde(default)]
    pub stage_errors: Vec<StageError>,
}
/// Compact Library/Activity projection. Transcript content stays behind workspace_get.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct DocumentSummary {
    pub attempt_id: String,
    pub revision: u32,
    pub id: String,
    pub title: String,
    pub source: Source,
    pub created_at: i64,
    pub duration: f64,
    pub stage: Stage,
    pub progress: f64,
    pub saved: bool,
    pub segment_count: u32,
    pub speaker_count: u32,
    pub notes_available: bool,
    pub stage_errors: Vec<StageError>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct DocumentEdit {
    pub id: String,
    pub expected_revision: u32,
    pub title: String,
    pub segments: Vec<Segment>,
    pub speakers: Vec<Speaker>,
    pub notes: Option<Notes>,
    #[serde(default)]
    pub turns: Option<Vec<SpeakerTurn>>,
    pub saved: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ImportResult {
    pub documents: Vec<Document>,
    pub errors: Vec<String>,
    pub remaining_paths: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ImportBatch {
    pub request_id: String,
    pub paths: Vec<String>,
    pub options: JobOptions,
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
