//! Notes templates: what AI notes look for in a kind of meeting. Every
//! template keeps a summary and action items; "General" adds decisions, the
//! others add sections of their own (a standup's blockers, an interview's
//! concerns). The app lists the same ids in `src/components/workspace/api.ts`.

use anyhow::{bail, Result};

pub struct TemplateSection {
    pub id: &'static str,
    /// English, for exports and the model. The app translates by id.
    pub title: &'static str,
    /// What belongs in the section, for the model.
    pub guidance: &'static str,
}

pub struct NotesTemplate {
    pub id: &'static str,
    /// The kind of meeting, for the model.
    pub meeting: &'static str,
    pub decisions: bool,
    pub sections: &'static [TemplateSection],
}

pub const GENERAL: &str = "general";

pub const TEMPLATES: &[NotesTemplate] = &[
    NotesTemplate {
        id: GENERAL,
        meeting: "a meeting",
        decisions: true,
        sections: &[],
    },
    NotesTemplate {
        id: "one_on_one",
        meeting: "a one-on-one between a manager and someone on their team",
        decisions: false,
        sections: &[
            TemplateSection {
                id: "updates",
                title: "Updates",
                guidance: "progress and news each person shared",
            },
            TemplateSection {
                id: "feedback",
                title: "Feedback",
                guidance: "feedback given in either direction",
            },
            TemplateSection {
                id: "blockers",
                title: "Blockers",
                guidance: "what is in the way, and who can help",
            },
        ],
    },
    NotesTemplate {
        id: "standup",
        meeting: "a team standup",
        decisions: false,
        sections: &[
            TemplateSection {
                id: "done",
                title: "Done",
                guidance: "what each person finished since the last standup",
            },
            TemplateSection {
                id: "next",
                title: "Next",
                guidance: "what each person plans to do next",
            },
            TemplateSection {
                id: "blockers",
                title: "Blockers",
                guidance: "what is in the way, and who can help",
            },
        ],
    },
    NotesTemplate {
        id: "customer_call",
        meeting: "a call with a customer",
        decisions: false,
        sections: &[
            TemplateSection {
                id: "context",
                title: "Customer context",
                guidance: "who the customer is, their situation and their goals",
            },
            TemplateSection {
                id: "pain_points",
                title: "Pain points",
                guidance: "problems the customer described, in their words where possible",
            },
            TemplateSection {
                id: "requests",
                title: "Requests",
                guidance: "features, changes or help the customer asked for",
            },
        ],
    },
    NotesTemplate {
        id: "interview",
        meeting: "a job interview",
        decisions: false,
        sections: &[
            TemplateSection {
                id: "background",
                title: "Background",
                guidance: "the candidate's experience and situation",
            },
            TemplateSection {
                id: "strengths",
                title: "Strengths",
                guidance: "evidence of the candidate's strengths",
            },
            TemplateSection {
                id: "concerns",
                title: "Concerns",
                guidance: "gaps, risks or open questions about fit",
            },
        ],
    },
    NotesTemplate {
        id: "lecture",
        meeting: "a lecture or class",
        decisions: false,
        sections: &[
            TemplateSection {
                id: "concepts",
                title: "Key concepts",
                guidance: "the main ideas explained",
            },
            TemplateSection {
                id: "definitions",
                title: "Definitions",
                guidance: "terms that were defined, with their meaning",
            },
            TemplateSection {
                id: "questions",
                title: "Questions",
                guidance: "questions asked, or left open",
            },
        ],
    },
];

pub fn find(id: &str) -> Option<&'static NotesTemplate> {
    TEMPLATES.iter().find(|template| template.id == id)
}

/// Checks a template id from the app; "general" is stored as none.
pub fn normalize(id: Option<String>) -> Result<Option<String>> {
    match id.as_deref() {
        None | Some(GENERAL) => Ok(None),
        Some(id) if find(id).is_some() => Ok(Some(id.to_string())),
        Some(_) => bail!("Unknown notes template."),
    }
}

/// What the notes worker needs to follow a template, or null for General.
pub fn worker_spec(id: Option<&str>) -> serde_json::Value {
    let Some(template) = id.and_then(find).filter(|template| template.id != GENERAL) else {
        return serde_json::Value::Null;
    };
    serde_json::json!({
        "id": template.id,
        "meeting": template.meeting,
        "decisions": template.decisions,
        "sections": template.sections.iter().map(|section| serde_json::json!({
            "id": section.id,
            "title": section.title,
            "guidance": section.guidance,
        })).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn section_ids_are_unique_and_never_a_core_section() {
        for template in TEMPLATES {
            let mut ids: Vec<&str> = template.sections.iter().map(|s| s.id).collect();
            ids.sort_unstable();
            ids.dedup();
            assert_eq!(ids.len(), template.sections.len(), "{}", template.id);
            for id in ids {
                assert!(
                    !matches!(id, "summary" | "decisions" | "actions" | "sections"),
                    "{}",
                    template.id
                );
            }
        }
    }

    #[test]
    fn general_is_the_default_and_unknown_ids_are_refused() {
        assert_eq!(normalize(Some("general".into())).unwrap(), None);
        assert_eq!(normalize(None).unwrap(), None);
        assert_eq!(
            normalize(Some("standup".into())).unwrap().as_deref(),
            Some("standup")
        );
        assert!(normalize(Some("nope".into())).is_err());
        assert!(worker_spec(None).is_null());
        assert!(worker_spec(Some(GENERAL)).is_null());
        assert_eq!(
            worker_spec(Some("standup"))["sections"][2]["id"],
            "blockers"
        );
    }
}
