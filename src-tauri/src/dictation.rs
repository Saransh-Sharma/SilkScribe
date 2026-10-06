//! The text half of a dictation: everything between the engine's transcript and
//! the text that gets delivered. Shortcut dictation and history retry both go
//! through [`finish_dictation`], so they store the same thing on success and on
//! failure.

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
use crate::apple_intelligence;
use crate::settings::{AppSettings, APPLE_INTELLIGENCE_PROVIDER_ID};
use ferrous_opencc::{config::BuiltinConfig, OpenCC};
use log::{debug, error, warn};
use std::future::Future;
use std::time::Duration;

/// How long AI cleanup may take before the raw text is delivered instead.
/// Shortcut presses queue behind a dictation that's still processing, so a
/// provider that never answers must not hold up the next one.
pub(crate) const CLEANUP_TIMEOUT: Duration = Duration::from_secs(30);

/// Field name for structured output JSON schema
const TRANSCRIPTION_FIELD: &str = "transcription";

/// Why AI cleanup didn't produce text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum CleanupError {
    /// No provider, model or prompt is set up, or the provider isn't usable here.
    NotConfigured,
    /// The provider was asked and returned an error or nothing usable.
    Failed,
}

/// What happened to AI cleanup for one dictation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum CleanupOutcome {
    NotRequested,
    Done,
    NotConfigured,
    Failed,
    TimedOut,
}

impl CleanupOutcome {
    /// Cleanup was asked for but the delivered text didn't get it.
    pub(crate) fn missed(&self) -> bool {
        !matches!(self, Self::NotRequested | Self::Done)
    }
}

/// The result of finishing a dictation's text.
pub(crate) struct Finished {
    /// The text to deliver.
    pub delivered: String,
    /// What to store as the processed text: the cleaned-up text, or the
    /// converted text when only Chinese variant conversion changed it.
    pub cleaned: Option<String>,
    /// The cleanup prompt that produced `cleaned`, when cleanup ran.
    pub prompt: Option<String>,
    pub cleanup: CleanupOutcome,
}

/// Runs the text stages on a transcript: Chinese variant conversion, then AI
/// cleanup when `cleanup_requested`. `style` is extra guidance: how to write
/// for the target app (`app_context`) and the text around the cursor
/// (`text_context`).
pub(crate) async fn finish_dictation(
    settings: &AppSettings,
    raw: &str,
    cleanup_requested: bool,
    style: Option<&str>,
) -> Finished {
    let style = style.map(str::to_string);
    finish_with(
        settings,
        raw,
        cleanup_requested,
        CLEANUP_TIMEOUT,
        |settings, text| async move {
            post_process_transcription(&settings, &text, style.as_deref()).await
        },
    )
    .await
}

async fn finish_with<F, Fut>(
    settings: &AppSettings,
    raw: &str,
    cleanup_requested: bool,
    timeout: Duration,
    cleanup: F,
) -> Finished
where
    F: FnOnce(AppSettings, String) -> Fut,
    Fut: Future<Output = Result<String, CleanupError>>,
{
    let converted = maybe_convert_chinese_variant(settings, raw).filter(|text| text != raw);
    let text = converted.clone().unwrap_or_else(|| raw.to_string());

    if !cleanup_requested {
        return Finished {
            delivered: text,
            cleaned: converted,
            prompt: None,
            cleanup: CleanupOutcome::NotRequested,
        };
    }

    let outcome = tokio::time::timeout(timeout, cleanup(settings.clone(), text.clone())).await;
    let (cleaned, cleanup) = match outcome {
        Ok(Ok(cleaned)) => (cleaned, CleanupOutcome::Done),
        Ok(Err(CleanupError::NotConfigured)) => {
            return Finished {
                delivered: text,
                cleaned: converted,
                prompt: None,
                cleanup: CleanupOutcome::NotConfigured,
            }
        }
        Ok(Err(CleanupError::Failed)) => {
            return Finished {
                delivered: text,
                cleaned: converted,
                prompt: None,
                cleanup: CleanupOutcome::Failed,
            }
        }
        Err(_) => {
            warn!("AI cleanup took longer than {timeout:?}; delivering the transcript as is");
            return Finished {
                delivered: text,
                cleaned: converted,
                prompt: None,
                cleanup: CleanupOutcome::TimedOut,
            };
        }
    };

    Finished {
        delivered: cleaned.clone(),
        cleaned: Some(cleaned),
        prompt: selected_prompt(settings),
        cleanup,
    }
}

/// The text of the selected cleanup prompt, if any.
fn selected_prompt(settings: &AppSettings) -> Option<String> {
    let id = settings.post_process_selected_prompt_id.as_ref()?;
    settings
        .post_process_prompts
        .iter()
        .find(|prompt| &prompt.id == id)
        .map(|prompt| prompt.prompt.clone())
}

/// Strip invisible Unicode characters that some LLMs may insert
fn strip_invisible_chars(s: &str) -> String {
    s.replace(['\u{200B}', '\u{200C}', '\u{200D}', '\u{FEFF}'], "")
}

