use super::types::*;
use anyhow::{bail, Result};
fn timestamp(seconds: f64, separator: char) -> String {
    let ms = (seconds.max(0.0) * 1000.0).round() as u64;
    format!(
        "{:02}:{:02}:{:02}{}{:03}",
        ms / 3600000,
        ms / 60000 % 60,
        ms / 1000 % 60,
        separator,
        ms % 1000
    )
}
pub fn render(doc: &Document, format: &str) -> Result<String> {
    let speaker = |s: &Segment| {
        s.speaker
            .as_ref()
            .and_then(|id| doc.speakers.iter().find(|p| &p.id == id))
            .map(|s| format!("{}: ", s.name))
            .unwrap_or_default()
    };
    match format {
        "json" => Ok(serde_json::to_string_pretty(doc)?),
        "txt" => Ok(format!(
            "{}\n\n{}",
            doc.title,
            doc.segments
                .iter()
                .map(|s| format!("{}{}", speaker(s), s.text))
                .collect::<Vec<_>>()
                .join("\n\n")
        )),
        "md" => {
            let mut out = format!("# {}\n\n", doc.title);
            if let Some(notes) = &doc.notes {
                for (title, items) in [("Summary", &notes.summary), ("Decisions", &notes.decisions)]
                {
                    out.push_str(&format!("## {title}\n\n"));
                    for item in items {
                        out.push_str(&format!("- {}\n", item.text));
                    }
                    out.push('\n');
                }
                out.push_str("## Action items\n\n");
                for a in &notes.actions {
                    out.push_str(&format!(
                        "- [{}] {}{}{}\n",
                        if a.done { "x" } else { " " },
                        a.text,
                        a.owner
                            .as_ref()
                            .map(|v| format!(" — {v}"))
                            .unwrap_or_default(),
                        a.due
                            .as_ref()
                            .map(|v| format!(" ({v})"))
                            .unwrap_or_default()
                    ));
                }
            }
            out.push_str("\n## Transcript\n\n");
            for s in &doc.segments {
                out.push_str(&format!(
                    "**{} {}**\n\n{}\n\n",
                    timestamp(s.start, '.'),
                    speaker(s),
                    s.text
                ));
            }
            Ok(out)
        }
        "srt" | "vtt" => {
            if doc.history_id.is_some() {
                bail!(
                    "This older dictation has no segment timestamps. Export as text or Markdown."
                );
            }
            let mut out = if format == "vtt" {
                "WEBVTT\n\n".to_string()
            } else {
                String::new()
            };
            let sep = if format == "srt" { ',' } else { '.' };
            for (index, s) in doc
                .segments
                .iter()
                .filter(|s| s.end > s.start && !s.text.trim().is_empty())
                .enumerate()
            {
                let text = format!("{}{}", speaker(s), s.text)
                    .replace("-->", "→")
                    .replace('\r', "")
                    .replace('\n', " ");
                out.push_str(&format!(
                    "{}\n{} --> {}\n{}\n\n",
                    index + 1,
                    timestamp(s.start, sep),
                    timestamp(s.end, sep),
                    text
                ));
            }
            Ok(out)
        }
        _ => bail!("Unsupported export format"),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timestamp_carries_and_clamps() {
        assert_eq!(timestamp(59.9999, ','), "00:01:00,000");
        assert_eq!(timestamp(-1.0, '.'), "00:00:00.000");
        assert_eq!(timestamp(3661.123, ','), "01:01:01,123");
    }
}
