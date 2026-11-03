//! A Model Context Protocol server, so AI apps that speak MCP (Claude,
//! Cursor and others) can search and read the library.
//!
//! An app starts it as `silkscribe --mcp` and talks JSON-RPC over stdin and
//! stdout. It runs instead of the app, opens the library read-only, and only
//! answers while "Let AI apps read your library" is on in Settings, checked
//! on every call so turning it off takes effect at once.

use crate::workspace::store::passage_query;
use crate::workspace::types::{Document, Notes};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

/// MCP versions this server speaks, newest first.
const PROTOCOL_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];
/// Transcript text returned for one document, at most; longer ones are cut.
const TRANSCRIPT_LIMIT: usize = 200_000;
/// Shown to the AI app when sharing is off.
const SHARING_OFF: &str = "SilkScribe isn't sharing your library with AI apps. Turn on \"Let AI apps read your library\" in SilkScribe → Settings → Privacy & storage, then try again.";

/// Runs the server until the client closes stdin. Returns the exit code.
pub fn serve() -> i32 {
    crate::portable::init();
    let Some(dir) = data_dir() else {
        eprintln!("silkscribe --mcp: couldn't find SilkScribe's data folder");
        return 1;
    };
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(message) => handle(&dir, &message),
            Err(_) => Some(error(Value::Null, -32700, "Parse error")),
        };
        if let Some(reply) = reply {
            if writeln!(stdout, "{reply}")
                .and_then(|_| stdout.flush())
                .is_err()
            {
                break;
            }
        }
    }
    0
}

/// SilkScribe's data folder, as Tauri resolves it for this app.
fn data_dir() -> Option<PathBuf> {
    if let Some(dir) = crate::portable::data_dir() {
        return Some(dir.clone());
    }
    const IDENTIFIER: &str = "com.silkscribe.app";
    let home = std::env::var_os("HOME").map(PathBuf::from);
    #[cfg(target_os = "macos")]
    let base = home.map(|home| home.join("Library/Application Support"));
    #[cfg(target_os = "windows")]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(target_os = "linux")]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| home.map(|home| home.join(".local/share")));
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let base: Option<PathBuf> = home;
    base.map(|base| base.join(IDENTIFIER))
}

/// Whether the person has turned sharing on. Read from the settings file on
/// each call, so it follows the switch without a restart.
fn sharing_on(dir: &Path) -> bool {
    std::fs::read_to_string(dir.join(crate::settings::SETTINGS_STORE_PATH))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|store| store["settings"]["mcp_enabled"].as_bool())
        .unwrap_or(false)
}

fn error(id: Value, code: i64, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

fn result(id: Value, value: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": value})
}

/// Answers one JSON-RPC message. Notifications get no reply.
pub(crate) fn handle(dir: &Path, message: &Value) -> Option<Value> {
    let id = message.get("id").cloned()?;
    let method = message["method"].as_str().unwrap_or_default();
    let params = &message["params"];
    Some(match method {
        "initialize" => {
            let asked = params["protocolVersion"].as_str().unwrap_or_default();
            let version = PROTOCOL_VERSIONS
                .iter()
                .find(|v| **v == asked)
                .unwrap_or(&PROTOCOL_VERSIONS[0]);
            result(
                id,
                json!({
                    "protocolVersion": version,
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "silkscribe", "version": env!("CARGO_PKG_VERSION")},
                    "instructions": "SilkScribe holds the person's meeting transcripts, the notes written for them, and their dictations, all recorded on this computer. Search first, then read a document by its id. Cite meetings by title and date.",
                }),
            )
        }
        "ping" => result(id, json!({})),
        "tools/list" => result(id, json!({"tools": tools()})),
        "tools/call" => {
            let name = params["name"].as_str().unwrap_or_default();
            let arguments = &params["arguments"];
            let outcome = if sharing_on(dir) {
                call_tool(dir, name, arguments)
            } else {
                Err(SHARING_OFF.to_string())
            };
            result(
                id,
                match outcome {
                    Ok(value) => json!({
                        "content": [{"type": "text", "text": serde_json::to_string_pretty(&value).unwrap_or_default()}],
                        "isError": false,
                    }),
                    Err(message) => json!({
                        "content": [{"type": "text", "text": message}],
                        "isError": true,
                    }),
                },
            )
        }
        _ => error(id, -32601, "Method not found"),
    })
}

