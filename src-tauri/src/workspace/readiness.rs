use super::{packs, types::JobOptions, worker};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Arc;
use tauri::Manager;
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct ReadinessIssue {
    pub capability: String,
    pub model: String,
    pub code: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct WorkflowAssessment {
    pub can_process: bool,
    pub issues: Vec<ReadinessIssue>,
    pub languages: Vec<String>,
    pub timing: String,
    pub transcription_model: String,
    pub available_memory_bytes: u64,
    pub notes_observation: Option<super::memory::MemoryObservation>,
}
pub const ALIGNED_LANGUAGES: &[&str] = &[
    "Chinese",
    "English",
    "Cantonese",
    "French",
    "German",
    "Italian",
    "Japanese",
    "Korean",
    "Portuguese",
    "Russian",
    "Spanish",
];
pub const QWEN_LANGUAGES: &[&str] = &[
    "Chinese",
    "English",
    "Cantonese",
    "Arabic",
    "German",
    "French",
    "Spanish",
    "Portuguese",
    "Indonesian",
    "Italian",
    "Korean",
    "Russian",
    "Thai",
    "Vietnamese",
    "Japanese",
    "Turkish",
    "Hindi",
    "Malay",
    "Dutch",
    "Swedish",
    "Danish",
    "Finnish",
    "Polish",
    "Czech",
    "Filipino",
    "Persian",
    "Greek",
    "Hungarian",
    "Macedonian",
    "Romanian",
];
pub fn transcription_model(options: &JobOptions) -> &str {
    if options.model == "qwen3-asr"
        && options.language != "auto"
        && !ALIGNED_LANGUAGES.contains(&qwen_language(&options.language))
    {
        "large"
    } else {
        &options.model
    }
}
pub fn qwen_language(language: &str) -> &str {
    QWEN_LANGUAGES
        .iter()
        .copied()
        .find(|name| super::language_code(name) == super::language_code(language))
        .unwrap_or(language)
}
fn processing_languages(model: &str, native_languages: Vec<String>) -> Vec<String> {
    if model == "qwen3-asr" {
        QWEN_LANGUAGES.iter().map(|s| s.to_string()).collect()
    } else {
        native_languages
    }
}
pub fn assess(app: &tauri::AppHandle, options: &JobOptions) -> anyhow::Result<WorkflowAssessment> {
    assess_steps(
        app,
        options,
        true,
        options.speakers,
        options.notes_model.is_some(),
    )
}
/// Run before copying an import, on a blocking worker. Native-only workflows
/// do not depend on either premium runtime and must remain available elsewhere.
pub fn verify_runtimes(
    app: &tauri::AppHandle,
    options: &JobOptions,
    cancelled: &std::sync::atomic::AtomicBool,
) -> anyhow::Result<()> {
    if needs_speech_runtime(options) {
        worker::health_cancellable(app, false, cancelled)?;
    }
    if options.notes_model.is_some() {
        worker::health_cancellable(app, true, cancelled)?;
    }
    Ok(())
}
fn needs_speech_runtime(options: &JobOptions) -> bool {
    transcription_model(options) == "qwen3-asr" || options.speakers
}
pub fn assess_steps(
    app: &tauri::AppHandle,
    options: &JobOptions,
    transcription: bool,
    speakers: bool,
    notes: bool,
) -> anyhow::Result<WorkflowAssessment> {
    let catalog = packs::catalog(app)?;
    let mut issues = Vec::new();
    let mut check = |id: &str, capability: &str| match catalog.iter().find(|p| p.id == id) {
        Some(pack) if pack.installed => (),
        Some(pack) => issues.push(ReadinessIssue {
            capability: capability.into(),
            model: id.into(),
            code: if pack.artifacts.is_empty() {
                "unpublished"
            } else {
                "download"
            }
            .into(),
        }),
        None => issues.push(ReadinessIssue {
            capability: capability.into(),
            model: id.into(),
            code: "unavailable".into(),
        }),
    };
    let speech_model = transcription_model(options);
    if transcription && speech_model == "qwen3-asr" {
        check("qwen3-asr", "transcription");
        check("qwen3-aligner", "transcription");
    }
    if speakers {
        check("community-1", "speakers");
    }
    if notes {
        if let Some(id) = &options.notes_model {
            check(id, "notes");
        }
    }
    let models = app.state::<Arc<crate::managers::model::ModelManager>>();
    let selected = if speech_model == "native" {
        crate::settings::get_settings(app).selected_model
    } else {
        speech_model.into()
    };
    let native_info = models.get_model_info(&selected);
    let languages = processing_languages(
        speech_model,
        native_info
            .as_ref()
            .map(|m| m.supported_languages.clone())
            .unwrap_or_default(),
    );
    if transcription
        && selected != "qwen3-asr"
        && !native_info.as_ref().is_some_and(|m| m.is_downloaded)
    {
        issues.push(ReadinessIssue {
            capability: "transcription".into(),
            model: selected.clone(),
            code: "native_download".into(),
        });
    }
    // Automatic Qwen detection may need Whisper when the detected language cannot
    // be aligned. Prepare that dependency up front, never fetch during inference.
    if transcription
        && selected == "qwen3-asr"
        && options.language == "auto"
        && !models
            .get_model_info("large")
            .is_some_and(|m| m.is_downloaded)
    {
        issues.push(ReadinessIssue {
            capability: "transcription".into(),
            model: "Whisper large-v3".into(),
            code: "fallback_download".into(),
        });
    }
    if transcription
        && options.language != "auto"
        && !languages.is_empty()
        && !languages.contains(&options.language)
        && !languages
            .iter()
            .any(|l| super::language_code(l) == super::language_code(&options.language))
    {
        issues.push(ReadinessIssue {
            capability: "transcription".into(),
            model: options.language.clone(),
            code: "language".into(),
        });
    }
    if ((transcription && speech_model == "qwen3-asr") || speakers)
        && worker::binary(app, false).is_err()
    {
        issues.push(ReadinessIssue {
            capability: "speech".into(),
            model: String::new(),
            code: "runtime".into(),
        });
    }
    if notes && worker::binary(app, true).is_err() {
        issues.push(ReadinessIssue {
            capability: "notes".into(),
            model: String::new(),
            code: "runtime".into(),
        });
    }
    let available_memory_bytes = super::memory::available();
    let notes_observation = options.notes_model.as_ref().and_then(|id| {
        let model = packs::model_path(app, id).ok()?;
        let runtime = worker::binary(app, true).ok()?;
        super::memory::observation(&crate::portable::app_data_dir(app).ok()?, &model, &runtime)
    });
    if notes && super::memory::admit(notes_observation.as_ref(), available_memory_bytes).is_err() {
        issues.push(ReadinessIssue {
            capability: "notes".into(),
            model: options.notes_model.clone().unwrap_or_default(),
            code: "memory".into(),
        });
    }
    Ok(WorkflowAssessment {
        can_process: issues.is_empty(),
        issues,
        languages,
        available_memory_bytes,
        notes_observation,
        timing: if speech_model == "qwen3-asr" {
            if options.language == "auto" {
                "aligned_or_segments"
            } else {
                "aligned"
            }
        } else {
            "segments"
        }
        .into(),
        transcription_model: selected,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_imports_do_not_require_premium_speech_runtime() {
        let mut options = JobOptions::default();
        options.model = "large".into();
        options.speakers = false;
        assert!(!needs_speech_runtime(&options));
        options.model = "qwen3-asr".into();
        options.language = "Arabic".into();
        assert!(!needs_speech_runtime(&options));
        options.speakers = true;
        assert!(needs_speech_runtime(&options));
        options.speakers = false;
        options.language = "English".into();
        assert!(needs_speech_runtime(&options));
    }
    #[test]
    fn fallback_validates_against_the_selected_engines_languages() {
        let mut options = JobOptions::default();
        options.language = "Welsh".into();
        let model = transcription_model(&options);
        assert_eq!(model, "large");
        assert_eq!(processing_languages(model, vec!["cy".into()]), vec!["cy"]);
        assert!(!processing_languages("qwen3-asr", vec!["cy".into()]).contains(&"cy".into()));
        options.language = "en".into();
        assert_eq!(transcription_model(&options), "qwen3-asr");
        assert_eq!(qwen_language("en"), "English");
        assert_eq!(qwen_language("zh-Hant"), "Chinese");
    }
    #[test]
    fn explicit_language_selects_real_timestamp_capability() {
        let mut options = JobOptions::default();
        options.language = "English".into();
        assert_eq!(transcription_model(&options), "qwen3-asr");
        options.language = "Arabic".into();
        assert_eq!(transcription_model(&options), "large");
        options.language = "auto".into();
        assert_eq!(transcription_model(&options), "qwen3-asr");
        options.model = "native".into();
        assert_eq!(transcription_model(&options), "native");
        for language in ALIGNED_LANGUAGES {
            assert!(QWEN_LANGUAGES.contains(language));
        }
    }
}
