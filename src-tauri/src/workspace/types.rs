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
/// Who a note item came from. Items the person wrote keep their words and
/// don't need transcript sources; AI items always cite the transcript.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum NoteOrigin {
    #[default]
    Ai,
    User,
}
impl NoteOrigin {
    fn is_ai(&self) -> bool {
        *self == Self::Ai
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct NoteItem {
    pub text: String,
    pub sources: Vec<String>,
    #[serde(default)]
    pub evidence: Vec<NoteEvidence>,
    // specta reads these in order; `default` last keeps the field optional
    // in the generated TypeScript.
    #[serde(skip_serializing_if = "NoteOrigin::is_ai")]
    #[serde(default)]
    pub origin: NoteOrigin,
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
    // specta reads these in order; `default` last keeps the field optional
    // in the generated TypeScript.
    #[serde(skip_serializing_if = "NoteOrigin::is_ai")]
    #[serde(default)]
    pub origin: NoteOrigin,
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
            // Off until the speakers pack ("community-1") is published: asking
            // for it by default only produced a failed stage. The setup presets
            // already default to off.
            speakers: false,
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
    /// Quick "You / Others" lines made while a meeting recorded. Shown until the
    /// full transcript exists; processing never changes them.
    #[serde(default)]
    pub live_segments: Vec<LiveSegment>,
}
/// Which side of a meeting a live line came from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum LiveSource {
    /// The user's microphone.
    Mic,
    /// Computer audio: everyone else on the call.
    System,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct LiveSegment {
    pub id: String,
    pub source: LiveSource,
    /// Seconds on the recording's timeline.
    pub start: f64,
    pub end: f64,
    pub text: String,
}
#[derive(Clone, Debug, Serialize, Type)]
pub struct LiveTranscript {
    pub document_id: String,
    pub segments: Vec<LiveSegment>,
    /// No dictation engine is available to transcribe with.
    pub unavailable: bool,
    /// Transcription fell behind and dropped some audio.
    pub behind: bool,
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
    /// Dictation is recording, so the meeting's mic track is silenced.
    #[serde(default)]
    pub mic_gated: bool,
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
            mic_gated: false,
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