/// Build a system prompt from the user's prompt template, plus any style
/// guidance for the target app. Removes `${output}` placeholder since the
/// transcription is sent as the user message.
fn build_system_prompt(prompt_template: &str, style: Option<&str>) -> String {
    let prompt = prompt_template.replace("${output}", "").trim().to_string();
    match style {
        Some(style) => format!("{prompt}\n\n{style}"),
        None => prompt,
    }
}

async fn post_process_transcription(
    settings: &AppSettings,
    transcription: &str,
    style: Option<&str>,
) -> Result<String, CleanupError> {
    let Some(provider) = settings.active_post_process_provider().cloned() else {
        debug!("Post-processing enabled but no provider is selected");
        return Err(CleanupError::NotConfigured);
    };

    let model = settings
        .post_process_models
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    if model.trim().is_empty() {
        debug!(
            "Post-processing skipped because provider '{}' has no model configured",
            provider.id
        );
        return Err(CleanupError::NotConfigured);
    }

    let Some(prompt) = selected_prompt(settings) else {
        debug!("Post-processing skipped because no prompt is selected");
        return Err(CleanupError::NotConfigured);
    };

    if prompt.trim().is_empty() {
        debug!("Post-processing skipped because the selected prompt is empty");
        return Err(CleanupError::NotConfigured);
    }

    debug!(
        "Starting LLM post-processing with provider '{}' (model: {})",
        provider.id, model
    );

    let api_key = settings
        .post_process_api_keys
        .get(&provider.id)
        .cloned()
        .unwrap_or_default();

    if provider.supports_structured_output {
        debug!("Using structured outputs for provider '{}'", provider.id);

        let system_prompt = build_system_prompt(&prompt, style);
        let user_content = transcription.to_string();

        // Handle Apple Intelligence separately since it uses native Swift APIs
        if provider.id == APPLE_INTELLIGENCE_PROVIDER_ID {
            #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
            {
                if !apple_intelligence::check_apple_intelligence_availability() {
                    debug!(
                        "Apple Intelligence selected but not currently available on this device"
                    );
                    return Err(CleanupError::NotConfigured);
                }

                let token_limit = model.trim().parse::<i32>().unwrap_or(0);
                // The bridge blocks until the model answers. Run it off the async
                // runtime so the cleanup timeout can stop waiting for it.
                let result = tauri::async_runtime::spawn_blocking(move || {
                    apple_intelligence::process_text_with_system_prompt(
                        &system_prompt,
                        &user_content,
                        token_limit,
                    )
                })
                .await;
                return match result {
                    Ok(Ok(result)) if result.trim().is_empty() => {
                        debug!("Apple Intelligence returned an empty response");
                        Err(CleanupError::Failed)
                    }
                    Ok(Ok(result)) => {
                        let result = strip_invisible_chars(&result);
                        debug!(
                            "Apple Intelligence post-processing succeeded. Output length: {} chars",
                            result.len()
                        );
                        Ok(result)
                    }
                    Ok(Err(err)) => {
                        error!("Apple Intelligence post-processing failed: {}", err);
                        Err(CleanupError::Failed)
                    }
                    Err(err) => {
                        error!("Apple Intelligence post-processing task failed: {}", err);
                        Err(CleanupError::Failed)
                    }
                };
            }

            #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
            {
                debug!("Apple Intelligence provider selected on unsupported platform");
                return Err(CleanupError::NotConfigured);
            }
        }

        // Define JSON schema for transcription output
        let json_schema = serde_json::json!({
            "type": "object",
            "properties": {
                (TRANSCRIPTION_FIELD): {
                    "type": "string",
                    "description": "The cleaned and processed transcription text"
                }
            },
            "required": [TRANSCRIPTION_FIELD],
            "additionalProperties": false
        });

        match crate::llm_client::send_chat_completion_with_schema(
            &provider,
            api_key.clone(),
            &model,
            user_content,
            Some(system_prompt),
            Some(json_schema),
        )
        .await
        {
            Ok(Some(content)) => {
                // Parse the JSON response to extract the transcription field
                return match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(json) => {
                        if let Some(transcription_value) =
                            json.get(TRANSCRIPTION_FIELD).and_then(|t| t.as_str())
                        {
                            let result = strip_invisible_chars(transcription_value);
                            debug!(
                                "Structured output post-processing succeeded for provider '{}'. Output length: {} chars",
                                provider.id,
                                result.len()
                            );
                            Ok(result)
                        } else {
                            error!("Structured output response missing 'transcription' field");
                            Ok(strip_invisible_chars(&content))
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to parse structured output JSON: {}. Returning raw content.",
                            e
                        );
                        Ok(strip_invisible_chars(&content))
                    }
                };
            }
            Ok(None) => {
                error!("LLM API response has no content");
                return Err(CleanupError::Failed);
            }
            Err(e) => {
                warn!(
                    "Structured output failed for provider '{}': {}. Falling back to legacy mode.",
                    provider.id, e
                );
                // Fall through to legacy mode below
            }
        }
    }

    // Legacy mode: Replace ${output} variable in the prompt with the actual text
    let processed_prompt = match style {
        Some(style) => format!("{style}\n\n{}", prompt.replace("${output}", transcription)),
        None => prompt.replace("${output}", transcription),
    };
    debug!("Processed prompt length: {} chars", processed_prompt.len());

    match crate::llm_client::send_chat_completion(&provider, api_key, &model, processed_prompt)
        .await
    {
        Ok(Some(content)) => {
            let content = strip_invisible_chars(&content);
            debug!(
                "LLM post-processing succeeded for provider '{}'. Output length: {} chars",
                provider.id,
                content.len()
            );
            Ok(content)
        }
        Ok(None) => {
            error!("LLM API response has no content");
            Err(CleanupError::Failed)
        }
        Err(e) => {
            error!(
                "LLM post-processing failed for provider '{}': {}. Falling back to original transcription.",
                provider.id,
                e
            );
            Err(CleanupError::Failed)
        }
    }
}

