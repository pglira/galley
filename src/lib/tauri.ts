import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { openUrl as openerOpenUrl } from "@tauri-apps/plugin-opener";

export interface Snapshot {
  name: string;
  path: string;
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
}

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
  readAnnotations: (root: string, snapshot: string) => invoke<string>("read_annotations", { root, snapshot }),
  writeAnnotations: (root: string, snapshot: string, text: string) =>
    invoke<void>("write_annotations", { root, snapshot, text }),
  deleteDocument: (root: string, doc: string) => invoke<void>("delete_document", { root, document: doc }),
  deleteSnapshots: (root: string, doc: string, names: string[]) =>
    invoke<void>("delete_snapshots", { root, document: doc, names }),
  search: (root: string, query: string) => invoke<SearchResult>("search", { root, query }),
  hashFiles: (root: string, paths: string[]) => invoke<(string | null)[]>("hash_files", { root, paths }),
  exportPdf: (path: string, page: PageOptions) => invoke<void>("export_pdf", { path, page }),
  savePreferences: (prefs: PreferencesPayload) => invoke<void>("save_preferences", { prefs }),
  loadPreferences: () => invoke<PreferencesPayload>("load_preferences"),
};

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
