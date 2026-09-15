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
#[derive(Clone, serde::Deserialize, specta::Type)]
pub struct ExportContent {
    #[serde(default)]
    pub original_text: bool,
    pub transcript: bool,
    pub notes: bool,
    pub speakers: bool,
}
pub fn render_content(
    doc: &Document,
    format: &str,
    content: Option<ExportContent>,
) -> Result<String> {
    let Some(content) = content else {
        return render(doc, format);
    };
    if !content.transcript
        && (!content.notes || doc.notes.is_none() || !matches!(format, "md" | "json"))
    {
        bail!("Choose content to export.");
    }
    let mut selected = doc.clone();
    if content.original_text {
        for segment in &mut selected.segments {
            segment.text = segment.original_text.clone();
        }
    }
    if !content.notes {
        selected.notes = None;
    }
    if !content.transcript {
        selected.segments.clear();
        selected.turns.clear();
    }
    if !content.speakers {
        selected.speakers.clear();
        selected.turns.clear();
        selected.original_turns = None;
        for segment in &mut selected.segments {
            segment.speaker = None;
        }
    }
    let mut evidence = doc.segments.clone();
    if !content.speakers {
        for segment in &mut evidence {
            segment.speaker = None;
        }
    }
    let mut output = render_with_evidence(&selected, format, &evidence)?;
    if format == "json" {
        let mut value: serde_json::Value = serde_json::from_str(&output)?;
        value["text_version"] = serde_json::json!(if content.original_text {
            "original"
        } else {
            "edited"
        });
        output = serde_json::to_string_pretty(&value)?;
    }
    if !content.transcript && format == "md" {
        output = output.replace("\n## Transcript\n\n", "");
    }
    Ok(output)
}
pub fn render(doc: &Document, format: &str) -> Result<String> {
    render_with_evidence(doc, format, &doc.segments)
}
fn render_with_evidence(
    doc: &Document,
    format: &str,
    source_segments: &[Segment],
) -> Result<String> {
    let mut normalized = doc.clone();
    if let Some(notes) = &mut normalized.notes {
        let revision = (notes.transcript_revision == doc.revision).then_some(doc.revision);
        super::store::capture_note_evidence(
            notes,
            source_segments,
            revision,
            doc.history_id.is_none(),
        );
    }
    let doc = &normalized;
    let mut evidence: Vec<&NoteEvidence> = Vec::new();
    if let Some(notes) = &doc.notes {
        for item in notes
            .summary
            .iter()
            .chain(&notes.decisions)
            .flat_map(|n| &n.evidence)
            .chain(notes.actions.iter().flat_map(|n| &n.evidence))
        {
            if !evidence.contains(&item) {
                evidence.push(item);
            }
        }
    }
    let citations = |snapshots: &[NoteEvidence]| -> String {
        snapshots
            .iter()
            .filter_map(|snapshot| evidence.iter().position(|s| *s == snapshot))
            .map(|index| format!(" [^source-{}]", index + 1))
            .collect()
    };
    let speaker = |s: &Segment| {
        s.speaker
            .as_ref()
            .and_then(|id| doc.speakers.iter().find(|p| &p.id == id))
            .map(|s| format!("{}: ", s.name))
            .unwrap_or_default()
    };
    match format {
        "json" => Ok(serde_json::to_string_pretty(&serde_json::json!({
            "schema":"silkscribe.transcript","version":1,"title":doc.title,"source":doc.source,
            "text_version":"edited",
            "created_at":doc.created_at,"duration":doc.duration,"segments":doc.segments,
            "speakers":doc.speakers,"overlapping_turns":doc.turns,"notes":doc.notes,
            "original_overlapping_turns":doc.original_turns,
            "evidence": evidence.iter().map(|s| serde_json::json!({
                "id": s.segment_id, "text": s.text, "speaker": null,
                "start": s.start, "end": s.end, "transcript_revision": s.transcript_revision
            })).collect::<Vec<_>>(),
            "timing": if doc.history_id.is_some() { "unavailable" } else { "segments" },
            "notes_outdated":doc.notes.as_ref().is_some_and(|n|n.transcript_revision!=doc.revision)
        }))?),
        "txt" => Ok(format!(
            "{}\n\n{}",
            doc.title,
            doc.segments
                .iter()
                .map(|s| if doc.history_id.is_some() {
                    format!("{}{}", speaker(s), s.text)
                } else {
                    format!("[{}] {}{}", timestamp(s.start, '.'), speaker(s), s.text)
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        )),
        "md" => {
            let mut out = format!("# {}\n\n", doc.title);
            if doc
                .notes
                .as_ref()
                .is_some_and(|notes| notes.transcript_revision != doc.revision)
            {
                out.push_str(
                    "> These notes were generated from an earlier transcript revision.\n\n",
                );
            }
            if let Some(notes) = &doc.notes {
                for (title, items) in [("Summary", &notes.summary), ("Decisions", &notes.decisions)]
                {
                    out.push_str(&format!("## {title}\n\n"));
                    for item in items {
                        out.push_str(&format!("- {}{}\n", item.text, citations(&item.evidence)));
                    }
                    out.push('\n');
                }
                out.push_str("## Action items\n\n");
                for a in &notes.actions {
                    out.push_str(&format!(
                        "- [{}] {}{}{}{}\n",
                        if a.done { "x" } else { " " },
                        a.text,
                        a.owner
                            .as_ref()
                            .map(|v| format!(" — {v}"))
                            .unwrap_or_default(),
                        a.due
                            .as_ref()
                            .map(|v| format!(" ({v})"))
                            .unwrap_or_default(),
                        citations(&a.evidence)
                    ));
                }
            }
            out.push_str("\n## Transcript\n\n");
            for s in &doc.segments {
                out.push_str(&format!(
                    "**{} {}**\n\n{}\n\n",
                    if doc.history_id.is_some() {
                        String::new()
                    } else {
                        timestamp(s.start, '.')
                    },
                    speaker(s),
                    s.text
                ));
            }
            if !evidence.is_empty() {
                out.push_str("## Sources\n\n");
                for (index, segment) in evidence.iter().enumerate() {
                    out.push_str(&format!(
                        "[^source-{}]: {}{}{}\n\n",
                        index + 1,
                        segment
                            .start
                            .map(|start| format!("[{}] ", timestamp(start, '.')))
                            .unwrap_or_default(),
                        "",
                        segment.text.replace(['\r', '\n'], " ")
                    ));
                }
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
            let mut cues: Vec<_> = doc
                .segments
                .iter()
                .filter(|s| !s.text.trim().is_empty())
                .collect();
            if cues.iter().any(|s| {
                !s.start.is_finite() || !s.end.is_finite() || s.start < 0.0 || s.end < s.start
            }) {
                bail!("Subtitle timestamps are invalid. Repair the transcript timing before exporting.");
            }
            // Subtitle precision cannot represent a shorter interval. Do not
            // invent an end time to make a collapsed cue parse successfully.
            cues.retain(|s| (s.end * 1000.0).round() > (s.start * 1000.0).round());
            cues.sort_by(|a, b| a.start.total_cmp(&b.start));
            for (index, s) in cues.into_iter().enumerate() {
                let mut text = format!("{}{}", speaker(s), s.text)
                    .replace('\r', "")
                    .replace('\n', " ");
                if format == "vtt" {
                    text = text
                        .replace('&', "&amp;")
                        .replace('<', "&lt;")
                        .replace('>', "&gt;");
                } else {
                    text = text.replace("-->", "→");
                }
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
    fn document() -> Document {
        Document {
            id: "meeting-1".into(),
            title: "Design review".into(),
            source: Source::Meeting,
            created_at: 100,
            duration: 20.0,
            stage: Stage::Complete,
            progress: 1.0,
            error: None,
            failed_stage: None,
            saved: false,
            audio_path: None,
            segments: vec![Segment {
                id: "s0".into(),
                start: 1.0,
                end: 2.0,
                text: "Ship Friday".into(),
                original_text: "Ship Friday".into(),
                speaker: None,
            }],
            speakers: vec![],
            turns: vec![],
            notes: None,
            notes_candidate: None,
            original_turns: None,
            retry_stage: None,
            options: JobOptions::default(),
            notes_section: None,
            attempt_id: String::new(),
            revision: 0,
            history_id: None,
            diarized: false,
            stage_errors: vec![],
        }
    }
    #[test]
    fn subtitles_preserve_literal_text_overlap_and_original_boundaries() {
        let mut doc = document();
        doc.segments[0].text = "<b>literal</b> & -->".into();
        let mut earlier = doc.segments[0].clone();
        earlier.id = "earlier".into();
        earlier.start = 0.5;
        earlier.end = 1.5;
        earlier.text = "First".into();
        doc.segments.push(earlier);
        let vtt = render(&doc, "vtt").unwrap();
        assert!(vtt.contains("1\n00:00:00.500 --> 00:00:01.500\nFirst"));
        assert!(vtt
            .contains("2\n00:00:01.000 --> 00:00:02.000\n&lt;b&gt;literal&lt;/b&gt; &amp; --&gt;"));
        assert_eq!(doc.segments[0].start, 1.0);
    }
    #[test]
    fn subtitles_reject_invalid_timing_and_omit_unrepresentable_intervals() {
        let mut doc = document();
        doc.segments[0].end = 1.0001;
        assert_eq!(render(&doc, "vtt").unwrap(), "WEBVTT\n\n");
        doc.segments[0].start = f64::NAN;
        assert!(render(&doc, "vtt").is_err());
        doc.segments[0].start = -1.0;
        assert!(render(&doc, "srt").is_err());
    }
    #[test]
    #[ignore = "Requires development ffprobe; run explicitly for subtitle acceptance"]
    fn subtitle_outputs_parse_with_independent_ffprobe() {
        let directory = tempfile::tempdir().unwrap();
        let mut doc = document();
        doc.segments[0].start = 3661.123;
        doc.segments[0].end = 3663.456;
        doc.segments[0].text = "مرحبا <literal> & 日本語".into();
        let mut overlapping = doc.segments[0].clone();
        overlapping.start = 3662.0;
        overlapping.end = 3664.0;
        overlapping.id = "overlap".into();
        doc.segments.push(overlapping);
        for format in ["srt", "vtt"] {
            let path = directory.path().join(format!("transcript.{format}"));
            std::fs::write(&path, render(&doc, format).unwrap()).unwrap();
            let result = std::process::Command::new("ffprobe")
                .args([
                    "-v",
                    "error",
                    "-show_packets",
                    "-show_entries",
                    "packet=pts_time,duration_time",
                    "-of",
                    "json",
                ])
                .arg(path)
                .output()
                .expect("Install ffprobe for subtitle acceptance");
            assert!(
                result.status.success(),
                "{}",
                String::from_utf8_lossy(&result.stderr)
            );
            let output: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
            let packets = output["packets"].as_array().unwrap();
            assert_eq!(packets.len(), 2);
            for (packet, segment) in packets.iter().zip(&doc.segments) {
                let start: f64 = packet["pts_time"].as_str().unwrap().parse().unwrap();
                let duration: f64 = packet["duration_time"].as_str().unwrap().parse().unwrap();
                assert!((start - segment.start).abs() < 0.0001);
                assert!((duration - (segment.end - segment.start)).abs() < 0.0001);
            }
        }
    }
    #[test]
    fn timestamp_carries_and_clamps() {
        assert_eq!(timestamp(59.9999, ','), "00:01:00,000");
        assert_eq!(timestamp(-1.0, '.'), "00:00:00.000");
        assert_eq!(timestamp(3661.123, ','), "01:01:01,123");
    }
}
