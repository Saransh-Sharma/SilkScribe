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
        // Incomplete copies are safe to discard: originals are never moved.
        // No document is queued until the bounded copy is fully synced.
        for entry in std::fs::read_dir(&media)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(".import-")
                && name.ends_with(".partial")
                && entry.file_type()?.is_file()
            {
                std::fs::remove_file(entry.path())?;
            }
        }
        let store = Self {
            path: root.join("history.db"),
            media,
        };
        store.conn()?.execute_batch("CREATE TABLE IF NOT EXISTS workspace_documents (
            id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, history_id INTEGER UNIQUE, body TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS workspace_created ON workspace_documents(created_at DESC);")?;
        store.conn()?.execute_batch(
            "CREATE TABLE IF NOT EXISTS workspace_import_receipts (
            request_key TEXT PRIMARY KEY, document_id TEXT NOT NULL, body TEXT NOT NULL);",
        )?;
        store.conn()?.execute_batch("CREATE TABLE IF NOT EXISTS workspace_drafts (document_id TEXT PRIMARY KEY, body TEXT NOT NULL);")?;
        store.conn()?.execute_batch("CREATE TABLE IF NOT EXISTS workspace_import_batches (request_id TEXT PRIMARY KEY, body TEXT NOT NULL);")?;
        store.conn()?.execute_batch("CREATE TRIGGER IF NOT EXISTS workspace_draft_cleanup AFTER DELETE ON workspace_documents BEGIN DELETE FROM workspace_drafts WHERE document_id=old.id; END;")?;
        // Stage indexes allow recovery and queue selection across the entire library.
        store.conn()?.execute_batch("CREATE INDEX IF NOT EXISTS workspace_stage ON workspace_documents(json_extract(body,'$.stage')); ")?;
        // Additive, transactional index migration; the original document remains canonical.
        let mut conn = store.conn()?;
        let tx = conn.transaction()?;
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='workspace_search')",
            [],
            |r| r.get(0),
        )?;
        tx.execute_batch("CREATE VIRTUAL TABLE IF NOT EXISTS workspace_search USING fts5(title, transcript, tokenize='trigram');
            CREATE TRIGGER IF NOT EXISTS workspace_search_insert AFTER INSERT ON workspace_documents BEGIN
              INSERT INTO workspace_search(rowid,title,transcript) VALUES(new.rowid,json_extract(new.body,'$.title'),coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(new.body,'$.segments')),'')); END;
            CREATE TRIGGER IF NOT EXISTS workspace_search_delete AFTER DELETE ON workspace_documents BEGIN
              DELETE FROM workspace_search WHERE rowid=old.rowid; END;
            CREATE TRIGGER IF NOT EXISTS workspace_search_update AFTER UPDATE OF body ON workspace_documents
              WHEN json_extract(old.body,'$.title') IS NOT json_extract(new.body,'$.title') OR json_extract(old.body,'$.segments') IS NOT json_extract(new.body,'$.segments') BEGIN
              DELETE FROM workspace_search WHERE rowid=old.rowid;
              INSERT INTO workspace_search(rowid,title,transcript) VALUES(new.rowid,json_extract(new.body,'$.title'),coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(new.body,'$.segments')),'')); END;")?;
        if !exists {
            tx.execute_batch("INSERT INTO workspace_search(rowid,title,transcript) SELECT rowid,json_extract(body,'$.title'),coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(body,'$.segments')),'') FROM workspace_documents;")?;
        }
        tx.commit()?;
        store.recover_import_registrations()?;
        for mut doc in store.processing_documents()? {
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
    fn recover_import_registrations(&self) -> Result<()> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT r.body FROM workspace_import_receipts r LEFT JOIN workspace_documents d ON d.id=r.document_id WHERE d.id IS NULL AND r.body <> 'null'")?;
        let bodies = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for body in bodies {
            let mut doc: Document = serde_json::from_str(&body)?;
            let Some(audio) = doc.audio_path.as_ref().map(PathBuf::from) else {
                continue;
            };
            // Only finalized files in the managed directory qualify. Partial
            // copies remain pending and never become playable Library entries.
            if audio.parent() != Some(self.media.as_path()) || !audio.is_file() {
                continue;
            }
            doc.stage = Stage::Interrupted;
            doc.failed_stage = Some(Stage::Preparing);
            doc.error = Some(
                "Your audio was saved before the import was interrupted. Retry to transcribe it."
                    .into(),
            );
            self.put(&doc)?;
        }
        Ok(())
    }
    pub(super) fn begin_attempt(&self, doc: &mut Document) -> Result<()> {
        doc.attempt_id =
            self.conn()?
                .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))?;
        doc.progress = 0.0;
        self.put(doc)
    }
    pub fn conn(&self) -> Result<Connection> {
        let conn = Connection::open(&self.path)?;
        conn.busy_timeout(Duration::from_secs(5))?;
        conn.create_scalar_function(
            "unicode_contains",
            2,
            rusqlite::functions::FunctionFlags::SQLITE_UTF8
                | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
            |ctx| {
                Ok(ctx
                    .get::<String>(0)?
                    .to_lowercase()
                    .contains(&ctx.get::<String>(1)?.to_lowercase()))
            },
        )?;
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
    /// Persist a stable destination before copying. A retry after a process
    /// crash reuses it, including a crash between media rename and document put.
    pub fn prepare_import(&self, request_key: &str, proposed: &Document) -> Result<Document> {
        let mut conn = self.conn()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        tx.execute("INSERT OR IGNORE INTO workspace_import_receipts(request_key,document_id,body) VALUES(?1,?2,?3)",
            params![request_key, proposed.id, serde_json::to_string(proposed)?])?;
        let body: String = tx.query_row("SELECT coalesce(d.body,r.body) FROM workspace_import_receipts r LEFT JOIN workspace_documents d ON d.id=r.document_id WHERE r.request_key=?1",
            [request_key], |row| row.get(0))?;
        if body == "null" {
            bail!("This import was deleted. Choose the file in a new batch to import it again.");
        }
        let doc = serde_json::from_str(&body)?;
        tx.commit()?;
        Ok(doc)
    }
    pub fn save_batch(&self, batch: &ImportBatch) -> Result<()> {
        if batch.paths.is_empty() {
            return self.discard_batch(&batch.request_id);
        }
        self.conn()?.execute("INSERT INTO workspace_import_batches(request_id,body) VALUES(?1,?2) ON CONFLICT(request_id) DO UPDATE SET body=excluded.body", params![batch.request_id, serde_json::to_string(batch)?])?;
        Ok(())
    }
    pub fn batches(&self) -> Result<Vec<ImportBatch>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT body FROM workspace_import_batches ORDER BY rowid")?;
        let bodies = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        bodies
            .into_iter()
            .map(|body| Ok(serde_json::from_str(&body)?))
            .collect()
    }
    pub fn discard_batch(&self, id: &str) -> Result<()> {
        self.conn()?.execute(
            "DELETE FROM workspace_import_batches WHERE request_id=?1",
            [id],
        )?;
        Ok(())
    }
    pub fn draft(&self, id: &str) -> Result<Option<Document>> {
        use rusqlite::OptionalExtension;
        let body: Option<String> = self
            .conn()?
            .query_row(
                "SELECT body FROM workspace_drafts WHERE document_id=?1",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        body.map(|body| Ok(serde_json::from_str(&body)?))
            .transpose()
    }
    pub fn save_draft(&self, draft: &Document) -> Result<()> {
        let mut conn = self.conn()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM workspace_documents WHERE id=?1)",
            [&draft.id],
            |row| row.get(0),
        )?;
        if !exists {
            bail!("This transcript was deleted.");
        }
        tx.execute("INSERT INTO workspace_drafts(document_id,body) VALUES(?1,?2) ON CONFLICT(document_id) DO UPDATE SET body=excluded.body", params![draft.id, serde_json::to_string(draft)?])?;
        tx.commit()?;
        Ok(())
    }
    pub fn discard_draft(&self, id: &str) -> Result<()> {
        self.conn()?
            .execute("DELETE FROM workspace_drafts WHERE document_id=?1", [id])?;
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
    #[cfg(test)]
    pub fn list(
        &self,
        query: Option<&str>,
        filter: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Document>> {
        self.list_rows("body", query, filter, limit, offset)?
            .into_iter()
            .map(|body| Ok(serde_json::from_str(&body)?))
            .collect()
    }
    pub fn summaries(
        &self,
        query: Option<&str>,
        filter: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<DocumentSummary>> {
        let projection = "json_object('id',id,'attempt_id',coalesce(json_extract(body,'$.attempt_id'),''),'revision',coalesce(json_extract(body,'$.revision'),0),'title',json_extract(body,'$.title'),'source',json_extract(body,'$.source'),
            'created_at',created_at,'duration',json_extract(body,'$.duration'),'stage',json_extract(body,'$.stage'),
            'progress',json_extract(body,'$.progress'),'saved',json(coalesce(json_extract(body,'$.saved')=1,0)),
            'segment_count',json_array_length(body,'$.segments'),'speaker_count',json_array_length(body,'$.speakers'),
            'notes_available',json(CASE WHEN json_type(body,'$.notes')='object' THEN 'true' ELSE 'false' END),
            'stage_errors',json(coalesce(json_extract(body,'$.stage_errors'),'[]')))";
        // SQLite boolean values need JSON booleans for typed deserialization.
        let projection = projection.replace(
            "json(coalesce(json_extract(body,'$.saved')=1,0))",
            "json(CASE WHEN json_extract(body,'$.saved')=1 THEN 'true' ELSE 'false' END)",
        );
        self.list_rows(&projection, query, filter, limit, offset)?
            .into_iter()
            .map(|body| Ok(serde_json::from_str(&body)?))
            .collect()
    }
    fn list_rows(
        &self,
        projection: &str,
        query: Option<&str>,
        filter: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<String>> {
        let query = query.unwrap_or("");
        let (search, value) = if query.is_empty() {
            ("1", String::new())
        } else if query.chars().count() < 3 {
            // Trigram indexes cannot match one/two-character strings. Keep literal,
            // Unicode-aware short searches, scanning only the search projection.
            ("rowid IN (SELECT rowid FROM workspace_search WHERE unicode_contains(title,?1) OR unicode_contains(transcript,?1))",query.into())
        } else {
            (
                "rowid IN (SELECT rowid FROM workspace_search WHERE workspace_search MATCH ?1)",
                format!("\"{}\"", query.replace('"', "\"\"")),
            )
        };
        let sql = format!("SELECT {projection} FROM workspace_documents WHERE {search}
            AND (?2='' OR ?2='all' OR json_extract(body,'$.source')=?2 OR (?2='saved' AND json_extract(body,'$.saved')=1) OR (?2='attention' AND (json_extract(body,'$.stage') IN ('failed','interrupted') OR (json_extract(body,'$.stage')='complete' AND json_array_length(body,'$.stage_errors')>0))) OR (?2='jobs' AND json_extract(body,'$.stage') IN ('queued','preparing','transcribing','diarizing','notes','recording','paused')))
            ORDER BY created_at DESC, id DESC LIMIT ?3 OFFSET ?4");
        let conn = self.conn()?;
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(
            params![value, filter.unwrap_or(""), limit.min(10000), offset],
            |r| r.get::<_, String>(0),
        )?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
    pub fn processing_documents(&self) -> Result<Vec<Document>> {
        let conn = self.conn()?;
        let mut stmt=conn.prepare("SELECT body FROM workspace_documents WHERE json_extract(body,'$.stage') IN ('preparing','transcribing','diarizing','notes','recording','paused')")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.map(|r| Ok(serde_json::from_str(&r?)?)).collect()
    }
    pub fn next_queued(&self) -> Result<Option<Document>> {
        use rusqlite::OptionalExtension;
        let body:Option<String>=self.conn()?.query_row("SELECT body FROM workspace_documents WHERE json_extract(body,'$.stage')='queued' ORDER BY created_at ASC,id ASC LIMIT 1",[],|r|r.get(0)).optional()?;
        body.map(|body| Ok(serde_json::from_str(&body)?))
            .transpose()
    }
    pub fn delete(&self, id: &str) -> Result<()> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM workspace_documents WHERE id=?1", [id])?;
        tx.execute("DELETE FROM workspace_drafts WHERE document_id=?1", [id])?;
        // Keep only a tombstone, never the deleted title/audio metadata. A
        // delayed retry must not resurrect a deliberately deleted recording.
        tx.execute(
            "UPDATE workspace_import_receipts SET body='null' WHERE document_id=?1",
            [id],
        )?;
        tx.commit()?;
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
                notes_candidate: None,
                original_turns: None,
                retry_stage: None,
                options: JobOptions::default(),
                notes_section: None,
                attempt_id: String::new(),
                revision: 0,
                history_id: Some(id),
                diarized: false,
                stage_errors: vec![],
            })?;
        }
        conn.execute("DELETE FROM workspace_documents WHERE history_id IS NOT NULL AND history_id NOT IN (SELECT id FROM transcription_history)", [])?;
        Ok(())
    }
    pub fn resolve_notes(
        &self,
        id: &str,
        accept: bool,
        expected_revision: u32,
        section: Option<&str>,
    ) -> Result<Document> {
        let mut conn = self.conn()?;
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let body: String = tx.query_row(
            "SELECT body FROM workspace_documents WHERE id=?1",
            [id],
            |r| r.get(0),
        )?;
        let mut doc: Document = serde_json::from_str(&body)?;
        if doc.revision != expected_revision {
            bail!("This transcript changed. Reload it before reviewing notes.");
        }
        if doc.stage.active()
            || matches!(doc.stage, Stage::Queued | Stage::Recording | Stage::Paused)
        {
            bail!("Wait for processing to finish before reviewing notes.");
        }
        let candidate = doc
            .notes_candidate
            .take()
            .ok_or_else(|| anyhow::anyhow!("No new notes to review."))?;
        if accept {
            if candidate.transcript_revision != doc.revision {
                bail!("The transcript changed since these notes were generated. Generate new notes before replacing the current version.");
            }
            validate_notes(&candidate, &doc.segments)?;
            let section = match candidate.generated_section {
                Some(scope) => {
                    if section.is_some_and(|requested| requested != scope.as_str()) {
                        bail!("These notes were generated for a different section.");
                    }
                    Some(scope.as_str())
                }
                None => section,
            };
            if let Some(section) = section {
                let mut notes = doc.notes.take().unwrap_or(Notes {
                    transcript_revision: doc.revision,
                    ..Default::default()
                });
                match section {
                    "summary" => notes.summary = candidate.summary,
                    "decisions" => notes.decisions = candidate.decisions,
                    "actions" => notes.actions = candidate.actions,
                    _ => bail!("Unknown notes section"),
                }
                notes.reviewed = false;
                notes.generated_section = None;
                // Unchanged stale sections remain stale; accepting one section
                // is not evidence that every old note has been regenerated.
                doc.notes = Some(notes);
            } else {
                doc.notes = Some(candidate);
            }
        }
        doc.revision += 1;
        if let Some(notes) = &mut doc.notes {
            if notes.transcript_revision == expected_revision {
                notes.transcript_revision = doc.revision;
            }
        }
        tx.execute(
            "UPDATE workspace_documents SET body=?2 WHERE id=?1",
            params![doc.id, serde_json::to_string(&doc)?],
        )?;
        tx.commit()?;
        Ok(doc)
    }
    pub fn edit(&self, mut edit: DocumentEdit) -> Result<Document> {
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
        if let Some(turns) = &edit.turns {
            if turns.len() != doc.turns.len()
                || turns.iter().zip(&doc.turns).any(|(new, old)| {
                    new.start != old.start
                        || new.end != old.end
                        || !speaker_ids.contains(&new.speaker)
                })
            {
                bail!("Speaker corrections must preserve the original audio intervals and reference an existing speaker.");
            }
        }
        if doc.original_turns.is_none() {
            doc.original_turns = Some(doc.turns.clone());
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
        // Capture legacy sources before applying this edit; never claim they are
        // the original generation-time evidence if that revision is already gone.
        let mut previous_notes = doc.notes.clone();
        if let Some(notes) = &mut previous_notes {
            let revision = (notes.transcript_revision == doc.revision).then_some(doc.revision);
            capture_note_evidence(notes, &doc.segments, revision, doc.history_id.is_none());
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
        if let Some(turns) = edit.turns {
            transcript_changed |=
                serde_json::to_string(&doc.turns)? != serde_json::to_string(&turns)?;
            doc.turns = turns;
        }
        if let Some(notes) = &mut edit.notes {
            preserve_note_evidence(
                notes,
                previous_notes.as_ref(),
                &doc.segments,
                doc.revision + u32::from(transcript_changed),
                doc.history_id.is_none(),
            )?;
        }
        doc.title = edit.title.trim().into();
        doc.speakers = edit.speakers;
        doc.speakers.extend(retained);
        doc.saved = edit.saved;
        if let Some(notes) = &edit.notes {
            validate_notes(notes, &doc.segments)?;
        }
        doc.notes = edit.notes;
        if let Some(notes) = &mut doc.notes {
            if transcript_changed || notes.transcript_revision != edit.expected_revision {
                notes.reviewed = false;
            }
        }
        doc.revision += 1;
        if !transcript_changed {
            if let Some(candidate) = &mut doc.notes_candidate {
                if candidate.transcript_revision == edit.expected_revision {
                    candidate.transcript_revision = doc.revision;
                }
            }
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
        tx.execute("DELETE FROM workspace_drafts WHERE document_id=?1 AND json_extract(body,'$.revision')<=?2", params![doc.id, edit.expected_revision])?;
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
fn snapshot(segment: &Segment, revision: Option<u32>, timed: bool) -> NoteEvidence {
    NoteEvidence {
        segment_id: segment.id.clone(),
        text: segment.text.clone(),
        start: timed.then_some(segment.start),
        end: timed.then_some(segment.end),
        transcript_revision: revision,
    }
}
pub fn capture_note_evidence(
    notes: &mut Notes,
    segments: &[Segment],
    revision: Option<u32>,
    timed: bool,
) {
    for (sources, evidence) in notes
        .summary
        .iter_mut()
        .chain(&mut notes.decisions)
        .map(|n| (&n.sources, &mut n.evidence))
        .chain(
            notes
                .actions
                .iter_mut()
                .map(|n| (&n.sources, &mut n.evidence)),
        )
    {
        for id in sources {
            if !evidence.iter().any(|e| &e.segment_id == id) {
                if let Some(segment) = segments.iter().find(|s| &s.id == id) {
                    evidence.push(snapshot(segment, revision, timed));
                }
            }
        }
    }
}
fn preserve_note_evidence(
    notes: &mut Notes,
    previous: Option<&Notes>,
    segments: &[Segment],
    revision: u32,
    timed: bool,
) -> Result<()> {
    let existing: Vec<&NoteEvidence> = previous
        .into_iter()
        .flat_map(|n| {
            n.summary
                .iter()
                .chain(&n.decisions)
                .flat_map(|i| &i.evidence)
                .chain(n.actions.iter().flat_map(|i| &i.evidence))
        })
        .collect();
    for (sources, evidence) in notes
        .summary
        .iter_mut()
        .chain(&mut notes.decisions)
        .map(|n| (&n.sources, &mut n.evidence))
        .chain(
            notes
                .actions
                .iter_mut()
                .map(|n| (&n.sources, &mut n.evidence)),
        )
    {
        for entry in evidence.iter_mut() {
            if !sources.contains(&entry.segment_id) {
                bail!("Saved note evidence must reference a source of this note.");
            }
            if existing.contains(&&*entry) {
                continue;
            }
            let current = segments
                .iter()
                .find(|s| s.id == entry.segment_id)
                .map(|s| snapshot(s, Some(revision), timed));
            if let Some(current) = current
                .filter(|s| s.text == entry.text && s.start == entry.start && s.end == entry.end)
            {
                // New notes may share an autosave with a transcript correction.
                // Stamp the committed revision, never a caller-supplied revision.
                *entry = current;
            } else {
                bail!("Saved note evidence cannot be modified. Create a new note from the transcript instead.");
            }
        }
        for id in sources {
            if !evidence.iter().any(|e| &e.segment_id == id) {
                // Old clients/legacy drafts may omit snapshots; restore saved evidence.
                if let Some(saved) = existing.iter().find(|e| &e.segment_id == id) {
                    evidence.push((*saved).clone());
                } else if let Some(segment) = segments.iter().find(|s| &s.id == id) {
                    evidence.push(snapshot(segment, Some(revision), timed));
                }
            }
        }
    }
    Ok(())
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
    use crate::workspace::export::render_content;
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
    fn processing_attempts_are_distinct_and_durable_without_changing_transcript_revision() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut doc = document();
        let mut legacy = serde_json::to_value(&doc).unwrap();
        legacy.as_object_mut().unwrap().remove("attempt_id");
        let legacy: Document = serde_json::from_value(legacy).unwrap();
        assert!(legacy.attempt_id.is_empty());
        store.put(&legacy).unwrap();
        assert!(store.summaries(None, None, 10, 0).unwrap()[0]
            .attempt_id
            .is_empty());
        doc.stage = Stage::Queued;
        store.begin_attempt(&mut doc).unwrap();
        let first = doc.attempt_id.clone();
        assert!(!first.is_empty());
        doc.progress = 0.9;
        store.begin_attempt(&mut doc).unwrap();
        assert_ne!(doc.attempt_id, first);
        assert_eq!(doc.progress, 0.0);
        assert_eq!(doc.revision, 0);
        let reopened = Store::new(dir.path()).unwrap();
        assert_eq!(reopened.get(&doc.id).unwrap().attempt_id, doc.attempt_id);
        assert_eq!(
            reopened.summaries(None, None, 10, 0).unwrap()[0].attempt_id,
            doc.attempt_id
        );
    }
    #[test]
    fn attention_filter_includes_recoverable_and_optional_failures_only() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        for (id, stage) in [
            ("ready", Stage::Complete),
            ("failed", Stage::Failed),
            ("interrupted", Stage::Interrupted),
            ("cancelled", Stage::Cancelled),
            ("working", Stage::Transcribing),
        ] {
            let mut doc = document();
            doc.id = id.into();
            doc.stage = stage;
            store.put(&doc).unwrap();
        }
        let mut doc = document();
        doc.id = "notes-failed".into();
        doc.stage_errors.push(StageError {
            stage: Stage::Notes,
            message: "Worker failed".into(),
        });
        store.put(&doc).unwrap();
        let mut ids: Vec<_> = store
            .summaries(None, Some("attention"), 100, 0)
            .unwrap()
            .into_iter()
            .map(|d| d.id)
            .collect();
        ids.sort();
        assert_eq!(ids, ["failed", "interrupted", "notes-failed"]);
    }
    #[test]
    fn scoped_candidates_cannot_replace_unrequested_sections() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut doc = document();
        let item = |text: &str| NoteItem {
            text: text.into(),
            sources: vec!["s0".into()],
            evidence: vec![],
        };
        doc.notes = Some(Notes {
            summary: vec![item("Old summary")],
            decisions: vec![item("Keep decision")],
            ..Default::default()
        });
        doc.notes_candidate = Some(Notes {
            generated_section: Some(NotesSection::Summary),
            summary: vec![item("New summary")],
            ..Default::default()
        });
        doc.notes_section = Some(NotesSection::Summary);
        store.put(&doc).unwrap();
        let reopened = Store::new(dir.path()).unwrap();
        assert_eq!(
            reopened.get(&doc.id).unwrap().notes_section,
            Some(NotesSection::Summary)
        );
        assert!(reopened
            .resolve_notes(&doc.id, true, 0, Some("decisions"))
            .unwrap_err()
            .to_string()
            .contains("different section"));
        assert!(reopened.get(&doc.id).unwrap().notes_candidate.is_some());
        // Even a whole-result acceptance request must only apply the generated section.
        let result = reopened.resolve_notes(&doc.id, true, 0, None).unwrap();
        let notes = result.notes.unwrap();
        assert_eq!(notes.summary[0].text, "New summary");
        assert_eq!(notes.decisions[0].text, "Keep decision");
        assert_eq!(notes.generated_section, None);
        assert!(result.notes_candidate.is_none());
    }
    #[test]
    fn replacing_one_notes_section_preserves_other_edits_and_staleness() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        d.revision = 2;
        d.notes = Some(Notes {
            decisions: vec![NoteItem {
                text: "Keep my decision".into(),
                sources: vec!["s0".into()],
                evidence: vec![],
            }],
            transcript_revision: 1,
            ..Default::default()
        });
        d.notes_candidate = Some(Notes {
            summary: vec![NoteItem {
                text: "New summary".into(),
                sources: vec!["s0".into()],
                evidence: vec![],
            }],
            transcript_revision: 2,
            ..Default::default()
        });
        store.put(&d).unwrap();
        let result = store
            .resolve_notes(&d.id, true, 2, Some("summary"))
            .unwrap();
        assert_eq!(
            result.notes.as_ref().unwrap().summary[0].text,
            "New summary"
        );
        assert_eq!(
            result.notes.as_ref().unwrap().decisions[0].text,
            "Keep my decision"
        );
        assert_eq!(result.notes.as_ref().unwrap().transcript_revision, 1);
        assert!(result.notes_candidate.is_none());
    }
    #[test]
    fn batch_manifest_preserves_remaining_sources_across_restart() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut batch = ImportBatch {
            request_id: "batch".into(),
            paths: vec!["/first.wav".into(), "/second.wav".into()],
            options: JobOptions::default(),
            errors: vec![],
        };
        store.save_batch(&batch).unwrap();
        batch.paths.remove(0);
        batch.errors.push("Device disconnected".into());
        store.save_batch(&batch).unwrap();
        drop(store);
        let store = Store::new(dir.path()).unwrap();
        let recovered = store.batches().unwrap();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0].paths, vec!["/second.wav"]);
        assert_eq!(recovered[0].errors, batch.errors);
        batch.paths.clear();
        store.save_batch(&batch).unwrap();
        assert!(store.batches().unwrap().is_empty());
    }
    #[test]
    fn review_state_expires_on_transcript_changes_and_original_export_is_explicit() {
        use super::super::export::{render_content, ExportContent};
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        d.notes = Some(Notes {
            reviewed: true,
            ..Default::default()
        });
        store.put(&d).unwrap();
        let mut segments = d.segments.clone();
        segments[0].text = "Edited transcript".into();
        let updated = store
            .edit(DocumentEdit {
                id: d.id,
                expected_revision: 0,
                title: d.title,
                segments,
                speakers: d.speakers,
                notes: d.notes,
                turns: None,
                saved: false,
            })
            .unwrap();
        assert!(!updated.notes.as_ref().unwrap().reviewed);
        let json: serde_json::Value = serde_json::from_str(
            &render_content(
                &updated,
                "json",
                Some(ExportContent {
                    original_text: true,
                    transcript: true,
                    notes: true,
                    speakers: true,
                }),
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(json["text_version"], "original");
        assert_eq!(
            json["segments"][0]["text"],
            updated.segments[0].original_text
        );
        assert_eq!(updated.segments[0].text, "Edited transcript");
        assert_eq!(json["notes_outdated"], true);
    }
    #[test]
    fn note_evidence_survives_transcript_edits_and_rejects_rewriting() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        d.notes = Some(Notes {
            summary: vec![NoteItem {
                text: "A supported summary".into(),
                sources: vec!["s0".into()],
                evidence: vec![],
            }],
            ..Default::default()
        });
        capture_note_evidence(d.notes.as_mut().unwrap(), &d.segments, Some(0), true);
        let source = d.notes.as_ref().unwrap().summary[0].evidence[0].clone();
        store.put(&d).unwrap();
        let make_edit = |doc: &Document| DocumentEdit {
            id: doc.id.clone(),
            expected_revision: doc.revision,
            title: doc.title.clone(),
            segments: doc.segments.clone(),
            speakers: doc.speakers.clone(),
            notes: doc.notes.clone(),
            turns: None,
            saved: false,
        };
        let mut edit = make_edit(&d);
        edit.segments[0].text = "A correction made after generation".into();
        let changed = store.edit(edit).unwrap();
        assert_eq!(
            changed.notes.as_ref().unwrap().summary[0].evidence[0],
            source
        );
        let json: serde_json::Value =
            serde_json::from_str(&render_content(&changed, "json", None).unwrap()).unwrap();
        assert_eq!(json["evidence"][0]["text"], source.text);
        assert_eq!(json["evidence"][0]["transcript_revision"], 0);
        assert_ne!(json["evidence"][0]["text"], json["segments"][0]["text"]);
        let markdown = render_content(&changed, "md", None).unwrap();
        assert!(markdown.contains(&format!("[^source-1]: [00:00:01.000] {}", source.text)));
        let mut forged = make_edit(&changed);
        forged.notes.as_mut().unwrap().summary[0].evidence[0].text = "Invented support".into();
        assert!(store
            .edit(forged)
            .unwrap_err()
            .to_string()
            .contains("cannot be modified"));
        let mut new_note = make_edit(&changed);
        new_note.notes.as_mut().unwrap().summary.push(NoteItem {
            text: changed.segments[0].text.clone(),
            sources: vec!["s0".into()],
            evidence: vec![snapshot(&changed.segments[0], Some(changed.revision), true)],
        });
        store.edit(new_note).unwrap();
        let current = store.get(&d.id).unwrap();
        let mut combined = make_edit(&current);
        combined.segments[0].text = "Another correction with a new note".into();
        combined.notes.as_mut().unwrap().decisions.push(NoteItem {
            text: combined.segments[0].text.clone(),
            sources: vec!["s0".into()],
            evidence: vec![snapshot(
                &combined.segments[0],
                Some(current.revision),
                true,
            )],
        });
        let combined = store.edit(combined).unwrap();
        assert_eq!(
            combined.notes.as_ref().unwrap().decisions[0].evidence[0].transcript_revision,
            Some(combined.revision)
        );
        let reopened = Store::new(dir.path()).unwrap().get(&d.id).unwrap();
        let notes = reopened.notes.unwrap();
        assert_eq!(notes.summary[0].evidence[0], source);
        assert_eq!(notes.summary[1].evidence[0].text, changed.segments[0].text);
    }
    #[test]
    fn mixed_revision_notes_export_distinct_sources_and_legacy_has_no_provenance_claim() {
        let mut d = document();
        let mut old = Notes {
            summary: vec![NoteItem {
                text: "Old summary".into(),
                sources: vec!["s0".into()],
                evidence: vec![],
            }],
            ..Default::default()
        };
        capture_note_evidence(&mut old, &d.segments, Some(0), true);
        d.segments[0].text = "Corrected source".into();
        let mut fresh = Notes {
            decisions: vec![NoteItem {
                text: "Fresh decision".into(),
                sources: vec!["s0".into()],
                evidence: vec![],
            }],
            ..Default::default()
        };
        capture_note_evidence(&mut fresh, &d.segments, Some(1), true);
        old.decisions = fresh.decisions;
        d.notes = Some(old);
        d.revision = 1;
        let json: serde_json::Value =
            serde_json::from_str(&render_content(&d, "json", None).unwrap()).unwrap();
        assert_eq!(json["evidence"].as_array().unwrap().len(), 2);
        assert_ne!(json["evidence"][0]["text"], json["evidence"][1]["text"]);
        let markdown = render_content(&d, "md", None).unwrap();
        assert!(markdown.contains("Old summary [^source-1]"));
        assert!(markdown.contains("Fresh decision [^source-2]"));
        d.notes.as_mut().unwrap().summary[0].evidence.clear();
        let json: serde_json::Value =
            serde_json::from_str(&render_content(&d, "json", None).unwrap()).unwrap();
        assert!(json["evidence"][0]["transcript_revision"].is_null());
    }
    #[test]
    fn managed_drafts_survive_restart_and_are_deleted_atomically_with_document() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        store.put(&d).unwrap();
        d.segments[0].text = "Unsaved correction".into();
        store.save_draft(&d).unwrap();
        drop(store);
        let store = Store::new(dir.path()).unwrap();
        let draft = store.draft(&d.id).unwrap().unwrap();
        assert_eq!(draft.segments[0].text, "Unsaved correction");
        assert_ne!(
            store.get(&d.id).unwrap().segments[0].text,
            draft.segments[0].text
        );
        store
            .edit(DocumentEdit {
                id: d.id.clone(),
                expected_revision: d.revision,
                title: d.title.clone(),
                segments: d.segments.clone(),
                speakers: d.speakers.clone(),
                notes: d.notes.clone(),
                turns: None,
                saved: d.saved,
            })
            .unwrap();
        assert!(store.draft(&d.id).unwrap().is_none());
        store.save_draft(&d).unwrap();
        store.delete(&d.id).unwrap();
        assert!(store.draft(&d.id).unwrap().is_none());
        assert!(store.save_draft(&d).is_err());
    }
    #[test]
    fn restart_registers_finalized_import_without_the_original_source() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut candidate = document();
        candidate.stage = Stage::Interrupted;
        candidate.segments.clear();
        let audio = store.media.join(format!("{}.wav", candidate.id));
        candidate.audio_path = Some(audio.to_string_lossy().into());
        store.prepare_import("saved-copy", &candidate).unwrap();
        // Simulate exit after atomic copy rename, before document insertion.
        std::fs::write(&audio, b"finalized audio fixture").unwrap();
        let mut partial = candidate.clone();
        partial.id = "unfinished".into();
        partial.audio_path = Some(store.media.join("unfinished.wav").to_string_lossy().into());
        store.prepare_import("partial-copy", &partial).unwrap();
        drop(store);
        let store = Store::new(dir.path()).unwrap();
        let recovered = store.get(&candidate.id).unwrap();
        assert!(matches!(recovered.stage, Stage::Interrupted));
        assert!(matches!(recovered.failed_stage, Some(Stage::Preparing)));
        assert_eq!(recovered.audio_path, candidate.audio_path);
        assert!(store.get(&partial.id).is_err());
        drop(store);
        let store = Store::new(dir.path()).unwrap();
        assert_eq!(store.list(None, None, 100, 0).unwrap().len(), 1);
        store.delete(&candidate.id).unwrap();
        drop(store);
        assert!(Store::new(dir.path()).unwrap().get(&candidate.id).is_err());
    }
    #[test]
    fn import_receipt_survives_restart_and_does_not_resurrect_deleted_content() {
        let dir = tempfile::tempdir().unwrap();
        let mut candidate = document();
        candidate.stage = Stage::Interrupted;
        candidate.segments.clear();
        let store = Store::new(dir.path()).unwrap();
        let first = store.prepare_import("batch/source", &candidate).unwrap();
        assert!(store.get(&first.id).is_err());
        drop(store);
        let store = Store::new(dir.path()).unwrap();
        candidate.id = "a-new-proposal".into();
        let resumed = store.prepare_import("batch/source", &candidate).unwrap();
        assert_eq!(first.id, resumed.id);
        let mut completed = resumed;
        completed.stage = Stage::Complete;
        completed.title = "Edited after import".into();
        store.put(&completed).unwrap();
        let acknowledged = store.prepare_import("batch/source", &candidate).unwrap();
        assert_eq!(acknowledged.title, completed.title);
        assert_eq!(acknowledged.id, first.id);
        store.delete(&completed.id).unwrap();
        assert!(store.prepare_import("batch/source", &candidate).is_err());
        assert_eq!(
            store
                .prepare_import("new-batch/source", &candidate)
                .unwrap()
                .id,
            candidate.id
        );
    }
    #[test]
    fn candidate_notes_preserve_edits_and_require_current_evidence() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        let notes = |text: &str| Notes {
            summary: vec![NoteItem {
                text: text.into(),
                sources: vec!["s0".into()],
                evidence: vec![],
            }],
            ..Default::default()
        };
        d.notes = Some(notes("My edited notes"));
        d.notes_candidate = Some(notes("New generated notes"));
        store.put(&d).unwrap();
        assert!(store.resolve_notes(&d.id, true, 1, None).is_err());
        let kept = store.resolve_notes(&d.id, false, 0, None).unwrap();
        assert_eq!(kept.notes.unwrap().summary[0].text, "My edited notes");
        assert!(kept.notes_candidate.is_none());
        store.put(&d).unwrap();
        let accepted = store.resolve_notes(&d.id, true, 0, None).unwrap();
        assert_eq!(
            accepted.notes.unwrap().summary[0].text,
            "New generated notes"
        );
        store.put(&d).unwrap();
        let mut segments = d.segments.clone();
        segments[0].text = "Changed evidence".into();
        let changed = store
            .edit(DocumentEdit {
                turns: None,
                id: d.id.clone(),
                expected_revision: 0,
                title: d.title,
                segments,
                speakers: d.speakers,
                notes: d.notes,
                saved: false,
            })
            .unwrap();
        assert_eq!(changed.notes_candidate.unwrap().transcript_revision, 0);
        assert!(store.resolve_notes(&d.id, true, 1, None).is_err());
        assert!(store.get(&d.id).unwrap().notes_candidate.is_some());
        assert!(store.resolve_notes(&d.id, false, 1, None).is_ok());
    }
    #[test]
    fn indexed_search_is_literal_multilingual_and_follows_edits_and_deletion() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        d.title = "ÉCOLE — МОСКВА".into();
        d.segments[0].text = "会议讨论产品设计 and 100% \"quoted\"".into();
        store.put(&d).unwrap();
        for query in [
            "école",
            "москва",
            "МО",
            "讨论",
            "产品设计",
            "100%",
            "\"quoted\"",
        ] {
            let rows = store.summaries(Some(query), None, 100, 0).unwrap();
            assert_eq!(rows.len(), 1, "query {query}");
            assert_eq!(rows[0].segment_count, 1);
            let json = serde_json::to_value(&rows[0]).unwrap();
            assert!(json.get("segments").is_none());
            assert!(json.get("audio_path").is_none());
        }
        assert!(store
            .summaries(Some("design OR nonexistent"), None, 100, 0)
            .unwrap()
            .is_empty());
        d.segments[0].text = "Replacement".into();
        store.put(&d).unwrap();
        assert!(store
            .summaries(Some("产品设计"), None, 100, 0)
            .unwrap()
            .is_empty());
        store.delete(&d.id).unwrap();
        assert!(store
            .summaries(Some("école"), None, 100, 0)
            .unwrap()
            .is_empty());
    }
    #[test]
    fn queue_discovers_old_jobs_beyond_library_page_limit() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path()).unwrap();
        let mut d = document();
        d.stage = Stage::Queued;
        d.created_at = 0;
        store.put(&d).unwrap();
        // Add enough newer complete documents to exceed the former discovery cap.
        let body = serde_json::to_string(&document()).unwrap();
        store.conn().unwrap().execute("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<10001) INSERT INTO workspace_documents(id,created_at,body) SELECT 'new-'||x,x,json_set(?1,'$.id','new-'||x,'$.created_at',x) FROM n",[body]).unwrap();
        assert_eq!(store.next_queued().unwrap().unwrap().id, d.id);
    }
    #[test]
    fn public_export_omits_local_paths_and_unreviewed_notes() {
        let mut d = document();
        d.audio_path = Some("/private/recording.wav".into());
        d.notes_candidate = Some(Notes {
            summary: vec![NoteItem {
                text: "Unreviewed secret".into(),
                sources: vec!["s0".into()],
                evidence: vec![],
            }],
            ..Default::default()
        });
        let json = super::super::export::render(&d, "json").unwrap();
        assert!(!json.contains("/private/"));
        assert!(!json.contains("Unreviewed secret"));
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["schema"], "silkscribe.transcript");
        assert_eq!(parsed["version"], 1);
        assert_eq!(parsed["segments"][0]["start"], 1.0);
    }
    #[test]
    fn notes_only_exports_keep_resolvable_evidence_and_real_timing() {
        use super::super::export::{render, render_content, ExportContent};
        let mut d = document();
        d.notes = Some(Notes {
            summary: vec![NoteItem {
                text: "A supported point".into(),
                sources: vec!["s0".into()],
                evidence: vec![],
            }],
            ..Default::default()
        });
        let content = || {
            Some(ExportContent {
                original_text: false,
                transcript: false,
                notes: true,
                speakers: false,
            })
        };
        let json: serde_json::Value =
            serde_json::from_str(&render_content(&d, "json", content()).unwrap()).unwrap();
        assert!(json["segments"].as_array().unwrap().is_empty());
        assert_eq!(
            json["notes"]["summary"][0]["sources"][0],
            json["evidence"][0]["id"]
        );
        assert_eq!(json["evidence"][0]["start"], 1.0);
        assert_eq!(json["evidence"][0]["text"], d.segments[0].text);
        assert!(json["evidence"][0]["speaker"].is_null());
        let md = render_content(&d, "md", content()).unwrap();
        assert!(!md.contains("## Transcript"));
        assert!(md.contains("A supported point [^source-1]"));
        assert!(md.contains("[^source-1]: [00:00:01.000]"));
        d.history_id = Some(1);
        let legacy = render_content(&d, "md", content()).unwrap();
        assert!(!legacy.contains("00:00:01.000"));
        let json: serde_json::Value =
            serde_json::from_str(&render_content(&d, "json", content()).unwrap()).unwrap();
        assert!(json["evidence"][0]["start"].is_null());
        assert!(render(&d, "srt").is_err());
        assert!(render(&d, "vtt").is_err());
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
            turns: None,
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
                turns: None,
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
                evidence: vec![],
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
