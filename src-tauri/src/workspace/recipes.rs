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
/// Roughly what the engine reads for a recipe, in characters: the worker
/// stops at 14,000 tokens (`RECIPE_TOKEN_LIMIT`), about 3.5 characters each,
/// less room for each passage's id, title and date.
const RECIPE_CHARS: usize = 40_000;

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

/// What the engine reads for a recipe, in meeting order. One meeting is read
/// in full: its typed notes, then its transcript in passages of a few
/// sentences, each starting where its first segment does. Several meetings
/// (the weekly recap) are read by their notes, typed and AI, action items
/// included, so every meeting fits; only a meeting without notes falls back
/// to its transcript, and only to its even share of what the engine reads.
pub fn passages(documents: &[(Document, String)], limit: usize) -> Vec<AskSource> {
    const TARGET_CHARS: usize = 600;
    let several = documents.len() > 1;
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
    // A meeting read by its transcript gets an even share, so one without
    // notes can't crowd out the rest of the week.
    let share = if several {
        RECIPE_CHARS / documents.len()
    } else {
        usize::MAX
    };
    for (doc, typed) in documents {
        push(doc, None, typed.trim().to_string(), &mut out);
        let start_of = |sources: &[String]| {
            sources
                .first()
                .and_then(|id| doc.segments.iter().find(|s| &s.id == id))
                .map(|s| s.start)
        };
        let notes: Vec<_> = doc.notes.iter().flat_map(|notes| notes.items()).collect();
        let actions: Vec<_> = doc.notes.iter().flat_map(|notes| &notes.actions).collect();
        if several && (!notes.is_empty() || !actions.is_empty() || !typed.trim().is_empty()) {
            for item in notes {
                push(
                    doc,
                    start_of(&item.sources),
                    item.text.trim().to_string(),
                    &mut out,
                );
            }
            for action in actions.into_iter().filter(|a| !a.text.trim().is_empty()) {
                let mut details = Vec::new();
                if let Some(owner) = action.owner.as_deref().filter(|o| !o.trim().is_empty()) {
                    details.push(format!("owner: {}", owner.trim()));
                }
                if let Some(due) = action.due.as_deref().filter(|d| !d.trim().is_empty()) {
                    details.push(format!("due: {}", due.trim()));
                }
                if action.done {
                    details.push("done".to_string());
                }
                let mut text = format!("Action item: {}", action.text.trim());
                if !details.is_empty() {
                    text.push_str(&format!(" ({})", details.join(", ")));
                }
                push(doc, start_of(&action.sources), text, &mut out);
            }
            continue;
        }
        let mut text = String::new();
        let mut start = None;
        let mut used = 0;
        for segment in &doc.segments {
            if used >= share {
                break;
            }
            if text.is_empty() {
                start = Some(segment.start);
            } else {
                text.push(' ');
            }
            text.push_str(segment.text.trim());
            if text.len() >= TARGET_CHARS {
                used += text.len();
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

    #[test]
    fn a_weekly_recap_reads_every_meeting_by_its_notes() {
        use crate::workspace::types::{ActionItem, NoteItem, Notes};
        let mut week = Vec::new();
        for n in 0..12 {
            let mut doc = crate::workspace::store::tests_support::document();
            doc.id = format!("m{n}");
            // Long meetings: their transcripts alone would fill the budget.
            doc.segments[0].text = "talk ".repeat(2_000);
            doc.notes = Some(Notes {
                summary: vec![NoteItem {
                    text: format!("Decided item {n}"),
                    sources: vec![doc.segments[0].id.clone()],
                    evidence: vec![],
                    origin: Default::default(),
                }],
                ..Default::default()
            });
            week.push((doc, String::new()));
        }
        let read = passages(&week, 400);
        assert_eq!(read.len(), 12);
        for n in 0..12 {
            assert!(read.iter().any(|p| p.document_id == format!("m{n}")));
        }
        assert!(read.iter().all(|p| p.text.starts_with("Decided item")));
        assert!(read.iter().all(|p| p.start.is_some()));

        // Action items are what's still open, so the recap reads them too.
        let source = week[3].0.segments[0].id.clone();
        week[3].0.notes.as_mut().unwrap().actions = vec![ActionItem {
            text: "Send the pricing deck".into(),
            owner: Some("Priya".into()),
            due: Some("Friday".into()),
            sources: vec![source],
            evidence: vec![],
            done: false,
            origin: Default::default(),
        }];
        let read = passages(&week, 400);
        assert_eq!(read.len(), 13);
        let action = read
            .iter()
            .find(|p| p.text.contains("Send the pricing deck"))
            .unwrap();
        assert_eq!(action.document_id, "m3");
        assert!(action.text.contains("owner: Priya"));
        assert!(action.text.contains("due: Friday"));
        assert!(action.start.is_some());
    }

    #[test]
    fn a_meeting_without_notes_cant_crowd_out_the_week() {
        use crate::workspace::types::{NoteItem, Notes, Segment};
        let mut week = Vec::new();
        // The oldest meeting has no notes and a long transcript.
        let mut long = crate::workspace::store::tests_support::document();
        long.id = "long".into();
        long.segments = (0..400)
            .map(|n| Segment {
                id: format!("s{n}"),
                start: n as f64,
                end: n as f64 + 1.0,
                text: "word ".repeat(40),
                original_text: String::new(),
                speaker: None,
            })
            .collect();
        week.push((long, String::new()));
        for n in 0..3 {
            let mut doc = crate::workspace::store::tests_support::document();
            doc.id = format!("m{n}");
            doc.notes = Some(Notes {
                summary: vec![NoteItem {
                    text: format!("Decided item {n}"),
                    sources: vec![],
                    evidence: vec![],
                    origin: Default::default(),
                }],
                ..Default::default()
            });
            week.push((doc, String::new()));
        }
        let read = passages(&week, 400);
        let long_chars: usize = read
            .iter()
            .filter(|p| p.document_id == "long")
            .map(|p| p.text.len())
            .sum();
        assert!(long_chars > 0);
        assert!(long_chars <= RECIPE_CHARS / week.len() + 600 + 200);
        for n in 0..3 {
            assert!(read.iter().any(|p| p.document_id == format!("m{n}")));
        }
    }
}
