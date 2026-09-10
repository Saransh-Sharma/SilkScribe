use super::types::*;
use anyhow::{bail, Result};
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub struct Store {
    path: PathBuf,
    pub media: PathBuf,
}
impl Store {
    pub fn new(root: &Path) -> Result<Self> {
        let media = root.join("workspace-audio");
        std::fs::create_dir_all(&media)?;
        let store = Self {
            path: root.join("history.db"),
            media,
        };
        store.conn()?.execute_batch("CREATE TABLE IF NOT EXISTS workspace_documents (
            id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, history_id INTEGER UNIQUE, body TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS workspace_created ON workspace_documents(created_at DESC);")?;
        for mut doc in store.list(None, None, 10000, 0)? {
            if doc.stage.active() || matches!(doc.stage, Stage::Recording | Stage::Paused) {
                doc.failed_stage = Some(doc.stage.clone());
                doc.stage = Stage::Interrupted;
                doc.error =
                    Some("Processing was interrupted. Retry to continue from saved audio.".into());
                store.put(&doc)?;
            }
        }
        Ok(store)
    }
    pub fn conn(&self) -> Result<Connection> {
        let conn = Connection::open(&self.path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        Ok(conn)
    }
    pub fn put(&self, doc: &Document) -> Result<()> {
        self.conn()?.execute(
            "INSERT INTO workspace_documents(id,created_at,history_id,body) VALUES(?1,?2,?3,?4)
            ON CONFLICT(id) DO UPDATE SET body=excluded.body",
            params![
                doc.id,
                doc.created_at,
                doc.history_id,
                serde_json::to_string(doc)?
            ],
        )?;
        Ok(())
    }
    pub fn get(&self, id: &str) -> Result<Document> {
        let body: String = self.conn()?.query_row(
            "SELECT body FROM workspace_documents WHERE id=?1",
            [id],
            |r| r.get(0),
        )?;
        Ok(serde_json::from_str(&body)?)
    }
    pub fn list(
        &self,
        query: Option<&str>,
        filter: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Document>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT body FROM workspace_documents WHERE
            (?1='' OR instr(lower(json_extract(body,'$.title')),lower(?1))>0 OR EXISTS
              (SELECT 1 FROM json_each(json_extract(body,'$.segments')) WHERE instr(lower(json_extract(value,'$.text')),lower(?1))>0))
            AND (?2='' OR ?2='all' OR json_extract(body,'$.source')=?2 OR (?2='saved' AND json_extract(body,'$.saved')=1) OR (?2='jobs' AND json_extract(body,'$.stage') IN ('queued','preparing','transcribing','diarizing','notes','recording','paused')))
            ORDER BY created_at DESC, id DESC LIMIT ?3 OFFSET ?4")?;
        let rows = stmt.query_map(
            params![
                query.unwrap_or(""),
                filter.unwrap_or(""),
                limit.min(10000),
                offset
            ],
            |r| r.get::<_, String>(0),
        )?;
        rows.map(|r| Ok(serde_json::from_str(&r?)?)).collect()
    }
    pub fn delete(&self, id: &str) -> Result<()> {
        self.conn()?
            .execute("DELETE FROM workspace_documents WHERE id=?1", [id])?;
        Ok(())
    }
    pub fn sync_history(&self, root: &Path) -> Result<()> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id,title,timestamp,file_name,transcription_text,post_processed_text,saved FROM transcription_history h
            WHERE NOT EXISTS(SELECT 1 FROM workspace_documents w WHERE w.history_id=h.id)")?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, bool>(6)?,
            ))
        })?;
        let rows = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        drop(stmt);
        for row in rows {
            let (id, title, created_at, file, text, processed, saved) = row;
            let path = root.join("recordings").join(file);
            let duration = hound::WavReader::open(&path)
                .map(|r| r.duration() as f64 / r.spec().sample_rate as f64)
                .unwrap_or(0.0);
            let display = processed.unwrap_or_else(|| text.clone());
            self.put(&Document {
                id: format!("dictation-{id}"),
                title,
                source: Source::Dictation,
                created_at,
                duration,
                stage: Stage::Complete,
                progress: 1.0,
                error: None,
                failed_stage: None,
                saved,
                audio_path: path.exists().then(|| path.to_string_lossy().into()),
                segments: vec![Segment {
                    id: "legacy".into(),
                    start: 0.0,
                    end: duration,
                    text: display,
                    original_text: text,
                    speaker: None,
                }],
                speakers: vec![],
                turns: vec![],
                notes: None,
                options: JobOptions::default(),
                revision: 0,
                history_id: Some(id),
                diarized: false,
            })?;
        }
        conn.execute("DELETE FROM workspace_documents WHERE history_id IS NOT NULL AND history_id NOT IN (SELECT id FROM transcription_history)", [])?;
        Ok(())
    }
    pub fn edit(&self, edit: DocumentEdit) -> Result<Document> {
        let mut conn = self.conn()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let body: String = tx.query_row(
            "SELECT body FROM workspace_documents WHERE id=?1",
            [&edit.id],
            |r| r.get(0),
        )?;
        let mut doc: Document = serde_json::from_str(&body)?;
        if doc.revision != edit.expected_revision {
            bail!("This transcript changed. Reload it before saving.");
        }
        if doc.stage.active()
            || matches!(doc.stage, Stage::Queued | Stage::Recording | Stage::Paused)
        {
            bail!("Wait for processing to finish before editing.");
        }
        if edit.title.trim().is_empty() {
            bail!("A title is required.");
        }
        if edit.segments.len() != doc.segments.len() {
            bail!("Transcript segments cannot be removed.");
        }
        let mut speaker_ids = std::collections::HashSet::new();
        for speaker in &edit.speakers {
            if speaker.id.is_empty() || !speaker_ids.insert(&speaker.id) {
                bail!("Speaker identifiers must be unique and nonempty.");
            }
        }
        // A merge updates overlap annotations as well as exclusive display turns.
        // Keep otherwise-unmapped overlap speakers so exported turns never dangle.
        let mut retained = Vec::new();
        for speaker in &doc.speakers {
            if speaker_ids.contains(&speaker.id) {
                continue;
            }
            let replacements: std::collections::HashSet<_> = doc
                .segments
                .iter()
                .zip(&edit.segments)
                .filter(|(old, _)| old.speaker.as_deref() == Some(&speaker.id))
                .filter_map(|(_, new)| new.speaker.clone())
                .collect();
            if replacements.len() == 1 {
                let replacement = replacements.iter().next().unwrap();
                for turn in &mut doc.turns {
                    if turn.speaker == speaker.id {
                        turn.speaker = replacement.clone();
                    }
                }
            } else if doc.turns.iter().any(|turn| turn.speaker == speaker.id) {
                retained.push(speaker.clone());
            }
        }
        let mut transcript_changed = false;
        for (old, new) in doc.segments.iter_mut().zip(&edit.segments) {
            if old.id != new.id {
                bail!("Segment order cannot change.");
            }
            if let Some(speaker) = &new.speaker {
                if !edit.speakers.iter().any(|s| &s.id == speaker) {
                    bail!("Unknown speaker.");
                }
            }
            transcript_changed |= old.text != new.text || old.speaker != new.speaker;
            old.text = new.text.clone();
            old.speaker = new.speaker.clone();
        }
        transcript_changed |=
            serde_json::to_string(&doc.speakers)? != serde_json::to_string(&edit.speakers)?;
        doc.title = edit.title.trim().into();
        doc.speakers = edit.speakers;
        doc.speakers.extend(retained);
        doc.saved = edit.saved;
        if let Some(notes) = &edit.notes {
            validate_notes(notes, &doc.segments)?;
        }
        doc.notes = edit.notes;
        doc.revision += 1;
        if !transcript_changed {
            if let Some(notes) = &mut doc.notes {
                if notes.transcript_revision == edit.expected_revision {
                    notes.transcript_revision = doc.revision;
                }
            }
        }
        tx.execute(
            "UPDATE workspace_documents SET body=?2 WHERE id=?1",
            params![doc.id, serde_json::to_string(&doc)?],
        )?;
        if let Some(id) = doc.history_id {
            tx.execute(
                "UPDATE transcription_history SET saved=?2 WHERE id=?1",
                params![id, doc.saved],
            )?;
        }
        tx.commit()?;
        Ok(doc)
    }
}
pub fn validate_notes(notes: &Notes, segments: &[Segment]) -> Result<()> {
    for sources in notes
        .summary
        .iter()
        .chain(&notes.decisions)
        .map(|n| &n.sources)
        .chain(notes.actions.iter().map(|n| &n.sources))
    {
        if sources.is_empty()
            || sources
                .iter()
                .any(|id| !segments.iter().any(|s| &s.id == id))
        {
            bail!("Notes contain missing or invalid transcript references.");
        }
    }
    Ok(())
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
            options: JobOptions::default(),
            revision: 0,
            history_id: None,
            diarized: false,
        }
    }
    #[test]
    fn edits_preserve_original_and_reject_stale_revisions() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let d = document();
        store.put(&d).unwrap();
        let mut segments = d.segments.clone();
        segments[0].text = "Ship Monday".into();
        segments[0].start = 999.0;
        let edit = DocumentEdit {
            id: d.id.clone(),
            expected_revision: 0,
            title: d.title,
            segments,
            speakers: vec![],
            notes: None,
            saved: true,
        };
        let updated = store.edit(edit.clone()).unwrap();
        assert_eq!(updated.segments[0].original_text, "Ship Friday");
        assert_eq!(updated.segments[0].start, 1.0);
        assert_eq!(updated.revision, 1);
        assert!(store.edit(edit).is_err());
        assert_eq!(
            store
                .list(Some("Monday"), Some("saved"), 100, 0)
                .unwrap()
                .len(),
            1
        );
        assert!(store.list(Some("Friday"), None, 100, 0).unwrap().is_empty());
    }
    #[test]
    fn merging_speakers_updates_overlapping_turns() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        d.speakers = vec![
            Speaker {
                id: "a".into(),
                name: "A".into(),
            },
            Speaker {
                id: "b".into(),
                name: "B".into(),
            },
        ];
        d.segments[0].speaker = Some("a".into());
        d.turns.push(SpeakerTurn {
            start: 1.0,
            end: 2.0,
            speaker: "a".into(),
        });
        store.put(&d).unwrap();
        d.segments[0].speaker = Some("b".into());
        let updated = store
            .edit(DocumentEdit {
                id: d.id,
                expected_revision: 0,
                title: d.title,
                segments: d.segments,
                speakers: vec![d.speakers[1].clone()],
                notes: None,
                saved: false,
            })
            .unwrap();
        assert_eq!(updated.turns[0].speaker, "b");
        assert_eq!(updated.speakers.len(), 1);
    }
    #[test]
    fn interrupted_jobs_are_recoverable_and_notes_need_evidence() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        d.stage = Stage::Diarizing;
        store.put(&d).unwrap();
        drop(store);
        let store = Store::new(dir.path()).unwrap();
        let d = store.get("meeting-1").unwrap();
        assert_eq!(d.stage, Stage::Interrupted);
        assert_eq!(d.segments.len(), 1);
        assert_eq!(d.failed_stage, Some(Stage::Diarizing));
        let notes = Notes {
            summary: vec![NoteItem {
                text: "Invented".into(),
                sources: vec!["missing".into()],
            }],
            ..Default::default()
        };
        assert!(validate_notes(&notes, &d.segments).is_err());
    }
    #[test]
    fn legacy_history_import_is_idempotent_and_survives_retention() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        store.conn().unwrap().execute_batch("CREATE TABLE transcription_history(id INTEGER PRIMARY KEY,title TEXT,timestamp INTEGER,file_name TEXT,transcription_text TEXT,post_processed_text TEXT,saved BOOLEAN);INSERT INTO transcription_history VALUES(1,'Dictation',10,'missing.wav','Original','Cleaned',1);").unwrap();
        store.sync_history(dir.path()).unwrap();
        store.sync_history(dir.path()).unwrap();
        let docs = store.list(None, None, 100, 0).unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].segments[0].original_text, "Original");
        assert!(docs[0].saved);
        store.put(&document()).unwrap();
        store
            .conn()
            .unwrap()
            .execute("DELETE FROM transcription_history", [])
            .unwrap();
        store.sync_history(dir.path()).unwrap();
        assert_eq!(store.list(None, None, 100, 0).unwrap().len(), 1);
    }
}
