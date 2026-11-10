import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl as openerOpenUrl } from "@tauri-apps/plugin-opener";

export interface Snapshot {
  name: string;
  path: string;
  // The file name of the document: "document.md" or "document.pdf".
  document: string;
  document_modified: number;
  annotations_modified: number | null;
}

export interface Document {
  name: string;
  path: string;
  snapshots: Snapshot[];
}

export interface Galley {
  path: string;
  has_rules: boolean;
  documents: Document[];
}

export interface SearchHit {
  document: string;
  snapshot: string;
  file: "document.md" | "annotations.md";
  line: number;
  text: string;
}

export interface SearchResult {
  hits: SearchHit[];
  truncated: boolean;
}

export interface PreferencesPayload {
  zoom: number | null;
  paper_width: number | null;
  sidebar_left_width: number | null;
  sidebar_right_width: number | null;
  contents_height: number | null;
  copy_as_markdown: boolean | null;
  doc_font: string | null;
  pdf: unknown;
  chat_model: string | null;
  chat_height: number | null;
}

// One event of a chat with `claude` (`src-tauri/src/chat.rs`).
export type ChatEvent =
  | { kind: "user"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool_use"; id: string; name: string; summary: string }
  | { kind: "tool_result"; id: string; text: string; is_error: boolean }
  | { kind: "result"; context_tokens: number; error: string | null }
  | { kind: "exit"; error: string | null };

// The page setup of a PDF export. `paper` is a libpaper paper name or
// "system"; the margins are in mm.
export interface PageOptions {
  paper: string;
  landscape: boolean;
  margin_vertical: number;
  margin_horizontal: number;
}

export const tauri = {
  getInitialDir: () => invoke<string | null>("get_initial_dir"),
  getRecentDirs: () => invoke<string[]>("get_recent_dirs"),
  removeRecentDir: (path: string) => invoke<string[]>("remove_recent_dir", { path }),
  getTabNames: () => invoke<Record<string, string>>("get_tab_names"),
  setTabName: (path: string, name: string) => invoke<Record<string, string>>("set_tab_name", { path, name }),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  openDir: (path: string) => invoke<Galley>("open_dir", { path }),
  // The other commands take the `path` of an open galley as `root`.
  closeDir: (root: string) => invoke<void>("close_dir", { root }),
  scanDir: (root: string) => invoke<Galley>("scan_dir", { root }),
  initRules: (root: string) => invoke<void>("init_rules", { root }),
  readRules: (root: string) => invoke<string>("read_rules", { root }),
  writeRules: (root: string, text: string) => invoke<void>("write_rules", { root, text }),
  rulesTemplate: () => invoke<string>("rules_template"),
  readFile: (root: string, path: string) => invoke<string>("read_file", { root, path }),
  readBinary: (root: string, path: string) =>
    invoke<ArrayBuffer>("read_binary", { root, path }).then((b) => new Uint8Array(b)),
  readAnnotations: (root: string, snapshot: string) => invoke<string>("read_annotations", { root, snapshot }),
  writeAnnotations: (root: string, snapshot: string, text: string) =>
    invoke<void>("write_annotations", { root, snapshot, text }),
  deleteDocument: (root: string, doc: string) => invoke<void>("delete_document", { root, document: doc }),
  deleteSnapshots: (root: string, doc: string, names: string[]) =>
    invoke<void>("delete_snapshots", { root, document: doc, names }),
  search: (root: string, query: string) => invoke<SearchResult>("search", { root, query }),
  hashFiles: (root: string, paths: string[]) => invoke<(string | null)[]>("hash_files", { root, paths }),
  // A screenshot (PNG) of a rectangle of the visible area of the window, in CSS pixels.
  captureRegion: (rect: { x: number; y: number; width: number; height: number }) =>
    invoke<ArrayBuffer>("capture_region", { rect }).then((b) => new Uint8Array(b)),
  // The PNG is the raw body of the request; the paths are percent-encoded headers.
  writeRegionImage: (root: string, snapshot: string, name: string, png: Uint8Array) =>
    invoke<string>("write_region_image", png, {
      headers: { root: encodeURIComponent(root), snapshot: encodeURIComponent(snapshot), name: encodeURIComponent(name) },
    }),
  exportPdf: (path: string, page: PageOptions) => invoke<void>("export_pdf", { path, page }),
  savePreferences: (prefs: PreferencesPayload) => invoke<void>("save_preferences", { prefs }),
  loadPreferences: () => invoke<PreferencesPayload>("load_preferences"),
  // The path of the `claude` binary, or null if Galley does not find it.
  chatClaudePath: () => invoke<string | null>("chat_claude_path"),
  // The session ids of the chats of a galley, by document name.
  chatSessions: (root: string) => invoke<Record<string, string>>("chat_sessions", { root }),
  setChatSession: (root: string, doc: string, session: string | null) =>
    invoke<void>("set_chat_session", { root, document: doc, session }),
  chatHistory: (root: string, chat: string) => invoke<ChatEvent[]>("chat_history", { root, chat }),
  // `doc` is the document directory of the chat, or null for a new task.
  // `model` is null for the default model of `claude`.
  chatSend: (root: string, chat: string, doc: string | null, model: string | null, text: string) =>
    invoke<void>("chat_send", { root, chat, document: doc, model, text }),
  chatInterrupt: (chat: string) => invoke<void>("chat_interrupt", { chat }),
  chatClose: (chat: string) => invoke<void>("chat_close", { chat }),
};

// Calls `handler` for each event of all chats. Returns the function that
// stops the calls.
export function onChatEvent(handler: (chat: string, event: ChatEvent) => void): Promise<UnlistenFn> {
  return listen<ChatEvent & { chat: string }>("chat", ({ payload }) => {
    const { chat, ...event } = payload;
    handler(chat, event as ChatEvent);
  });
}

// The URL of a file in an open galley directory, served by the `galley` URI
// scheme. A nonzero `version` adds a query, so that the webview loads the file
// again instead of its cached copy.
export function assetUrl(absolutePath: string, version = 0): string {
  const url = convertFileSrc(absolutePath, "galley");
  return version ? `${url}?v=${version}` : url;
}

// Opens a web or mail link in the default application of the system.
export function openUrl(url: string): Promise<void> {
  return openerOpenUrl(url);
}
