use anyhow::Result;
use chrono::{DateTime, Local, NaiveDate, Utc};
use hound::WavReader;
use log::{debug, error, info};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use rusqlite_migration::{Migrations, M};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use unicode_segmentation::UnicodeSegmentation;

use crate::audio_toolkit::save_wav_file;

/// Database migrations for transcription history.
/// Each migration is applied in order. The library tracks which migrations
/// have been applied using SQLite's user_version pragma.
///
/// Note: For users upgrading from tauri-plugin-sql, migrate_from_tauri_plugin_sql()
/// converts the old _sqlx_migrations table tracking to the user_version pragma,
/// ensuring migrations don't re-run on existing databases.
static MIGRATIONS: &[M] = &[
    M::up(
        "CREATE TABLE IF NOT EXISTS transcription_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            saved BOOLEAN NOT NULL DEFAULT 0,
            title TEXT NOT NULL,
            transcription_text TEXT NOT NULL
        );",
    ),
    M::up("ALTER TABLE transcription_history ADD COLUMN post_processed_text TEXT;"),
    M::up("ALTER TABLE transcription_history ADD COLUMN post_process_prompt TEXT;"),
    M::up(
        "CREATE TABLE IF NOT EXISTS usage_stats (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            total_words INTEGER NOT NULL DEFAULT 0,
            total_audio_seconds REAL NOT NULL DEFAULT 0,
            total_transcriptions INTEGER NOT NULL DEFAULT 0,
            current_streak_days INTEGER NOT NULL DEFAULT 0,
            longest_streak_days INTEGER NOT NULL DEFAULT 0,
            last_active_day_local TEXT
        );",
    ),
    M::up("ALTER TABLE usage_stats ADD COLUMN backfill_completed INTEGER NOT NULL DEFAULT 0;"),
];

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct HistoryEntry {
    pub id: i64,
    pub file_name: String,
    pub timestamp: i64,
    pub saved: bool,
    pub title: String,
    pub transcription_text: String,
    pub post_processed_text: Option<String>,
    pub post_process_prompt: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct UsageSummary {
    pub current_streak_days: i64,
    pub total_words: i64,
    pub average_wpm: i64,
    pub total_transcriptions: i64,
    pub longest_streak_days: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct HomeHistoryCursor {
    pub timestamp: i64,
    pub id: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct HomeDashboardPageData {
    pub summary: UsageSummary,
    pub entries: Vec<HistoryEntry>,
    pub next_cursor: Option<HomeHistoryCursor>,
    pub is_backfilling: bool,
}

#[derive(Clone, Debug, Default)]
struct UsageStatsRecord {
    total_words: i64,
    total_audio_seconds: f64,
    total_transcriptions: i64,
    current_streak_days: i64,
    longest_streak_days: i64,
    last_active_day_local: Option<String>,
    backfill_completed: bool,
}

#[derive(Clone, Debug)]
struct HistoryUsageRecord {
    local_day: NaiveDate,
    words: i64,
    audio_seconds: f64,
}

#[derive(Debug, Default)]
struct BackfillRuntimeState {
    in_progress: bool,
    retry_after: Option<Instant>,
}

pub struct HistoryManager {
    app_handle: AppHandle,
    recordings_dir: PathBuf,
    db_path: PathBuf,
    backfill_state: Arc<Mutex<BackfillRuntimeState>>,
}

impl HistoryManager {
    pub fn new(app_handle: &AppHandle) -> Result<Self> {
        // Create recordings directory in app data dir
        let app_data_dir = app_handle.path().app_data_dir()?;
        let recordings_dir = app_data_dir.join("recordings");
        let db_path = app_data_dir.join("history.db");

        // Ensure recordings directory exists
        if !recordings_dir.exists() {
            fs::create_dir_all(&recordings_dir)?;
            debug!("Created recordings directory: {:?}", recordings_dir);
        }

        let manager = Self {
            app_handle: app_handle.clone(),
            recordings_dir,
            db_path,
            backfill_state: Arc::new(Mutex::new(BackfillRuntimeState::default())),
        };

        // Initialize database and run migrations synchronously
        manager.init_database()?;

        Ok(manager)
    }

    fn init_database(&self) -> Result<()> {
        info!("Initializing database at {:?}", self.db_path);

        let mut conn = Connection::open(&self.db_path)?;

        // Handle migration from tauri-plugin-sql to rusqlite_migration
        // tauri-plugin-sql used _sqlx_migrations table, rusqlite_migration uses user_version pragma
        self.migrate_from_tauri_plugin_sql(&conn)?;

        // Create migrations object and run to latest version
        let migrations = Migrations::new(MIGRATIONS.to_vec());

        // Validate migrations in debug builds
        #[cfg(debug_assertions)]
        migrations.validate().expect("Invalid migrations");

        // Get current version before migration
        let version_before: i32 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        debug!("Database version before migration: {}", version_before);

        // Apply any pending migrations
        migrations.to_latest(&mut conn)?;

        // Get version after migration
        let version_after: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

        if version_after > version_before {
            info!(
                "Database migrated from version {} to {}",
                version_before, version_after
            );
        } else {
            debug!("Database already at latest version {}", version_after);
        }

        Ok(())
    }

    /// Migrate from tauri-plugin-sql's migration tracking to rusqlite_migration's.
    /// tauri-plugin-sql used a _sqlx_migrations table, while rusqlite_migration uses
    /// SQLite's user_version pragma. This function checks if the old system was in use
    /// and sets the user_version accordingly so migrations don't re-run.
    fn migrate_from_tauri_plugin_sql(&self, conn: &Connection) -> Result<()> {
        // Check if the old _sqlx_migrations table exists
        let has_sqlx_migrations: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='_sqlx_migrations'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if !has_sqlx_migrations {
            return Ok(());
        }

        // Check current user_version
        let current_version: i32 =
            conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

        if current_version > 0 {
            // Already migrated to rusqlite_migration system
            return Ok(());
        }

        // Get the highest version from the old migrations table
        let old_version: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if old_version > 0 {
            info!(
                "Migrating from tauri-plugin-sql (version {}) to rusqlite_migration",
                old_version
            );

            // Set user_version to match the old migration state
            conn.pragma_update(None, "user_version", old_version)?;

            // Optionally drop the old migrations table (keeping it doesn't hurt)
            // conn.execute("DROP TABLE IF EXISTS _sqlx_migrations", [])?;

            info!(
                "Migration tracking converted: user_version set to {}",
                old_version
            );
        }

        Ok(())
    }

    fn get_connection(&self) -> Result<Connection> {
        Ok(Connection::open(&self.db_path)?)
    }

    /// Save a transcription to history (both database and WAV file)
    pub async fn save_transcription(
        &self,
        audio_samples: Vec<f32>,
        transcription_text: String,
        post_processed_text: Option<String>,
        post_process_prompt: Option<String>,
    ) -> Result<()> {
        let timestamp = Utc::now().timestamp();
        let file_name = format!("silkscribe-{}.wav", timestamp);
        let title = self.format_timestamp_title(timestamp);

        // Save WAV file
        let file_path = self.recordings_dir.join(&file_name);
        save_wav_file(file_path, &audio_samples).await?;

        // Save to database
        self.save_to_database(
            file_name,
            timestamp,
            title,
            transcription_text,
            post_processed_text,
            post_process_prompt,
            audio_samples.len(),
        )?;

        // Clean up old entries
        if let Err(cleanup_error) = self.cleanup_old_entries() {
            error!(
                "Failed to clean up old history entries after save: {}",
                cleanup_error
            );
        }

        // Emit history updated event
        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    fn save_to_database(
        &self,
        file_name: String,
        timestamp: i64,
        title: String,
        transcription_text: String,
        post_processed_text: Option<String>,
        post_process_prompt: Option<String>,
        audio_sample_count: usize,
    ) -> Result<()> {
        let mut conn = self.get_connection()?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let visible_text = post_processed_text
            .as_deref()
            .unwrap_or(transcription_text.as_str())
            .to_string();

        tx.execute(
            "INSERT INTO transcription_history (file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![file_name, timestamp, false, title, transcription_text, post_processed_text, post_process_prompt],
        )?;

        self.update_usage_stats_after_save(&tx, timestamp, &visible_text, audio_sample_count)?;
        tx.commit()?;

        debug!("Saved transcription to database");
        Ok(())
    }

    fn update_usage_stats_after_save(
        &self,
        conn: &Connection,
        timestamp: i64,
        visible_text: &str,
        audio_sample_count: usize,
    ) -> Result<()> {
        let mut stats = Self::get_usage_stats_with_conn(conn)?;

        stats.total_words += Self::count_words(visible_text);
        stats.total_audio_seconds +=
            Self::audio_duration_seconds_for_sample_count(audio_sample_count);
        stats.total_transcriptions += 1;

        if let Some(local_day) = Self::local_day_from_timestamp(timestamp) {
            Self::apply_transcription_day_to_stats(&mut stats, local_day);
        }

        Self::upsert_usage_stats(conn, &stats)
    }

    fn get_usage_stats(&self) -> Result<UsageStatsRecord> {
        let conn = self.get_connection()?;
        Self::get_usage_stats_with_conn(&conn)
    }

    fn should_backfill_usage_stats(&self, stats: &UsageStatsRecord) -> Result<bool> {
        if stats.backfill_completed {
            return Ok(false);
        }

        let conn = self.get_connection()?;
        let history_entries_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM transcription_history", [], |row| {
                row.get(0)
            })?;

        if history_entries_count == 0 {
            return Ok(false);
        }

        Ok(stats.total_transcriptions == 0 || history_entries_count > stats.total_transcriptions)
    }

    fn get_usage_stats_with_conn(conn: &Connection) -> Result<UsageStatsRecord> {
        let stats = conn
            .query_row(
                "SELECT total_words, total_audio_seconds, total_transcriptions, current_streak_days, longest_streak_days, last_active_day_local, backfill_completed
                 FROM usage_stats
                 WHERE id = 1",
                [],
                |row| {
                    Ok(UsageStatsRecord {
                        total_words: row.get("total_words")?,
                        total_audio_seconds: row.get("total_audio_seconds")?,
                        total_transcriptions: row.get("total_transcriptions")?,
                        current_streak_days: row.get("current_streak_days")?,
                        longest_streak_days: row.get("longest_streak_days")?,
                        last_active_day_local: row.get("last_active_day_local")?,
                        backfill_completed: row.get("backfill_completed")?,
                    })
                },
            )
            .optional()?;

        Ok(stats.unwrap_or_default())
    }

    fn upsert_usage_stats(conn: &Connection, stats: &UsageStatsRecord) -> Result<()> {
        conn.execute(
            "INSERT OR REPLACE INTO usage_stats (
                id,
                total_words,
                total_audio_seconds,
                total_transcriptions,
                current_streak_days,
                longest_streak_days,
                last_active_day_local,
                backfill_completed
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                1,
                stats.total_words,
                stats.total_audio_seconds,
                stats.total_transcriptions,
                stats.current_streak_days,
                stats.longest_streak_days,
                stats.last_active_day_local.as_deref(),
                stats.backfill_completed,
            ],
        )?;

        Ok(())
    }

    fn count_words(text: &str) -> i64 {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return 0;
        }

        let unicode_word_count = UnicodeSegmentation::unicode_words(trimmed).count() as i64;
        let has_whitespace = trimmed.chars().any(char::is_whitespace);
        let has_cjk_like_chars = trimmed.chars().any(Self::is_cjk_like_char);

        // unicode_words under-counts no-whitespace CJK/Kana/Hangul text as one token.
        if !has_whitespace && has_cjk_like_chars {
            let grapheme_count = UnicodeSegmentation::graphemes(trimmed, true)
                .filter(|grapheme| Self::grapheme_has_word_content(grapheme))
                .count() as i64;

            if grapheme_count > 0 {
                return grapheme_count;
            }
        }

        unicode_word_count
    }

    fn grapheme_has_word_content(grapheme: &str) -> bool {
        grapheme
            .chars()
            .any(|character| character.is_alphanumeric() || Self::is_cjk_like_char(character))
    }

    fn is_cjk_like_char(character: char) -> bool {
        matches!(
            character as u32,
            0x3400..=0x4DBF // CJK Extension A
                | 0x4E00..=0x9FFF // CJK Unified Ideographs
                | 0xF900..=0xFAFF // CJK Compatibility Ideographs
                | 0x20000..=0x2A6DF // CJK Extension B
                | 0x2A700..=0x2B73F // CJK Extension C
                | 0x2B740..=0x2B81F // CJK Extension D
                | 0x2B820..=0x2CEAF // CJK Extension E/F
                | 0x2F800..=0x2FA1F // CJK Compatibility Supplement
                | 0x3040..=0x309F // Hiragana
                | 0x30A0..=0x30FF // Katakana
                | 0x31F0..=0x31FF // Katakana Phonetic Extensions
                | 0x1100..=0x11FF // Hangul Jamo
                | 0x3130..=0x318F // Hangul Compatibility Jamo
                | 0xAC00..=0xD7AF // Hangul Syllables
        )
    }

    fn audio_duration_seconds_for_sample_count(audio_sample_count: usize) -> f64 {
        audio_sample_count as f64 / 16_000.0
    }

    fn read_audio_duration_seconds_from_file(
        recordings_dir: &std::path::Path,
        file_name: &str,
    ) -> f64 {
        let file_path = recordings_dir.join(file_name);
        Self::read_wav_duration_seconds(file_path.as_path())
    }

    fn read_wav_duration_seconds(file_path: &std::path::Path) -> f64 {
        if !file_path.exists() {
            return 0.0;
        }

        match WavReader::open(file_path) {
            Ok(reader) => {
                let spec = reader.spec();
                let sample_rate = spec.sample_rate.max(1) as f64;
                let channels = spec.channels.max(1) as f64;
                reader.duration() as f64 / sample_rate / channels
            }
            Err(err) => {
                error!("Failed to read WAV metadata for {:?}: {}", file_path, err);
                0.0
            }
        }
    }

    fn backfill_usage_stats(
        conn: &Connection,
        recordings_dir: &std::path::Path,
    ) -> Result<UsageStatsRecord> {
        let mut stmt = conn.prepare(
            "SELECT file_name, timestamp, transcription_text, post_processed_text
             FROM transcription_history
             ORDER BY timestamp ASC, id ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>("file_name")?,
                row.get::<_, i64>("timestamp")?,
                row.get::<_, String>("transcription_text")?,
                row.get::<_, Option<String>>("post_processed_text")?,
            ))
        })?;

        let mut usage_records = Vec::new();

        for row in rows {
            let (file_name, timestamp, transcription_text, post_processed_text) = row?;
            let Some(local_day) = Self::local_day_from_timestamp(timestamp) else {
                continue;
            };

            usage_records.push(HistoryUsageRecord {
                local_day,
                words: Self::count_words(
                    post_processed_text
                        .as_deref()
                        .unwrap_or(transcription_text.as_str()),
                ),
                audio_seconds: Self::read_audio_duration_seconds_from_file(
                    recordings_dir,
                    &file_name,
                ),
            });
        }

        Ok(Self::compute_usage_stats_from_records(&usage_records))
    }

    fn run_lazy_backfill(db_path: PathBuf, recordings_dir: PathBuf) -> Result<bool> {
        let mut conn = Connection::open(db_path)?;
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let current_stats = Self::get_usage_stats_with_conn(&tx)?;
        if current_stats.backfill_completed {
            tx.commit()?;
            return Ok(false);
        }

        let mut backfilled_stats = Self::backfill_usage_stats(&tx, recordings_dir.as_path())?;
        backfilled_stats.backfill_completed = true;

        Self::upsert_usage_stats(&tx, &backfilled_stats)?;
        tx.commit()?;

        Ok(true)
    }

    fn trigger_lazy_backfill_if_needed(&self) {
        let mut state = self
            .backfill_state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if state.in_progress {
            return;
        }

        if let Some(retry_after) = state.retry_after {
            if Instant::now() < retry_after {
                return;
            }
        }

        state.in_progress = true;
        state.retry_after = None;
        drop(state);

        let db_path = self.db_path.clone();
        let recordings_dir = self.recordings_dir.clone();
        let app_handle = self.app_handle.clone();
        let backfill_state = self.backfill_state.clone();

        info!("Starting lazy usage stats backfill");

        std::thread::spawn(move || {
            let result = Self::run_lazy_backfill(db_path, recordings_dir);

            let mut state = backfill_state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            state.in_progress = false;

            match result {
                Ok(backfill_completed) => {
                    state.retry_after = None;
                    drop(state);

                    if backfill_completed {
                        info!("Usage stats backfill completed");
                        if let Err(error) = app_handle.emit("usage-stats-updated", ()) {
                            error!("Failed to emit usage-stats-updated event: {}", error);
                        }
                    }
                }
                Err(backfill_error) => {
                    error!("Lazy usage stats backfill failed: {}", backfill_error);
                    state.retry_after = Some(Instant::now() + Duration::from_secs(30));
                }
            }
        });
    }

    fn home_page_limit(limit: Option<u32>) -> usize {
        limit.unwrap_or(50).clamp(1, 200) as usize
    }

    fn get_home_entries_page(
        &self,
        limit: usize,
        cursor: Option<&HomeHistoryCursor>,
    ) -> Result<(Vec<HistoryEntry>, Option<HomeHistoryCursor>)> {
        let conn = self.get_connection()?;
        let query_limit = (limit + 1) as i64;
        let mut entries = Vec::new();

        if let Some(cursor) = cursor {
            let mut stmt = conn.prepare(
                "SELECT id, file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt
                 FROM transcription_history
                 WHERE (timestamp < ?1) OR (timestamp = ?1 AND id < ?2)
                 ORDER BY timestamp DESC, id DESC
                 LIMIT ?3",
            )?;

            let rows =
                stmt.query_map(params![cursor.timestamp, cursor.id, query_limit], |row| {
                    Ok(HistoryEntry {
                        id: row.get("id")?,
                        file_name: row.get("file_name")?,
                        timestamp: row.get("timestamp")?,
                        saved: row.get("saved")?,
                        title: row.get("title")?,
                        transcription_text: row.get("transcription_text")?,
                        post_processed_text: row.get("post_processed_text")?,
                        post_process_prompt: row.get("post_process_prompt")?,
                    })
                })?;

            for row in rows {
                entries.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt
                 FROM transcription_history
                 ORDER BY timestamp DESC, id DESC
                 LIMIT ?1",
            )?;

            let rows = stmt.query_map(params![query_limit], |row| {
                Ok(HistoryEntry {
                    id: row.get("id")?,
                    file_name: row.get("file_name")?,
                    timestamp: row.get("timestamp")?,
                    saved: row.get("saved")?,
                    title: row.get("title")?,
                    transcription_text: row.get("transcription_text")?,
                    post_processed_text: row.get("post_processed_text")?,
                    post_process_prompt: row.get("post_process_prompt")?,
                })
            })?;

            for row in rows {
                entries.push(row?);
            }
        }

        let has_more = entries.len() > limit;
        if has_more {
            entries.truncate(limit);
        }

        let next_cursor = if has_more {
            entries.last().map(|entry| HomeHistoryCursor {
                timestamp: entry.timestamp,
                id: entry.id,
            })
        } else {
            None
        };

        Ok((entries, next_cursor))
    }

    fn compute_usage_stats_from_records(records: &[HistoryUsageRecord]) -> UsageStatsRecord {
        let mut stats = UsageStatsRecord::default();

        if records.is_empty() {
            return stats;
        }

        let mut days = Vec::with_capacity(records.len());

        for record in records {
            stats.total_words += record.words;
            stats.total_audio_seconds += record.audio_seconds;
            stats.total_transcriptions += 1;
            days.push(record.local_day);
        }

        days.sort_unstable();
        days.dedup();

        let (current_streak_days, longest_streak_days, last_active_day_local) =
            Self::calculate_streaks_from_days(&days);

        stats.current_streak_days = current_streak_days;
        stats.longest_streak_days = longest_streak_days;
        stats.last_active_day_local = last_active_day_local;

        stats
    }

    fn calculate_streaks_from_days(days: &[NaiveDate]) -> (i64, i64, Option<String>) {
        let Some(first_day) = days.first() else {
            return (0, 0, None);
        };

        let mut current_streak = 1;
        let mut longest_streak = 1;
        let mut previous_day = *first_day;

        for day in days.iter().skip(1) {
            let diff_days = day.signed_duration_since(previous_day).num_days();

            if diff_days == 1 {
                current_streak += 1;
            } else if diff_days != 0 {
                current_streak = 1;
            }

            if current_streak > longest_streak {
                longest_streak = current_streak;
            }

            previous_day = *day;
        }

        (
            current_streak,
            longest_streak,
            Some(previous_day.format("%F").to_string()),
        )
    }

    fn apply_transcription_day_to_stats(stats: &mut UsageStatsRecord, local_day: NaiveDate) {
        let Some(last_active_day_local) = stats.last_active_day_local.as_deref() else {
            stats.current_streak_days = 1;
            stats.longest_streak_days = stats.longest_streak_days.max(1);
            stats.last_active_day_local = Some(local_day.format("%F").to_string());
            return;
        };

        let Some(last_active_day) = Self::parse_local_day(last_active_day_local) else {
            stats.current_streak_days = 1;
            stats.longest_streak_days = stats.longest_streak_days.max(1);
            stats.last_active_day_local = Some(local_day.format("%F").to_string());
            return;
        };

        let diff_days = local_day.signed_duration_since(last_active_day).num_days();

        if diff_days == 0 {
            return;
        }

        if diff_days == 1 {
            stats.current_streak_days += 1;
        } else {
            stats.current_streak_days = 1;
        }

        if stats.current_streak_days > stats.longest_streak_days {
            stats.longest_streak_days = stats.current_streak_days;
        }

        stats.last_active_day_local = Some(local_day.format("%F").to_string());
    }

    fn parse_local_day(value: &str) -> Option<NaiveDate> {
        NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
    }

    fn local_day_from_timestamp(timestamp: i64) -> Option<NaiveDate> {
        let utc_datetime = DateTime::from_timestamp(timestamp, 0)?;
        Some(utc_datetime.with_timezone(&Local).date_naive())
    }

    fn visible_current_streak(stats: &UsageStatsRecord, today: NaiveDate) -> i64 {
        if stats.current_streak_days <= 0 {
            return 0;
        }

        let Some(last_active_day) = stats
            .last_active_day_local
            .as_deref()
            .and_then(Self::parse_local_day)
        else {
            return 0;
        };

        let diff_days = today.signed_duration_since(last_active_day).num_days();
        if diff_days <= 1 {
            stats.current_streak_days
        } else {
            0
        }
    }

    fn build_usage_summary(stats: &UsageStatsRecord) -> UsageSummary {
        let average_wpm = if stats.total_audio_seconds > 0.0 {
            ((stats.total_words as f64) / (stats.total_audio_seconds / 60.0)).round() as i64
        } else {
            0
        };

        UsageSummary {
            current_streak_days: Self::visible_current_streak(stats, Local::now().date_naive()),
            total_words: stats.total_words,
            average_wpm,
            total_transcriptions: stats.total_transcriptions,
            longest_streak_days: stats.longest_streak_days,
        }
    }

    pub fn cleanup_old_entries(&self) -> Result<()> {
        let retention_period = crate::settings::get_recording_retention_period(&self.app_handle);

        match retention_period {
            crate::settings::RecordingRetentionPeriod::Never => {
                // Don't delete anything
                return Ok(());
            }
            crate::settings::RecordingRetentionPeriod::PreserveLimit => {
                // Use the old count-based logic with history_limit
                let limit = crate::settings::get_history_limit(&self.app_handle);
                return self.cleanup_by_count(limit);
            }
            _ => {
                // Use time-based logic
                return self.cleanup_by_time(retention_period);
            }
        }
    }

    fn delete_entries_and_files(&self, entries: &[(i64, String)]) -> Result<usize> {
        if entries.is_empty() {
            return Ok(0);
        }

        let conn = self.get_connection()?;
        let mut deleted_count = 0;

        for (id, file_name) in entries {
            // Delete database entry
            conn.execute(
                "DELETE FROM transcription_history WHERE id = ?1",
                params![id],
            )?;

            // Delete WAV file
            let file_path = self.recordings_dir.join(file_name);
            if file_path.exists() {
                if let Err(e) = fs::remove_file(&file_path) {
                    error!("Failed to delete WAV file {}: {}", file_name, e);
                } else {
                    debug!("Deleted old WAV file: {}", file_name);
                    deleted_count += 1;
                }
            }
        }

        Ok(deleted_count)
    }

    fn cleanup_by_count(&self, limit: usize) -> Result<()> {
        let conn = self.get_connection()?;

        // Get all entries that are not saved, ordered by timestamp desc
        let mut stmt = conn.prepare(
            "SELECT id, file_name FROM transcription_history WHERE saved = 0 ORDER BY timestamp DESC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, i64>("id")?, row.get::<_, String>("file_name")?))
        })?;

        let mut entries: Vec<(i64, String)> = Vec::new();
        for row in rows {
            entries.push(row?);
        }

        if entries.len() > limit {
            let entries_to_delete = &entries[limit..];
            let deleted_count = self.delete_entries_and_files(entries_to_delete)?;

            if deleted_count > 0 {
                debug!("Cleaned up {} old history entries by count", deleted_count);
            }
        }

        Ok(())
    }

    fn cleanup_by_time(
        &self,
        retention_period: crate::settings::RecordingRetentionPeriod,
    ) -> Result<()> {
        let conn = self.get_connection()?;

        // Calculate cutoff timestamp (current time minus retention period)
        let now = Utc::now().timestamp();
        let cutoff_timestamp = match retention_period {
            crate::settings::RecordingRetentionPeriod::Days3 => now - (3 * 24 * 60 * 60), // 3 days in seconds
            crate::settings::RecordingRetentionPeriod::Weeks2 => now - (2 * 7 * 24 * 60 * 60), // 2 weeks in seconds
            crate::settings::RecordingRetentionPeriod::Months3 => now - (3 * 30 * 24 * 60 * 60), // 3 months in seconds (approximate)
            _ => unreachable!("Should not reach here"),
        };

        // Get all unsaved entries older than the cutoff timestamp
        let mut stmt = conn.prepare(
            "SELECT id, file_name FROM transcription_history WHERE saved = 0 AND timestamp < ?1",
        )?;

        let rows = stmt.query_map(params![cutoff_timestamp], |row| {
            Ok((row.get::<_, i64>("id")?, row.get::<_, String>("file_name")?))
        })?;

        let mut entries_to_delete: Vec<(i64, String)> = Vec::new();
        for row in rows {
            entries_to_delete.push(row?);
        }

        let deleted_count = self.delete_entries_and_files(&entries_to_delete)?;

        if deleted_count > 0 {
            debug!(
                "Cleaned up {} old history entries based on retention period",
                deleted_count
            );
        }

        Ok(())
    }

    pub async fn get_history_entries(&self) -> Result<Vec<HistoryEntry>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt FROM transcription_history ORDER BY timestamp DESC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(HistoryEntry {
                id: row.get("id")?,
                file_name: row.get("file_name")?,
                timestamp: row.get("timestamp")?,
                saved: row.get("saved")?,
                title: row.get("title")?,
                transcription_text: row.get("transcription_text")?,
                post_processed_text: row.get("post_processed_text")?,
                post_process_prompt: row.get("post_process_prompt")?,
            })
        })?;

        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }

        Ok(entries)
    }

    pub async fn get_home_dashboard_data(
        &self,
        limit: Option<u32>,
        cursor: Option<HomeHistoryCursor>,
    ) -> Result<HomeDashboardPageData> {
        let page_limit = Self::home_page_limit(limit);
        let (entries, next_cursor) = self.get_home_entries_page(page_limit, cursor.as_ref())?;
        let stats = self.get_usage_stats()?;
        let is_backfilling = self.should_backfill_usage_stats(&stats)?;

        if is_backfilling {
            self.trigger_lazy_backfill_if_needed();
        }

        Ok(HomeDashboardPageData {
            summary: Self::build_usage_summary(&stats),
            entries,
            next_cursor,
            is_backfilling,
        })
    }

    pub fn get_latest_entry(&self) -> Result<Option<HistoryEntry>> {
        let conn = self.get_connection()?;
        Self::get_latest_entry_with_conn(&conn)
    }

    fn get_latest_entry_with_conn(conn: &Connection) -> Result<Option<HistoryEntry>> {
        let mut stmt = conn.prepare(
            "SELECT id, file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt
             FROM transcription_history
             ORDER BY timestamp DESC
             LIMIT 1",
        )?;

        let entry = stmt
            .query_row([], |row| {
                Ok(HistoryEntry {
                    id: row.get("id")?,
                    file_name: row.get("file_name")?,
                    timestamp: row.get("timestamp")?,
                    saved: row.get("saved")?,
                    title: row.get("title")?,
                    transcription_text: row.get("transcription_text")?,
                    post_processed_text: row.get("post_processed_text")?,
                    post_process_prompt: row.get("post_process_prompt")?,
                })
            })
            .optional()?;

        Ok(entry)
    }

    pub async fn toggle_saved_status(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        // Get current saved status
        let current_saved: bool = conn.query_row(
            "SELECT saved FROM transcription_history WHERE id = ?1",
            params![id],
            |row| row.get("saved"),
        )?;

        let new_saved = !current_saved;

        conn.execute(
            "UPDATE transcription_history SET saved = ?1 WHERE id = ?2",
            params![new_saved, id],
        )?;

        debug!("Toggled saved status for entry {}: {}", id, new_saved);

        // Emit history updated event
        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    pub fn get_audio_file_path(&self, file_name: &str) -> PathBuf {
        self.recordings_dir.join(file_name)
    }

    pub async fn get_entry_by_id(&self, id: i64) -> Result<Option<HistoryEntry>> {
        let conn = self.get_connection()?;
        let mut stmt = conn.prepare(
            "SELECT id, file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt
             FROM transcription_history WHERE id = ?1",
        )?;

        let entry = stmt
            .query_row([id], |row| {
                Ok(HistoryEntry {
                    id: row.get("id")?,
                    file_name: row.get("file_name")?,
                    timestamp: row.get("timestamp")?,
                    saved: row.get("saved")?,
                    title: row.get("title")?,
                    transcription_text: row.get("transcription_text")?,
                    post_processed_text: row.get("post_processed_text")?,
                    post_process_prompt: row.get("post_process_prompt")?,
                })
            })
            .optional()?;

        Ok(entry)
    }

    pub async fn delete_entry(&self, id: i64) -> Result<()> {
        let conn = self.get_connection()?;

        // Get the entry to find the file name
        if let Some(entry) = self.get_entry_by_id(id).await? {
            // Delete the audio file first
            let file_path = self.get_audio_file_path(&entry.file_name);
            if file_path.exists() {
                if let Err(e) = fs::remove_file(&file_path) {
                    error!("Failed to delete audio file {}: {}", entry.file_name, e);
                    // Continue with database deletion even if file deletion fails
                }
            }
        }

        // Delete from database
        conn.execute(
            "DELETE FROM transcription_history WHERE id = ?1",
            params![id],
        )?;

        debug!("Deleted history entry with id: {}", id);

        // Emit history updated event
        if let Err(e) = self.app_handle.emit("history-updated", ()) {
            error!("Failed to emit history-updated event: {}", e);
        }

        Ok(())
    }

    fn format_timestamp_title(&self, timestamp: i64) -> String {
        if let Some(utc_datetime) = DateTime::from_timestamp(timestamp, 0) {
            // Convert UTC to local timezone
            let local_datetime = utc_datetime.with_timezone(&Local);
            local_datetime.format("%B %e, %Y - %l:%M%p").to_string()
        } else {
            format!("Recording {}", timestamp)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};
    use std::path::Path;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE transcription_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                saved BOOLEAN NOT NULL DEFAULT 0,
                title TEXT NOT NULL,
                transcription_text TEXT NOT NULL,
                post_processed_text TEXT,
                post_process_prompt TEXT
            );
            CREATE TABLE usage_stats (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                total_words INTEGER NOT NULL DEFAULT 0,
                total_audio_seconds REAL NOT NULL DEFAULT 0,
                total_transcriptions INTEGER NOT NULL DEFAULT 0,
                current_streak_days INTEGER NOT NULL DEFAULT 0,
                longest_streak_days INTEGER NOT NULL DEFAULT 0,
                last_active_day_local TEXT,
                backfill_completed INTEGER NOT NULL DEFAULT 0
            );",
        )
        .expect("create transcription_history table");
        conn
    }

    fn insert_entry(conn: &Connection, timestamp: i64, text: &str, post_processed: Option<&str>) {
        conn.execute(
            "INSERT INTO transcription_history (file_name, timestamp, saved, title, transcription_text, post_processed_text, post_process_prompt)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                format!("silkscribe-{}.wav", timestamp),
                timestamp,
                false,
                format!("Recording {}", timestamp),
                text,
                post_processed,
                Option::<String>::None
            ],
        )
        .expect("insert history entry");
    }

    #[test]
    fn get_latest_entry_returns_none_when_empty() {
        let conn = setup_conn();
        let entry = HistoryManager::get_latest_entry_with_conn(&conn).expect("fetch latest entry");
        assert!(entry.is_none());
    }

    #[test]
    fn get_latest_entry_returns_newest_entry() {
        let conn = setup_conn();
        insert_entry(&conn, 100, "first", None);
        insert_entry(&conn, 200, "second", Some("processed"));

        let entry = HistoryManager::get_latest_entry_with_conn(&conn)
            .expect("fetch latest entry")
            .expect("entry exists");

        assert_eq!(entry.timestamp, 200);
        assert_eq!(entry.transcription_text, "second");
        assert_eq!(entry.post_processed_text.as_deref(), Some("processed"));
    }

    #[test]
    fn apply_transcription_day_sets_first_streak() {
        let mut stats = UsageStatsRecord::default();
        let day = NaiveDate::from_ymd_opt(2026, 3, 2).expect("valid date");

        HistoryManager::apply_transcription_day_to_stats(&mut stats, day);

        assert_eq!(stats.current_streak_days, 1);
        assert_eq!(stats.longest_streak_days, 1);
        assert_eq!(stats.last_active_day_local.as_deref(), Some("2026-03-02"));
    }

    #[test]
    fn apply_transcription_day_ignores_same_day() {
        let mut stats = UsageStatsRecord {
            current_streak_days: 3,
            longest_streak_days: 4,
            last_active_day_local: Some("2026-03-02".to_string()),
            ..UsageStatsRecord::default()
        };
        let day = NaiveDate::from_ymd_opt(2026, 3, 2).expect("valid date");

        HistoryManager::apply_transcription_day_to_stats(&mut stats, day);

        assert_eq!(stats.current_streak_days, 3);
        assert_eq!(stats.longest_streak_days, 4);
    }

    #[test]
    fn apply_transcription_day_increments_consecutive_streak() {
        let mut stats = UsageStatsRecord {
            current_streak_days: 2,
            longest_streak_days: 2,
            last_active_day_local: Some("2026-03-01".to_string()),
            ..UsageStatsRecord::default()
        };
        let day = NaiveDate::from_ymd_opt(2026, 3, 2).expect("valid date");

        HistoryManager::apply_transcription_day_to_stats(&mut stats, day);

        assert_eq!(stats.current_streak_days, 3);
        assert_eq!(stats.longest_streak_days, 3);
        assert_eq!(stats.last_active_day_local.as_deref(), Some("2026-03-02"));
    }

    #[test]
    fn apply_transcription_day_resets_after_gap() {
        let mut stats = UsageStatsRecord {
            current_streak_days: 5,
            longest_streak_days: 5,
            last_active_day_local: Some("2026-02-27".to_string()),
            ..UsageStatsRecord::default()
        };
        let day = NaiveDate::from_ymd_opt(2026, 3, 2).expect("valid date");

        HistoryManager::apply_transcription_day_to_stats(&mut stats, day);

        assert_eq!(stats.current_streak_days, 1);
        assert_eq!(stats.longest_streak_days, 5);
        assert_eq!(stats.last_active_day_local.as_deref(), Some("2026-03-02"));
    }

    #[test]
    fn compute_usage_stats_from_records_backfills_totals_and_streaks() {
        let records = vec![
            HistoryUsageRecord {
                local_day: NaiveDate::from_ymd_opt(2026, 2, 27).expect("valid date"),
                words: 10,
                audio_seconds: 12.0,
            },
            HistoryUsageRecord {
                local_day: NaiveDate::from_ymd_opt(2026, 2, 28).expect("valid date"),
                words: 6,
                audio_seconds: 8.0,
            },
            HistoryUsageRecord {
                local_day: NaiveDate::from_ymd_opt(2026, 3, 2).expect("valid date"),
                words: 4,
                audio_seconds: 5.0,
            },
        ];

        let stats = HistoryManager::compute_usage_stats_from_records(&records);

        assert_eq!(stats.total_words, 20);
        assert_eq!(stats.total_transcriptions, 3);
        assert!((stats.total_audio_seconds - 25.0).abs() < f64::EPSILON);
        assert_eq!(stats.current_streak_days, 1);
        assert_eq!(stats.longest_streak_days, 2);
        assert_eq!(stats.last_active_day_local.as_deref(), Some("2026-03-02"));
    }

    #[test]
    fn visible_current_streak_drops_to_zero_after_stale_gap() {
        let stats = UsageStatsRecord {
            current_streak_days: 4,
            last_active_day_local: Some("2026-02-27".to_string()),
            ..UsageStatsRecord::default()
        };
        let today = NaiveDate::from_ymd_opt(2026, 3, 2).expect("valid date");

        let visible_streak = HistoryManager::visible_current_streak(&stats, today);

        assert_eq!(visible_streak, 0);
    }

    #[test]
    fn count_words_handles_whitespace_languages() {
        assert_eq!(HistoryManager::count_words("one two three"), 3);
    }

    #[test]
    fn count_words_handles_cjk_without_spaces() {
        assert_eq!(HistoryManager::count_words("你好世界"), 4);
    }

    #[test]
    fn count_words_handles_mixed_latin_and_cjk() {
        assert_eq!(HistoryManager::count_words("hello你好"), 7);
    }

    #[test]
    fn count_words_ignores_punctuation_only() {
        assert_eq!(HistoryManager::count_words("...！？"), 0);
    }

    #[test]
    fn read_wav_duration_seconds_returns_zero_for_missing_files() {
        let missing_path = Path::new("/tmp/silkscribe-test-missing.wav");

        assert_eq!(HistoryManager::read_wav_duration_seconds(missing_path), 0.0);
    }
}
