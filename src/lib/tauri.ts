import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl as openerOpenUrl } from "@tauri-apps/plugin-opener";

export interface Snapshot {
  name: string;
  path: string;
  report_modified: number;
  annotations_modified: number | null;
}

export interface Report {
  name: string;
  path: string;
  snapshots: Snapshot[];
}

export interface Galley {
  path: string;
  has_rules: boolean;
  reports: Report[];
}

export interface SearchHit {
  report: string;
  snapshot: string;
  file: "report.md" | "annotations.md";
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
  copy_as_markdown: boolean | null;
}

export const tauri = {
  getInitialDir: () => invoke<string | null>("get_initial_dir"),
  getRecentDirs: () => invoke<string[]>("get_recent_dirs"),
  createDir: (path: string) => invoke<void>("create_dir", { path }),
  openDir: (path: string) => invoke<Galley>("open_dir", { path }),
  scanDir: () => invoke<Galley>("scan_dir"),
  initRules: () => invoke<void>("init_rules"),
  readFile: (path: string) => invoke<string>("read_file", { path }),
  readAnnotations: (snapshot: string) => invoke<string>("read_annotations", { snapshot }),
  writeAnnotations: (snapshot: string, text: string) =>
    invoke<void>("write_annotations", { snapshot, text }),
  deleteOldSnapshots: (report: string, keep: string) => invoke<number>("delete_old_snapshots", { report, keep }),
  search: (query: string) => invoke<SearchResult>("search", { query }),
  hashFiles: (paths: string[]) => invoke<(string | null)[]>("hash_files", { paths }),
  exportPdf: (path: string) => invoke<void>("export_pdf", { path }),
  savePreferences: (prefs: PreferencesPayload) => invoke<void>("save_preferences", { prefs }),
  loadPreferences: () => invoke<PreferencesPayload>("load_preferences"),
};

export function onOpenDir(cb: (path: string) => void): Promise<UnlistenFn> {
  return listen<string>("galley://open", (e) => cb(e.payload));
}

// The URL of a file in the open galley directory, served by the `galley` URI scheme.
export function assetUrl(absolutePath: string): string {
  return convertFileSrc(absolutePath, "galley");
}

// Opens a web or mail link in the default application of the system.
export function openUrl(url: string): Promise<void> {
  return openerOpenUrl(url);
}
