//! Recipes: saved instructions the local notes engine follows to write
//! something from meetings, such as a follow-up email or a weekly recap.
//! What it writes cites the passages it comes from, like Ask.

use super::types::{AskSource, Document};

/// Built-in recipes: an id the app names in its own words, and the
/// instruction the notes engine follows.
pub const RECIPES: &[(&str, &str)] = &[
    (
        "follow_up_email",
        "Write a short follow-up email to the people in this meeting. Thank them, recap what was decided, and list each next step with who does it and by when, where the meeting said so.",
    ),
    (
        "action_items",
        "List every action item from this meeting as a checklist: what will be done, who does it, and by when, where the meeting said so.",
    ),
    (
        "customer_notes",
        "Write account notes from this customer conversation: who took part, their situation and goals, concerns or objections, what was agreed, and next steps.",
    ),
    (
        "interview_summary",
        "Write an interview summary: the candidate's relevant experience, strengths, concerns, and notable answers, each tied to what was said. Don't give a hiring decision.",
    ),
    (
        "weekly_recap",
        "Write a recap of these meetings for someone who missed them: the main topics, what was decided, and what's still open, grouped by topic rather than by meeting.",
    ),
];

/// The recipe that runs over the past week's meetings rather than one.
pub const WEEKLY: &str = "weekly_recap";
/// How far back the weekly recap looks, in seconds.
pub const WEEK: i64 = 7 * 24 * 3600;
/// Meetings the weekly recap reads at most, newest kept.
pub const WEEKLY_LIMIT: usize = 12;
/// Longest custom instruction, in characters.
pub const CUSTOM_LIMIT: usize = 1000;

/// The instruction for a recipe id, or a person's own words for "custom".
pub fn instruction(recipe: &str, custom: Option<&str>) -> Option<String> {
    if recipe == "custom" {
        let text = custom?.trim();
        return (!text.is_empty()).then(|| text.chars().take(CUSTOM_LIMIT).collect());
    }
    RECIPES
        .iter()
        .find(|(id, _)| *id == recipe)
        .map(|(_, text)| text.to_string())
}

/// What the engine reads for a recipe, in meeting order: each meeting's typed
/// notes, then its transcript in passages of a few sentences, each starting
/// where its first segment does.
pub fn passages(documents: &[(Document, String)], limit: usize) -> Vec<AskSource> {
    const TARGET_CHARS: usize = 600;
    let mut out: Vec<AskSource> = Vec::new();
    let push = |doc: &Document, start: Option<f64>, text: String, out: &mut Vec<AskSource>| {
        if out.len() < limit && !text.trim().is_empty() {
            out.push(AskSource {
                id: format!("p{}", out.len() + 1),
                document_id: doc.id.clone(),
                title: doc.title.clone(),
                created_at: doc.created_at,
                start,
                text,
            });
        }
    };
    for (doc, typed) in documents {
        push(doc, None, typed.trim().to_string(), &mut out);
        let mut text = String::new();
        let mut start = None;
        for segment in &doc.segments {
            if text.is_empty() {
                start = Some(segment.start);
            } else {
                text.push(' ');
            }
            text.push_str(segment.text.trim());
            if text.len() >= TARGET_CHARS {
                push(doc, start, std::mem::take(&mut text), &mut out);
            }
        }
        push(doc, start, text, &mut out);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn built_in_recipes_and_custom_ones_have_instructions() {
        assert!(instruction("follow_up_email", None)
            .unwrap()
            .contains("follow-up email"));
        assert!(instruction("nope", None).is_none());
        assert_eq!(
            instruction("custom", Some("  Draft a tweet  ")).as_deref(),
            Some("Draft a tweet")
        );
        assert!(instruction("custom", Some("   ")).is_none());
        let long = "x".repeat(CUSTOM_LIMIT + 50);
        assert_eq!(
            instruction("custom", Some(&long)).unwrap().len(),
            CUSTOM_LIMIT
        );
    }

    #[test]
    fn passages_keep_meeting_order_with_typed_notes_first() {
        let mut doc = crate::workspace::store::tests_support::document();
        doc.segments[0].text = "a".repeat(700);
        let passages = passages(&[(doc.clone(), "- my point".into())], 10);
        assert_eq!(passages[0].text, "- my point");
        assert_eq!(passages[0].start, None);
        assert_eq!(passages[1].start, Some(doc.segments[0].start));
        assert_eq!(passages[1].id, "p2");
        assert!(passages.iter().all(|p| p.document_id == doc.id));
        assert_eq!(super::passages(&[(doc, String::new())], 1).len(), 1);
    }
}
