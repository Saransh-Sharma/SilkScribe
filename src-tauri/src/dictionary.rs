//! The dictionary: vocabulary the engine should spell your way, replacements
//! (always write one phrase as another) and snippets (say a short phrase, get
//! longer text). Vocabulary is used by the transcription manager; replacements
//! and snippets by `dictation::finish_dictation`.

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::AppHandle;

use crate::audio_toolkit::normalize_phrase;
use crate::settings::{self, Replacement, Snippet};

/// Longest word, phrase or trigger kept.
const MAX_PHRASE_CHARS: usize = 100;
/// Longest snippet text kept.
const MAX_SNIPPET_CHARS: usize = 5000;
/// Largest dictionary file read.
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;

fn too_long(text: &str, limit: usize) -> bool {
    text.chars().count() > limit
}

/// Trimmed, non-empty words, each once (ignoring case), first spelling kept.
fn clean_words(words: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    words
        .into_iter()
        .map(|word| word.trim().to_string())
        .filter(|word| !word.is_empty() && !too_long(word, MAX_PHRASE_CHARS))
        .filter(|word| seen.insert(word.to_lowercase()))
        .collect()
}

/// Keeps one entry per phrase as said (ignoring case and punctuation); a
/// later entry replaces an earlier one, so an edit or import wins.
fn dedupe_by<T>(items: Vec<T>, key: impl Fn(&T) -> String) -> Vec<T> {
    let mut kept: Vec<T> = Vec::new();
    for item in items {
        let item_key = key(&item);
        if let Some(position) = kept.iter().position(|kept| key(kept) == item_key) {
            kept[position] = item;
        } else {
            kept.push(item);
        }
    }
    kept
}

fn clean_replacements(replacements: Vec<Replacement>) -> Vec<Replacement> {
    let replacements = replacements
        .into_iter()
        .map(|replacement| Replacement {
            from: replacement.from.trim().to_string(),
            to: replacement.to.trim().to_string(),
        })
        .filter(|replacement| {
            !normalize_phrase(&replacement.from).is_empty()
                && !too_long(&replacement.from, MAX_PHRASE_CHARS)
                && !too_long(&replacement.to, MAX_PHRASE_CHARS)
        })
        .collect();
    dedupe_by(replacements, |replacement| {
        normalize_phrase(&replacement.from)
    })
}

fn clean_snippets(snippets: Vec<Snippet>) -> Vec<Snippet> {
    let snippets = snippets
        .into_iter()
        .map(|snippet| Snippet {
            trigger: snippet.trigger.trim().to_string(),
            // Line breaks inside the text are the point; only the ends go.
            text: snippet.text.trim().to_string(),
        })
        .filter(|snippet| {
            !normalize_phrase(&snippet.trigger).is_empty()
                && !snippet.text.is_empty()
                && !too_long(&snippet.trigger, MAX_PHRASE_CHARS)
                && !too_long(&snippet.text, MAX_SNIPPET_CHARS)
        })
        .collect();
    dedupe_by(snippets, |snippet| normalize_phrase(&snippet.trigger))
}

#[tauri::command]
#[specta::specta]
pub fn update_replacements(app: AppHandle, replacements: Vec<Replacement>) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.replacements = clean_replacements(replacements);
    settings::write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn update_snippets(app: AppHandle, snippets: Vec<Snippet>) -> Result<(), String> {
    let mut settings = settings::get_settings(&app);
    settings.snippets = clean_snippets(snippets);
    settings::write_settings(&app, settings);
    Ok(())
}

/// What "Add to dictionary" saved.
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
#[serde(rename_all = "snake_case")]
pub enum DictionaryEntry {
    /// A vocabulary word: spelled as written.
    Word,
    /// Written as `write` whenever `heard` is said.
    Replacement,
}

