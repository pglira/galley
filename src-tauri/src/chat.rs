//! Chat with the Claude Code CLI. Each chat is one `claude` process in
//! stream-json mode, with the galley root as working directory. The chat id is
//! the session id of `claude`, so that a chat continues its session with
//! `--resume` after a restart of Galley. The `claude-codes` crate builds the
//! command line and parses the messages of the protocol.

use crate::error::{AppError, AppResult};
use claude_codes::{ClaudeCliBuilder, ClaudeInput, ClaudeOutput, ContentBlock, Protocol, ToolResultContent};
use parking_lot::Mutex;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;
use uuid::Uuid;

/// The name of the Tauri event that carries the [`ChatEvent`]s of all chats.
pub const EVENT: &str = "chat";

/// The longest text of a tool result that the chat shows, in characters.
const TOOL_RESULT_LIMIT: usize = 4000;
/// The longest summary of the input of a tool, in characters.
const TOOL_SUMMARY_LIMIT: usize = 200;
/// The number of lines of the error output of `claude` that an exit reports.
const STDERR_LINES: usize = 20;

/// One event of a chat, in the order of the conversation.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ChatEvent {
    /// A message of the user. Only the history has these; the frontend shows
    /// its own messages at once.
    User { text: String },
    /// Text of the assistant, as Markdown.
    Text { text: String },
    /// A call of a tool. `summary` is a short text from its input, for example
    /// the file path or the command.
    ToolUse { id: String, name: String, summary: String },
    /// The result of the tool call `id`.
    ToolResult { id: String, text: String, is_error: bool },
    /// The end of a turn, with its token counts. `error` is set when the turn
    /// failed.
    Result { input_tokens: u64, output_tokens: u64, error: Option<String> },
    /// The process stopped. `error` is set when it stopped unexpectedly.
    Exit { error: Option<String> },
}

/// The payload of the Tauri event: an event of the chat `chat`.
#[derive(Debug, Clone, Serialize)]
struct Payload<'a> {
    chat: &'a str,
    #[serde(flatten)]
    event: &'a ChatEvent,
}

enum Command {
    Send(String),
    Interrupt,
    Kill,
}

struct Process {
    tx: mpsc::UnboundedSender<Command>,
    model: Option<String>,
    /// Identifies the process, so that the end of an old process does not
    /// remove a newer process of the same chat.
    serial: u64,
}

/// The running `claude` processes, by chat id.
#[derive(Default)]
pub struct Chats {
    processes: Mutex<HashMap<String, Process>>,
    serial: Mutex<u64>,
}

/// Returns the path of the `claude` binary: `configured` if it is set, else
/// `claude` on the PATH, else the usual install locations.
pub fn find_claude(configured: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = configured.map(str::trim).filter(|p| !p.is_empty()) {
        let p = PathBuf::from(p);
        return p.is_file().then_some(p);
    }
    if let Ok(p) = which::which("claude") {
        return Some(p);
    }
    let home = dirs::home_dir()?;
    [".local/bin/claude", ".claude/local/claude"]
        .iter()
        .map(|rel| home.join(rel))
        .chain([PathBuf::from("/usr/local/bin/claude"), PathBuf::from("/usr/bin/claude")])
        .find(|p| p.is_file())
}

/// The directory of the configuration of `claude`: `$CLAUDE_CONFIG_DIR`, else
/// `~/.claude`.
fn config_dir() -> Option<PathBuf> {
    match std::env::var_os("CLAUDE_CONFIG_DIR") {
        Some(d) if !d.is_empty() => Some(PathBuf::from(d)),
        _ => dirs::home_dir().map(|h| h.join(".claude")),
    }
}

/// The transcript file of the session `session` that runs in `root`.
fn transcript_file(root: &Path, session: &str) -> Option<PathBuf> {
    Some(
        config_dir()?
            .join("projects")
            .join(claude_codes::transcript::encode_project_dir(root))
            .join(format!("{session}.jsonl")),
    )
}

/// The text that `--append-system-prompt` adds for a chat in Galley.
pub fn system_prompt(document: Option<&str>) -> String {
    let mut s = String::from(
        "You work in a galley directory: the current working directory. \
         The user reviews your documents in Galley, a desktop app. \
         Read `GALLEY.md` in the galley directory and follow its rules for documents and snapshots. \
         Use paths relative to the galley directory.",
    );
    match document {
        Some(doc) => s.push_str(&format!(
            " This chat belongs to the document directory `{doc}/`. Write new snapshots of this document there."
        )),
        None => s.push_str(" This chat starts a new task: make a new document directory for it as `GALLEY.md` describes."),
    }
    s
}

