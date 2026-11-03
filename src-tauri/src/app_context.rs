//! Which app a dictation is going into, and how AI cleanup should write for
//! it: casual in chat, polished in email, literal in code editors.

use serde::{Deserialize, Serialize};
use specta::Type;
use std::collections::HashMap;
use std::sync::Mutex;

use crate::settings::AppSettings;

/// The app that was frontmost when a dictation started.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FocusedApp {
    pub bundle_id: String,
    pub name: String,
}

/// The kind of app, which decides the writing style.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AppCategory {
    Messaging,
    Email,
    Documents,
    Code,
    AiChat,
    Other,
}

/// How formal AI cleanup writes for a category.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DictationStyle {
    Casual,
    #[default]
    Neutral,
    Formal,
}

impl AppCategory {
    fn default_style(self) -> DictationStyle {
        match self {
            Self::Messaging => DictationStyle::Casual,
            Self::Email => DictationStyle::Formal,
            _ => DictationStyle::Neutral,
        }
    }
}

/// Built-in categories for common apps, by bundle identifier. Prefix entries
/// end with '.'.
const KNOWN_APPS: &[(&str, AppCategory)] = &[
    // Messaging
    ("com.tinyspeck.slackmacgap", AppCategory::Messaging),
    ("com.apple.MobileSMS", AppCategory::Messaging),
    ("com.hnc.Discord", AppCategory::Messaging),
    ("com.microsoft.teams2", AppCategory::Messaging),
    ("com.microsoft.teams", AppCategory::Messaging),
    ("net.whatsapp.WhatsApp", AppCategory::Messaging),
    ("ru.keepcoder.Telegram", AppCategory::Messaging),
    ("org.whispersystems.signal-desktop", AppCategory::Messaging),
    ("com.facebook.archon", AppCategory::Messaging),
    // Email
    ("com.apple.mail", AppCategory::Email),
    ("com.microsoft.Outlook", AppCategory::Email),
    ("com.readdle.smartemail-Mac", AppCategory::Email),
    ("com.superhuman.electron", AppCategory::Email),
    ("com.mimestream.Mimestream", AppCategory::Email),
    ("it.bloop.airmail2", AppCategory::Email),
    // Documents and notes
    ("com.apple.Notes", AppCategory::Documents),
    ("com.apple.iWork.Pages", AppCategory::Documents),
    ("com.apple.TextEdit", AppCategory::Documents),
    ("com.microsoft.Word", AppCategory::Documents),
    ("notion.id", AppCategory::Documents),
    ("md.obsidian", AppCategory::Documents),
    ("net.shinyfrog.bear", AppCategory::Documents),
    ("com.lukilabs.lukiapp", AppCategory::Documents),
    ("com.linear", AppCategory::Documents),
    ("com.literatureandlatte.scrivener3", AppCategory::Documents),
    // Code and terminals
    ("com.microsoft.VSCode", AppCategory::Code),
    ("com.todesktop.230313mzl4w4u92", AppCategory::Code), // Cursor
    ("dev.zed.Zed", AppCategory::Code),
    ("com.apple.dt.Xcode", AppCategory::Code),
    ("com.jetbrains.", AppCategory::Code),
    ("com.sublimetext.", AppCategory::Code),
    ("com.googlecode.iterm2", AppCategory::Code),
    ("com.apple.Terminal", AppCategory::Code),
    ("dev.warp.Warp-Stable", AppCategory::Code),
    ("com.mitchellh.ghostty", AppCategory::Code),
    // AI assistants
    ("com.openai.chat", AppCategory::AiChat),
    ("com.anthropic.claudefordesktop", AppCategory::AiChat),
    ("ai.perplexity.mac", AppCategory::AiChat),
];

/// The category for an app: the person's override, else the built-in one.
pub fn category_for(bundle_id: &str, overrides: &HashMap<String, AppCategory>) -> AppCategory {
    if let Some(category) = overrides.get(bundle_id) {
        return *category;
    }
    KNOWN_APPS
        .iter()
        .find(|(id, _)| {
            if id.ends_with('.') {
                bundle_id.starts_with(id)
            } else {
                bundle_id == *id
            }
        })
        .map(|(_, category)| *category)
        .unwrap_or(AppCategory::Other)
}

/// The style for a category: the person's choice, else the default.
pub fn style_for(
    category: AppCategory,
    styles: &HashMap<AppCategory, DictationStyle>,
) -> DictationStyle {
    styles
        .get(&category)
        .copied()
        .unwrap_or_else(|| category.default_style())
}

