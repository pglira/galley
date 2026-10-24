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
}

export const tauri = {
  getInitialDir: () => invoke<string | null>("get_initial_dir"),
  getRecentDirs: () => invoke<string[]>("get_recent_dirs"),
  removeRecentDir: (path: string) => invoke<string[]>("remove_recent_dir", { path }),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  openDir: (path: string) => invoke<Galley>("open_dir", { path }),
  scanDir: () => invoke<Galley>("scan_dir"),
  initRules: () => invoke<void>("init_rules"),
  readRules: () => invoke<string>("read_rules"),
  writeRules: (text: string) => invoke<void>("write_rules", { text }),
  rulesTemplate: () => invoke<string>("rules_template"),
  readFile: (path: string) => invoke<string>("read_file", { path }),
  readAnnotations: (snapshot: string) => invoke<string>("read_annotations", { snapshot }),
  writeAnnotations: (snapshot: string, text: string) =>
    invoke<void>("write_annotations", { snapshot, text }),
  deleteDocument: (doc: string) => invoke<void>("delete_document", { document: doc }),
  deleteSnapshots: (doc: string, names: string[]) => invoke<void>("delete_snapshots", { document: doc, names }),
  search: (query: string) => invoke<SearchResult>("search", { query }),
  hashFiles: (paths: string[]) => invoke<(string | null)[]>("hash_files", { paths }),
  exportPdf: (path: string) => invoke<void>("export_pdf", { path }),
  savePreferences: (prefs: PreferencesPayload) => invoke<void>("save_preferences", { prefs }),
  loadPreferences: () => invoke<PreferencesPayload>("load_preferences"),
};

// The URL of a file in the open galley directory, served by the `galley` URI
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