/// Shortens `s` to `limit` characters and adds an ellipsis if it is longer.
fn truncate(s: &str, limit: usize) -> String {
    match s.char_indices().nth(limit) {
        Some((i, _)) => format!("{}…", &s[..i]),
        None => s.to_string(),
    }
}

/// A short text from the input of a tool call: the first of the usual fields,
/// with paths relative to `root`.
fn tool_summary(input: &Value, root: &Path) -> String {
    const KEYS: [&str; 9] = [
        "file_path", "notebook_path", "path", "command", "pattern", "url", "query", "description", "prompt",
    ];
    let Some(text) = KEYS.iter().find_map(|k| input.get(k).and_then(Value::as_str)) else {
        return String::new();
    };
    let prefix = format!("{}/", root.display());
    let text = text.replace(&prefix, "");
    truncate(text.lines().next().unwrap_or(""), TOOL_SUMMARY_LIMIT)
}

/// The text of the content of a tool result.
fn tool_result_text(content: &Option<ToolResultContent>) -> String {
    let text = match content {
        None => String::new(),
        Some(ToolResultContent::Text(s)) => s.clone(),
        Some(ToolResultContent::Structured(items)) => items
            .iter()
            .filter_map(|v| v.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
    };
    truncate(&text, TOOL_RESULT_LIMIT)
}

/// True for user text that `claude` adds itself, for example command output
/// or reminders in tags.
fn is_internal_text(text: &str) -> bool {
    text.trim_start().starts_with('<')
}

/// Converts one message of `claude` into chat events. `with_user` includes the
/// texts of the user. Messages of subagents give no events.
pub fn events(output: &ClaudeOutput, root: &Path, with_user: bool) -> Vec<ChatEvent> {
    let mut out = Vec::new();
    match output {
        ClaudeOutput::Assistant(m) if m.parent_tool_use_id.is_none() => {
            for block in &m.message.content {
                match block {
                    ContentBlock::Text(t) if !t.text.trim().is_empty() => {
                        out.push(ChatEvent::Text { text: t.text.clone() })
                    }
                    ContentBlock::ToolUse(t) => out.push(ChatEvent::ToolUse {
                        id: t.id.clone(),
                        name: t.name.clone(),
                        summary: tool_summary(&t.input, root),
                    }),
                    _ => {}
                }
            }
        }
        ClaudeOutput::User(m) if m.parent_tool_use_id.is_none() => {
            for block in &m.message.content {
                match block {
                    ContentBlock::Text(t) if with_user && !is_internal_text(&t.text) => {
                        out.push(ChatEvent::User { text: t.text.clone() })
                    }
                    ContentBlock::ToolResult(r) => out.push(ChatEvent::ToolResult {
                        id: r.tool_use_id.clone(),
                        text: tool_result_text(&r.content),
                        is_error: r.is_error.unwrap_or(false),
                    }),
                    _ => {}
                }
            }
        }
        ClaudeOutput::Result(r) => {
            let usage = r.usage.as_ref();
            let input_tokens = usage.map_or(0, |u| {
                u64::from(u.input_tokens) + u64::from(u.cache_creation_input_tokens) + u64::from(u.cache_read_input_tokens)
            });
            let error = r.is_error.then(|| {
                if r.errors.is_empty() {
                    r.result.clone().unwrap_or_else(|| "The turn failed.".into())
                } else {
                    r.errors.join("\n")
                }
            });
            out.push(ChatEvent::Result {
                input_tokens,
                output_tokens: usage.map_or(0, |u| u64::from(u.output_tokens)),
                error,
            });
        }
        ClaudeOutput::Error(e) => out.push(ChatEvent::Result {
            input_tokens: 0,
            output_tokens: 0,
            error: Some(format!("{e:?}")),
        }),
        _ => {}
    }
    out
}

/// Converts the lines of a transcript file into chat events. Lines of
/// subagents (`isSidechain`), meta lines (`isMeta`) and unknown lines give no
/// events.
pub fn history_events(transcript: &str, root: &Path) -> Vec<ChatEvent> {
    let mut out = Vec::new();
    for line in transcript.lines() {
        let Ok(Value::Object(mut raw)) = serde_json::from_str::<Value>(line) else { continue };
        let flag = |k: &str| raw.get(k).and_then(Value::as_bool).unwrap_or(false);
        if flag("isSidechain") || flag("isMeta") {
            continue;
        }
        // Transcript lines can have both `sessionId` and `session_id`, which
        // the parser reads as the same field.
        if raw.contains_key("session_id") {
            raw.remove("sessionId");
        }
        if let Ok(output) = serde_json::from_value::<ClaudeOutput>(Value::Object(raw)) {
            out.extend(events(&output, root, true));
        }
    }
    out
}

/// Reads the history of the session `session` in the galley `root`. A session
/// without a transcript has no history.
pub fn history(root: &Path, session: &str) -> AppResult<Vec<ChatEvent>> {
    let session = parse_session(session)?;
    let Some(file) = transcript_file(root, &session.to_string()) else {
        return Ok(Vec::new());
    };
    match std::fs::read_to_string(&file) {
        Ok(text) => Ok(history_events(&text, root)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(e.into()),
    }
}

fn parse_session(session: &str) -> AppResult<Uuid> {
    Uuid::parse_str(session).map_err(|_| AppError::Invalid(format!("{session} is not a session id")))
}

fn emit(app: &AppHandle, chat: &str, event: &ChatEvent) {
    let _ = app.emit(EVENT, Payload { chat, event });
}

impl Chats {
    /// Sends `text` to the chat `chat`. Starts the process if it does not run
    /// or if it runs with another model. A new process continues the session
    /// if its transcript exists.
    #[allow(clippy::too_many_arguments)]
    pub fn send(
        &self,
        app: AppHandle,
        claude: PathBuf,
        root: PathBuf,
        chat: String,
        document: Option<String>,
        model: Option<String>,
        text: String,
    ) -> AppResult<()> {
        let session = parse_session(&chat)?;
        let mut processes = self.processes.lock();
        if let Some(p) = processes.get(&chat) {
            if p.model == model && p.tx.send(Command::Send(text.clone())).is_ok() {
                return Ok(());
            }
            let _ = p.tx.send(Command::Kill);
            processes.remove(&chat);
        }

        let resume = transcript_file(&root, &chat).is_some_and(|f| f.is_file());
        let mut builder = ClaudeCliBuilder::new()
            .command(claude)
            .working_directory(&root)
            .dangerously_skip_permissions(true)
            .append_system_prompt(system_prompt(document.as_deref()));
        builder = if resume { builder.resume(Some(chat.clone())) } else { builder.session_id(session) };
        if let Some(m) = &model {
            builder = builder.model(m.clone());
        }
        let mut command = builder.build_command().map_err(|e| AppError::Invalid(e.to_string()))?;
        // A chat started from inside a Claude Code session is a separate session.
        command.env_remove("CLAUDECODE");
        command.kill_on_drop(true);
        let child = command.spawn()?;

        let (tx, rx) = mpsc::unbounded_channel();
        tx.send(Command::Send(text)).expect("the receiver exists");
        let serial = {
            let mut s = self.serial.lock();
            *s += 1;
            *s
        };
        processes.insert(chat.clone(), Process { tx, model, serial });
        drop(processes);

        let app2 = app.clone();
        tauri::async_runtime::spawn(async move {
            let error = run(&app2, &chat, &root, session, child, rx).await;
            emit(&app2, &chat, &ChatEvent::Exit { error });
            use tauri::Manager;
            let chats = app2.state::<Chats>();
            let mut processes = chats.processes.lock();
            if processes.get(&chat).is_some_and(|p| p.serial == serial) {
                processes.remove(&chat);
            }
        });
        Ok(())
    }

    /// Stops the current turn of the chat. The process keeps the session.
    pub fn interrupt(&self, chat: &str) {
        if let Some(p) = self.processes.lock().get(chat) {
            let _ = p.tx.send(Command::Interrupt);
        }
    }

    /// Stops the process of the chat.
    pub fn close(&self, chat: &str) {
        if let Some(p) = self.processes.lock().remove(chat) {
            let _ = p.tx.send(Command::Kill);
        }
    }
}

/// Runs the process of a chat until it ends: writes the commands to its
/// input and emits the events of its output. Returns an error text if the
/// process ends unexpectedly.
async fn run(
    app: &AppHandle,
    chat: &str,
    root: &Path,
    session: Uuid,
    mut child: tokio::process::Child,
    mut rx: mpsc::UnboundedReceiver<Command>,
) -> Option<String> {
    let (Some(mut stdin), Some(stdout)) = (child.stdin.take(), child.stdout.take()) else {
        return Some("The claude process has no input or output.".into());
    };
    let stderr_task = child.stderr.take().map(|mut stderr| {
        tokio::spawn(async move {
            let mut s = String::new();
            let _ = stderr.read_to_string(&mut s).await;
            s
        })
    });
    let mut lines = BufReader::with_capacity(1 << 20, stdout).lines();
    let mut killed = false;
    let mut busy = false;

    loop {
        tokio::select! {
            line = lines.next_line() => match line {
                Ok(Some(line)) if !line.trim().is_empty() => {
                    if let Ok(output) = ClaudeOutput::parse_json_tolerant(&line) {
                        if matches!(output, ClaudeOutput::Result(_)) {
                            busy = false;
                        }
                        for event in events(&output, root, false) {
                            emit(app, chat, &event);
                        }
                    }
                }
                Ok(Some(_)) => {}
                Ok(None) | Err(_) => break,
            },
            cmd = rx.recv() => match cmd {
                Some(Command::Send(text)) => {
                    let input = ClaudeInput::user_message(text, session);
                    let Ok(line) = Protocol::serialize(&input) else { continue };
                    busy = true;
                    if stdin.write_all(line.as_bytes()).await.is_err() || stdin.flush().await.is_err() {
                        break;
                    }
                }
                Some(Command::Interrupt) => {
                    let id = format!("interrupt-{}", Uuid::new_v4());
                    if let Ok(line) = Protocol::serialize(&ClaudeInput::interrupt(id)) {
                        let _ = stdin.write_all(line.as_bytes()).await;
                        let _ = stdin.flush().await;
                    }
                }
                Some(Command::Kill) | None => {
                    killed = true;
                    let _ = child.kill().await;
                    break;
                }
            },
        }
    }

    drop(stdin);
    let status = child.wait().await.ok();
    let stderr = match stderr_task {
        Some(t) => t.await.unwrap_or_default(),
        None => String::new(),
    };
    if killed {
        return None;
    }
    let failed = !status.is_some_and(|s| s.success());
    if !failed && !busy {
        return None;
    }
    let tail: Vec<&str> = stderr.lines().filter(|l| !l.trim().is_empty()).collect();
    let tail = tail[tail.len().saturating_sub(STDERR_LINES)..].join("\n");
    Some(if tail.is_empty() {
        match status {
            Some(s) => format!("claude stopped ({s})."),
            None => "claude stopped.".into(),
        }
    } else {
        tail
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: &str = "/g/root";

    #[test]
    fn history_converts_user_text_tools_and_results() {
        let transcript = [
            r#"{"type":"mode","mode":"normal","sessionId":"x"}"#,
            r#"{"type":"user","isSidechain":false,"message":{"role":"user","content":"Write a plan."},"sessionId":"916c32be-7000-4510-b9d2-e11a251b8ecf","uuid":"a"}"#,
            r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"meta"},"sessionId":"916c32be-7000-4510-b9d2-e11a251b8ecf","uuid":"b"}"#,
            r#"{"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","model":"m","content":[{"type":"text","text":"Sure."},{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/g/root/GALLEY.md"}}]},"sessionId":"916c32be-7000-4510-b9d2-e11a251b8ecf","session_id":"916c32be-7000-4510-b9d2-e11a251b8ecf","uuid":"c"}"#,
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t1","content":"rules"}]},"sessionId":"916c32be-7000-4510-b9d2-e11a251b8ecf","uuid":"d"}"#,
            r#"{"type":"user","message":{"role":"user","content":"<command-name>/clear</command-name>"},"sessionId":"916c32be-7000-4510-b9d2-e11a251b8ecf","uuid":"e"}"#,
            "not json",
        ]
        .join("\n");
        let events = history_events(&transcript, Path::new(ROOT));
        assert_eq!(
            events,
            vec![
                ChatEvent::User { text: "Write a plan.".into() },
                ChatEvent::Text { text: "Sure.".into() },
                ChatEvent::ToolUse { id: "t1".into(), name: "Read".into(), summary: "GALLEY.md".into() },
                ChatEvent::ToolResult { id: "t1".into(), text: "rules".into(), is_error: false },
            ]
        );
    }

    #[test]
    fn live_events_skip_user_text() {
        let line = r#"{"type":"user","message":{"role":"user","content":"hi"},"session_id":"916c32be-7000-4510-b9d2-e11a251b8ecf"}"#;
        let output = ClaudeOutput::parse_json(line).unwrap();
        assert!(events(&output, Path::new(ROOT), false).is_empty());
    }

    #[test]
    fn tool_summary_uses_first_line_and_relative_paths() {
        let root = Path::new(ROOT);
        assert_eq!(tool_summary(&serde_json::json!({"command": "ls /g/root/a\nmore"}), root), "ls a");
        assert_eq!(tool_summary(&serde_json::json!({"other": 1}), root), "");
    }

    #[test]
    fn truncate_counts_characters() {
        assert_eq!(truncate("äöü", 2), "äö…");
        assert_eq!(truncate("ab", 2), "ab");
    }

    #[test]
    fn system_prompt_names_the_document() {
        assert!(system_prompt(Some("2026-01-01_1200_x")).contains("`2026-01-01_1200_x/`"));
        assert!(system_prompt(None).contains("new task"));
    }

    #[test]
    fn find_claude_rejects_a_missing_configured_path() {
        assert_eq!(find_claude(Some("/nonexistent/claude")), None);
    }
}