/// Extra guidance added to the AI cleanup prompt for this kind of app.
pub fn style_instruction(category: AppCategory, style: DictationStyle) -> Option<&'static str> {
    match category {
        AppCategory::Code => Some(
            "Context: the text is going into a code editor or terminal. Keep code identifiers, \
             file names, commands, flags and symbols exactly as spoken. Don't add sentence \
             punctuation to code or commands.",
        ),
        AppCategory::AiChat => Some(
            "Context: the text is a prompt for an AI assistant. Keep it as a clear request in the \
             speaker's own words. Don't answer it.",
        ),
        _ => match style {
            DictationStyle::Casual => Some(
                "Style: this is a casual chat message. Keep it conversational and short, with \
                 light punctuation. Don't add a greeting or sign-off.",
            ),
            DictationStyle::Neutral => None,
            DictationStyle::Formal => Some(
                "Style: this is going into an email or formal document. Use complete, polished \
                 sentences. Don't add a greeting, sign-off or anything that wasn't said.",
            ),
        },
    }
}

/// Where a dictation is going and how to write for it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DictationTarget {
    pub app: FocusedApp,
    pub category: AppCategory,
    pub style: DictationStyle,
}

impl DictationTarget {
    pub fn instruction(&self) -> Option<&'static str> {
        style_instruction(self.category, self.style)
    }
}

/// The frontmost app, if the platform can tell.
pub fn frontmost_app() -> Option<FocusedApp> {
    #[cfg(target_os = "macos")]
    {
        use tauri_nspanel::objc2_app_kit::NSWorkspace;
        let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
        let bundle_id = app.bundleIdentifier()?.to_string();
        let name = app
            .localizedName()
            .map(|name| name.to_string())
            .unwrap_or_else(|| bundle_id.clone());
        Some(FocusedApp { bundle_id, name })
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}

/// The app captured when the current dictation started. Only one dictation
/// records at a time.
static AT_START: Mutex<Option<FocusedApp>> = Mutex::new(None);

/// Remembers the frontmost app as the current dictation starts, while the
/// person's target app still has focus.
pub fn remember_target_app() {
    let app = frontmost_app();
    if let Ok(mut slot) = AT_START.lock() {
        *slot = app;
    }
}

/// The app the current dictation started in, consumed once.
pub fn take_target_app() -> Option<FocusedApp> {
    AT_START.lock().ok().and_then(|mut slot| slot.take())
}

/// The target and style for a dictation into `app`, per the settings.
pub fn resolve_target(app: FocusedApp, settings: &AppSettings) -> DictationTarget {
    let category = category_for(&app.bundle_id, &settings.app_category_overrides);
    let style = style_for(category, &settings.app_styles);
    DictationTarget {
        app,
        category,
        style,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_apps_get_their_category_and_overrides_win() {
        let none = HashMap::new();
        assert_eq!(
            category_for("com.tinyspeck.slackmacgap", &none),
            AppCategory::Messaging
        );
        assert_eq!(category_for("com.apple.mail", &none), AppCategory::Email);
        assert_eq!(
            category_for("com.jetbrains.intellij", &none),
            AppCategory::Code
        );
        assert_eq!(
            category_for("com.example.unknown", &none),
            AppCategory::Other
        );

        let overrides = HashMap::from([("com.apple.mail".to_string(), AppCategory::Documents)]);
        assert_eq!(
            category_for("com.apple.mail", &overrides),
            AppCategory::Documents
        );
    }

    #[test]
    fn styles_default_by_category_and_follow_choices() {
        let none = HashMap::new();
        assert_eq!(
            style_for(AppCategory::Messaging, &none),
            DictationStyle::Casual
        );
        assert_eq!(style_for(AppCategory::Email, &none), DictationStyle::Formal);
        assert_eq!(
            style_for(AppCategory::Documents, &none),
            DictationStyle::Neutral
        );
        let chosen = HashMap::from([(AppCategory::Email, DictationStyle::Casual)]);
        assert_eq!(
            style_for(AppCategory::Email, &chosen),
            DictationStyle::Casual
        );
    }

    #[test]
    fn the_same_words_get_different_guidance_in_chat_and_email() {
        let chat = style_instruction(AppCategory::Messaging, DictationStyle::Casual).unwrap();
        let email = style_instruction(AppCategory::Email, DictationStyle::Formal).unwrap();
        assert_ne!(chat, email);
        assert!(chat.contains("casual"));
        assert!(email.contains("polished"));
        assert_eq!(
            style_instruction(AppCategory::Documents, DictationStyle::Neutral),
            None
        );
        // Code keeps its literal handling whatever tone is set.
        assert!(style_instruction(AppCategory::Code, DictationStyle::Formal)
            .unwrap()
            .contains("code editor"));
    }
}