fn tools() -> Value {
    json!([
        {
            "name": "search_library",
            "description": "Search meeting transcripts, notes the person typed, and dictations for passages about something. Returns the best-matching passages with the document they come from and when in the recording they were said.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "What to look for, in plain words."},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50, "description": "How many passages to return (default 10)."}
                },
                "required": ["query"]
            },
            "annotations": {"readOnlyHint": true}
        },
        {
            "name": "list_library",
            "description": "List meetings, imported recordings and dictations, newest first, with their ids.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "source": {"type": "string", "enum": ["meeting", "file", "dictation"], "description": "Only this kind of document."},
                    "title": {"type": "string", "description": "Only documents whose title contains this."},
                    "folder": {"type": "string", "description": "Only documents filed in this Library folder."},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100, "description": "How many to return (default 20)."}
                }
            },
            "annotations": {"readOnlyHint": true}
        },
        {
            "name": "get_document",
            "description": "Read one document by id: its title and date, the notes the person typed, the AI notes, and the transcript with timestamps and speakers.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "include_transcript": {"type": "boolean", "description": "Include the full transcript (default true)."}
                },
                "required": ["id"]
            },
            "annotations": {"readOnlyHint": true}
        }
    ])
}

fn open(dir: &Path) -> Result<Connection, String> {
    let path = dir.join("history.db");
    if !path.exists() {
        return Err("SilkScribe's library is empty: nothing has been recorded yet.".into());
    }
    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Couldn't open SilkScribe's library: {e}"))?;
    let _ = conn.busy_timeout(std::time::Duration::from_secs(3));
    crate::workspace::store::register_functions(&conn)
        .map_err(|e| format!("Couldn't open SilkScribe's library: {e}"))?;
    Ok(conn)
}

fn date(created_at: i64) -> String {
    chrono::DateTime::from_timestamp(created_at, 0)
        .map(|t| t.format("%Y-%m-%d %H:%M UTC").to_string())
        .unwrap_or_default()
}

fn clamp_limit(value: &Value, default: i64, max: i64) -> i64 {
    value.as_i64().unwrap_or(default).clamp(1, max)
}

fn call_tool(dir: &Path, name: &str, arguments: &Value) -> Result<Value, String> {
    let conn = open(dir)?;
    match name {
        "search_library" => search(&conn, arguments),
        "list_library" => list(&conn, arguments),
        "get_document" => document(&conn, arguments),
        _ => Err(format!("No tool called {name}.")),
    }
}