fn maybe_convert_chinese_variant(settings: &AppSettings, transcription: &str) -> Option<String> {
    // Check if language is set to Simplified or Traditional Chinese
    let is_simplified = settings.selected_language == "zh-Hans";
    let is_traditional = settings.selected_language == "zh-Hant";

    if !is_simplified && !is_traditional {
        debug!("selected_language is not Simplified or Traditional Chinese; skipping translation");
        return None;
    }

    debug!(
        "Starting Chinese translation using OpenCC for language: {}",
        settings.selected_language
    );

    // Use OpenCC to convert based on selected language
    let config = if is_simplified {
        // Convert Traditional Chinese to Simplified Chinese
        BuiltinConfig::Tw2sp
    } else {
        // Convert Simplified Chinese to Traditional Chinese
        BuiltinConfig::S2twp
    };

    match OpenCC::from_config(config) {
        Ok(converter) => {
            let converted = converter.convert(transcription);
            debug!(
                "OpenCC translation completed. Input length: {}, Output length: {}",
                transcription.len(),
                converted.len()
            );
            Some(converted)
        }
        Err(e) => {
            error!("Failed to initialize OpenCC converter: {}. Falling back to original transcription.", e);
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::get_default_settings;

    fn finish(requested: bool, result: Result<String, CleanupError>, delay: Duration) -> Finished {
        let settings = get_default_settings();
        tauri::async_runtime::block_on(finish_with(
            &settings,
            "raw words",
            requested,
            Duration::from_millis(50),
            move |_, _| async move {
                tokio::time::sleep(delay).await;
                result
            },
        ))
    }

    #[test]
    fn style_guidance_follows_the_prompt() {
        assert_eq!(
            build_system_prompt("Clean up:\n${output}", None),
            "Clean up:"
        );
        assert_eq!(
            build_system_prompt("Clean up:\n${output}", Some("Style: casual.")),
            "Clean up:\n\nStyle: casual."
        );
    }

    #[test]
    fn cleanup_not_requested_delivers_the_transcript() {
        let done = finish(false, Ok("unused".into()), Duration::ZERO);
        assert_eq!(done.delivered, "raw words");
        assert_eq!(done.cleaned, None);
        assert_eq!(done.prompt, None);
        assert_eq!(done.cleanup, CleanupOutcome::NotRequested);
        assert!(!done.cleanup.missed());
    }

    #[test]
    fn successful_cleanup_is_delivered_and_stored_with_its_prompt() {
        let done = finish(true, Ok("Raw words.".into()), Duration::ZERO);
        assert_eq!(done.delivered, "Raw words.");
        assert_eq!(done.cleaned.as_deref(), Some("Raw words."));
        assert!(done.prompt.is_some());
        assert_eq!(done.cleanup, CleanupOutcome::Done);
    }

    #[test]
    fn failed_cleanup_delivers_the_transcript_and_stores_nothing() {
        for (error, outcome) in [
            (CleanupError::Failed, CleanupOutcome::Failed),
            (CleanupError::NotConfigured, CleanupOutcome::NotConfigured),
        ] {
            let done = finish(true, Err(error), Duration::ZERO);
            assert_eq!(done.delivered, "raw words");
            assert_eq!(done.cleaned, None);
            assert_eq!(done.prompt, None);
            assert_eq!(done.cleanup, outcome);
            assert!(done.cleanup.missed());
        }
    }

    #[test]
    fn slow_cleanup_times_out_and_delivers_the_transcript() {
        let done = finish(true, Ok("too late".into()), Duration::from_secs(5));
        assert_eq!(done.delivered, "raw words");
        assert_eq!(done.cleaned, None);
        assert_eq!(done.cleanup, CleanupOutcome::TimedOut);
        assert!(done.cleanup.missed());
    }
}