/// Adds a correction from a transcript: `write` alone (or the same as
/// `heard`) teaches a spelling; a different `heard` becomes a replacement.
fn add_entry(
    settings: &mut settings::AppSettings,
    heard: Option<&str>,
    write: &str,
) -> Result<DictionaryEntry, String> {
    let write = write.trim();
    if write.is_empty() {
        return Err("Type how it should be written.".to_string());
    }
    if too_long(write, MAX_PHRASE_CHARS) {
        return Err("Keep it under 100 characters.".to_string());
    }
    let heard = heard.map(str::trim).filter(|heard| !heard.is_empty());
    match heard {
        Some(heard) if heard != write => {
            let mut replacements = settings.replacements.clone();
            replacements.push(Replacement {
                from: heard.to_string(),
                to: write.to_string(),
            });
            settings.replacements = clean_replacements(replacements);
            Ok(DictionaryEntry::Replacement)
        }
        _ => {
            let mut words = settings.custom_words.clone();
            words.push(write.to_string());
            settings.custom_words = clean_words(words);
            Ok(DictionaryEntry::Word)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn add_to_dictionary(
    app: AppHandle,
    heard: Option<String>,
    write: String,
) -> Result<DictionaryEntry, String> {
    let mut settings = settings::get_settings(&app);
    let entry = add_entry(&mut settings, heard.as_deref(), &write)?;
    settings::write_settings(&app, settings);
    Ok(entry)
}

/// The dictionary as a file, for backup or moving to another Mac.
#[derive(Serialize, Deserialize, Debug, Default, PartialEq, Eq)]
struct DictionaryFile {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    words: Vec<String>,
    #[serde(default)]
    replacements: Vec<Replacement>,
    #[serde(default)]
    snippets: Vec<Snippet>,
}

/// How many entries an import added or changed.
#[derive(Serialize, Debug, Clone, Copy, PartialEq, Eq, Type)]
pub struct ImportSummary {
    pub words: u32,
    pub replacements: u32,
    pub snippets: u32,
}

/// Reads an exported dictionary, or a plain list: one word per line, or
/// "said -> written" (also "said → written" or tab-separated) per line.
fn parse_import(text: &str) -> Result<DictionaryFile, String> {
    let text = text.trim_start_matches('\u{feff}').trim();
    if text.starts_with('{') {
        return serde_json::from_str(text)
            .map_err(|_| "That file isn't a dictionary SilkScribe can read.".to_string());
    }
    let mut file = DictionaryFile::default();
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        let pair = ["->", "→", "\t"]
            .iter()
            .find_map(|separator| line.split_once(separator));
        match pair {
            Some((from, to)) => file.replacements.push(Replacement {
                from: from.trim().to_string(),
                to: to.trim().to_string(),
            }),
            None => file.words.push(line.to_string()),
        }
    }
    Ok(file)
}

fn merge(settings: &mut settings::AppSettings, file: DictionaryFile) -> ImportSummary {
    let words_before = settings.custom_words.clone();
    let mut words = settings.custom_words.clone();
    words.extend(file.words);
    settings.custom_words = clean_words(words);

    let replacements_before = settings.replacements.clone();
    let mut replacements = settings.replacements.clone();
    replacements.extend(file.replacements);
    settings.replacements = clean_replacements(replacements);

    let snippets_before = settings.snippets.clone();
    let mut snippets = settings.snippets.clone();
    snippets.extend(file.snippets);
    settings.snippets = clean_snippets(snippets);

    let new = |count: usize| u32::try_from(count).unwrap_or(u32::MAX);
    ImportSummary {
        words: new(settings
            .custom_words
            .iter()
            .filter(|word| !words_before.contains(word))
            .count()),
        replacements: new(settings
            .replacements
            .iter()
            .filter(|entry| !replacements_before.contains(entry))
            .count()),
        snippets: new(settings
            .snippets
            .iter()
            .filter(|entry| !snippets_before.contains(entry))
            .count()),
    }
}

#[tauri::command]
#[specta::specta]
pub fn import_dictionary(app: AppHandle, path: String) -> Result<ImportSummary, String> {
    let size = std::fs::metadata(&path)
        .map_err(|e| format!("Couldn't open the file: {e}"))?
        .len();
    if size > MAX_FILE_BYTES {
        return Err("That file is too large to be a dictionary.".to_string());
    }
    let text =
        std::fs::read_to_string(&path).map_err(|e| format!("Couldn't read the file: {e}"))?;
    let file = parse_import(&text)?;
    let mut settings = settings::get_settings(&app);
    let summary = merge(&mut settings, file);
    settings::write_settings(&app, settings);
    Ok(summary)
}

#[tauri::command]
#[specta::specta]
pub fn export_dictionary(app: AppHandle, path: String) -> Result<(), String> {
    let settings = settings::get_settings(&app);
    let file = DictionaryFile {
        version: 1,
        words: settings.custom_words,
        replacements: settings.replacements,
        snippets: settings.snippets,
    };
    let json = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    std::fs::write(&path, json + "\n").map_err(|e| format!("Couldn't save the file: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::get_default_settings;

    fn replacement(from: &str, to: &str) -> Replacement {
        Replacement {
            from: from.into(),
            to: to.into(),
        }
    }

    #[test]
    fn the_last_entry_for_a_phrase_wins() {
        let cleaned = clean_replacements(vec![
            replacement(" Gonna ", "going to"),
            replacement("", "nothing"),
            replacement("gonna!", "gonna"),
        ]);
        assert_eq!(cleaned, vec![replacement("gonna!", "gonna")]);
        assert_eq!(
            clean_words(vec!["Priya".into(), " priya ".into(), "".into()]),
            vec!["Priya".to_string()]
        );
    }

    #[test]
    fn a_correction_becomes_a_word_or_a_replacement() {
        let mut settings = get_default_settings();
        assert_eq!(
            add_entry(&mut settings, None, "Priya"),
            Ok(DictionaryEntry::Word)
        );
        assert_eq!(
            add_entry(&mut settings, Some("Priya"), "Priya"),
            Ok(DictionaryEntry::Word)
        );
        assert_eq!(settings.custom_words, vec!["Priya".to_string()]);
        assert_eq!(
            add_entry(&mut settings, Some("pre ah"), "Priya"),
            Ok(DictionaryEntry::Replacement)
        );
        assert_eq!(settings.replacements, vec![replacement("pre ah", "Priya")]);
        assert!(add_entry(&mut settings, Some("x"), "  ").is_err());
    }

    #[test]
    fn imports_read_exports_and_plain_lists() {
        let file = parse_import("Priya\nss -> SilkScribe\n\nk8s\tKubernetes\n").unwrap();
        assert_eq!(file.words, vec!["Priya".to_string()]);
        assert_eq!(
            file.replacements,
            vec![
                replacement("ss", "SilkScribe"),
                replacement("k8s", "Kubernetes")
            ]
        );
        let exported = DictionaryFile {
            version: 1,
            words: vec!["Priya".into()],
            replacements: vec![replacement("ss", "SilkScribe")],
            snippets: vec![Snippet {
                trigger: "sign off".into(),
                text: "Best,\nSam".into(),
            }],
        };
        let json = serde_json::to_string(&exported).unwrap();
        assert_eq!(parse_import(&json).unwrap(), exported);
        assert!(parse_import("{ not json").is_err());
    }

    #[test]
    fn merging_counts_only_what_changed() {
        let mut settings = get_default_settings();
        settings.custom_words = vec!["Priya".into()];
        settings.replacements = vec![replacement("ss", "SS")];
        let summary = merge(
            &mut settings,
            DictionaryFile {
                words: vec!["priya".into(), "Kubernetes".into()],
                replacements: vec![replacement("ss", "SilkScribe")],
                ..Default::default()
            },
        );
        assert_eq!(
            summary,
            ImportSummary {
                words: 1,
                replacements: 1,
                snippets: 0
            }
        );
        assert_eq!(settings.replacements, vec![replacement("ss", "SilkScribe")]);
    }
}