fn search(conn: &Connection, arguments: &Value) -> Result<Value, String> {
    let question = arguments["query"].as_str().unwrap_or_default();
    let Some(query) = passage_query(question) else {
        return Ok(json!([]));
    };
    let limit = clamp_limit(&arguments["limit"], 10, 50);
    let mut stmt = conn
        .prepare(
            "SELECT p.document_id, p.title, p.start, p.text, d.created_at, json_extract(d.body,'$.source') FROM (
               SELECT document_id, start, title, text, bm25(workspace_passages, 0.0, 0.0, 0.0, 2.0, 1.0) AS score
               FROM workspace_passages WHERE workspace_passages MATCH ?1 ORDER BY score LIMIT ?2
             ) p JOIN workspace_documents d ON d.id=p.document_id ORDER BY p.score",
        )
        .map_err(|e| format!("Search isn't available yet: {e}"))?;
    let rows = stmt
        .query_map(params![query, limit], |row| {
            let start: Option<f64> = row.get(2)?;
            Ok(json!({
                "document_id": row.get::<_, String>(0)?,
                "title": row.get::<_, String>(1)?,
                "start_seconds": start,
                "text": row.get::<_, String>(3)?,
                "date": date(row.get(4)?),
                "source": row.get::<_, Option<String>>(5)?,
                "from_typed_notes": start.is_none(),
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(Value::Array(rows))
}

fn list(conn: &Connection, arguments: &Value) -> Result<Value, String> {
    let limit = clamp_limit(&arguments["limit"], 20, 100);
    let source = arguments["source"].as_str();
    let title = arguments["title"].as_str();
    let folder = arguments["folder"].as_str();
    let mut stmt = conn
        .prepare(
            "SELECT id, json_extract(body,'$.title'), json_extract(body,'$.source'), created_at,
                    json_extract(body,'$.duration'), json_extract(body,'$.stage'), json_extract(body,'$.folder')
             FROM workspace_documents
             WHERE (?1 IS NULL OR json_extract(body,'$.source')=?1)
               AND (?2 IS NULL OR unicode_contains(coalesce(json_extract(body,'$.title'),''), coalesce(?2,'')))
               AND (?4 IS NULL OR json_extract(body,'$.folder')=?4)
             ORDER BY created_at DESC LIMIT ?3",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![source, title, limit, folder], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, Option<String>>(1)?,
                "source": row.get::<_, Option<String>>(2)?,
                "date": date(row.get(3)?),
                "duration_seconds": row.get::<_, Option<f64>>(4)?,
                "stage": row.get::<_, Option<String>>(5)?,
                "folder": row.get::<_, Option<String>>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(Value::Array(rows))
}

fn timestamp(seconds: f64) -> String {
    let total = seconds.max(0.0) as u64;
    if total >= 3600 {
        format!("{}:{:02}:{:02}", total / 3600, total / 60 % 60, total % 60)
    } else {
        format!("{}:{:02}", total / 60, total % 60)
    }
}

/// The notes as plain lists, by section title.
fn notes_json(notes: &Notes) -> Value {
    let texts = |items: &Vec<crate::workspace::types::NoteItem>| {
        items
            .iter()
            .map(|item| item.text.clone())
            .collect::<Vec<_>>()
    };
    let mut sections = vec![
        json!({"title": "Summary", "items": texts(&notes.summary)}),
        json!({"title": "Decisions", "items": texts(&notes.decisions)}),
        json!({"title": "Action items", "items": notes.actions.iter().map(|a| a.text.clone()).collect::<Vec<_>>()}),
    ];
    for section in &notes.sections {
        sections.push(json!({"title": section.title, "items": texts(&section.items)}));
    }
    sections.retain(|section| {
        section["items"]
            .as_array()
            .is_some_and(|items| !items.is_empty())
    });
    json!({
        "sections": sections,
        "template": notes.template,
    })
}

fn document(conn: &Connection, arguments: &Value) -> Result<Value, String> {
    let id = arguments["id"].as_str().unwrap_or_default();
    let body: Option<String> = conn
        .query_row(
            "SELECT body FROM workspace_documents WHERE id=?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(body) = body else {
        return Err(format!(
            "No document with id {id}. Use list_library or search_library to find one."
        ));
    };
    let doc: Document = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let typed: Option<String> = conn
        .query_row(
            "SELECT body FROM workspace_user_notes WHERE document_id=?1",
            [id],
            |row| row.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .filter(|text: &String| !text.trim().is_empty());
    let mut out = json!({
        "id": doc.id,
        "title": doc.title,
        "source": doc.source,
        "date": date(doc.created_at),
        "duration_seconds": doc.duration,
        "typed_notes": typed,
        "ai_notes": doc.notes.as_ref().map(notes_json),
    });
    if arguments["include_transcript"].as_bool().unwrap_or(true) {
        let speaker = |id: &Option<String>| {
            id.as_ref().and_then(|id| {
                doc.speakers
                    .iter()
                    .find(|s| &s.id == id)
                    .map(|s| s.name.clone())
            })
        };
        let mut transcript = String::new();
        for segment in &doc.segments {
            let line = match speaker(&segment.speaker) {
                Some(name) => format!(
                    "[{}] {}: {}\n",
                    timestamp(segment.start),
                    name,
                    segment.text
                ),
                None => format!("[{}] {}\n", timestamp(segment.start), segment.text),
            };
            if transcript.len() + line.len() > TRANSCRIPT_LIMIT {
                transcript.push_str("[…transcript cut short…]\n");
                break;
            }
            transcript.push_str(&line);
        }
        out["transcript"] = Value::String(transcript);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library(sharing: bool) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let store = crate::workspace::store::Store::new(dir.path()).unwrap();
        let mut doc = crate::workspace::store::tests_support::document();
        doc.segments[0].text = "We agreed the pricing page ships Friday".into();
        store.put(&doc).unwrap();
        store
            .save_user_notes(&doc.id, "- Ask legal about terms")
            .unwrap();
        std::fs::write(
            dir.path().join(crate::settings::SETTINGS_STORE_PATH),
            json!({"settings": {"mcp_enabled": sharing}}).to_string(),
        )
        .unwrap();
        dir
    }

    fn call(dir: &Path, name: &str, arguments: Value) -> Value {
        handle(
            dir,
            &json!({"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":name,"arguments":arguments}}),
        )
        .unwrap()["result"]
            .clone()
    }

    #[test]
    fn it_introduces_itself_and_lists_read_only_tools() {
        let dir = library(true);
        let init = handle(
            dir.path(),
            &json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}),
        )
        .unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2024-11-05");
        assert!(handle(
            dir.path(),
            &json!({"jsonrpc":"2.0","method":"notifications/initialized"})
        )
        .is_none());
        let tools = handle(
            dir.path(),
            &json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
        )
        .unwrap();
        let names: Vec<&str> = tools["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, ["search_library", "list_library", "get_document"]);
        let unknown = handle(
            dir.path(),
            &json!({"jsonrpc":"2.0","id":3,"method":"resources/list"}),
        )
        .unwrap();
        assert_eq!(unknown["error"]["code"], -32601);
    }

    #[test]
    fn it_searches_lists_and_reads_the_library() {
        let dir = library(true);
        let found = call(
            dir.path(),
            "search_library",
            json!({"query": "When does pricing ship?"}),
        );
        assert_eq!(found["isError"], false);
        let hits: Value =
            serde_json::from_str(found["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(hits.as_array().unwrap().len(), 1);
        let id = hits[0]["document_id"].as_str().unwrap().to_string();

        let listed = call(dir.path(), "list_library", json!({"title": "design"}));
        let listed: Value =
            serde_json::from_str(listed["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(listed[0]["id"], id.as_str());

        let read = call(dir.path(), "get_document", json!({"id": id}));
        let read: Value =
            serde_json::from_str(read["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(read["typed_notes"], "- Ask legal about terms");
        assert!(read["transcript"].as_str().unwrap().contains("[0:01] "));
        assert!(read["transcript"]
            .as_str()
            .unwrap()
            .contains("pricing page ships Friday"));

        let missing = call(dir.path(), "get_document", json!({"id": "nope"}));
        assert_eq!(missing["isError"], true);
    }

    #[test]
    fn the_title_filter_folds_case_beyond_ascii() {
        let dir = library(true);
        let store = crate::workspace::store::Store::new(dir.path()).unwrap();
        let mut doc = crate::workspace::store::tests_support::document();
        doc.id = "equipe".into();
        doc.title = "Équipe produit".into();
        store.put(&doc).unwrap();
        let listed = call(dir.path(), "list_library", json!({"title": "équipe"}));
        let listed: Value =
            serde_json::from_str(listed["content"][0]["text"].as_str().unwrap()).unwrap();
        assert_eq!(listed.as_array().unwrap().len(), 1);
        assert_eq!(listed[0]["id"], "equipe");
    }

    #[test]
    fn nothing_is_shared_while_sharing_is_off() {
        let dir = library(false);
        let found = call(dir.path(), "search_library", json!({"query": "pricing"}));
        assert_eq!(found["isError"], true);
        assert!(found["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("Privacy & storage"));
    }
}
