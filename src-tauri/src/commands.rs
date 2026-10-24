use crate::error::{AppError, AppResult};
use crate::galley::{self, Galley, SearchResult};
use crate::settings::{data_dir, Settings};
use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use tauri::State;

/// The open galley directory.
#[derive(Default)]
pub struct OpenDir(pub Mutex<Option<PathBuf>>);

/// The galley directory given on the command line.
pub struct InitialDir(pub Option<String>);

impl OpenDir {
    fn get(&self) -> AppResult<PathBuf> {
        self.0
            .lock()
            .clone()
            .ok_or_else(|| AppError::Invalid("no galley directory is open".into()))
    }
}

/// Returns the directory given on the command line, if any.
#[tauri::command]
pub fn get_initial_dir(initial: State<'_, InitialDir>) -> Option<String> {
    initial.0.clone().filter(|d| Path::new(d).is_dir())
}

/// Returns the recently opened galley directories that still exist.
#[tauri::command]
pub fn get_recent_dirs() -> Vec<String> {
    Settings::load(&data_dir())
        .unwrap_or_default()
        .recent_dirs
        .into_iter()
        .filter(|d| Path::new(d).is_dir())
        .collect()
}

/// Removes a directory from the recent directories. The directory itself
/// stays. Returns the recent directories that remain.
#[tauri::command]
pub fn remove_recent_dir(path: String) -> AppResult<Vec<String>> {
    Settings::update(&data_dir(), |s| s.remove_recent(&path))?;
    Ok(get_recent_dirs())
}

/// Makes a new galley directory with `GALLEY.md`. An existing directory gets
/// `GALLEY.md` if it has none.
#[tauri::command]
pub fn create_dir(path: String) -> AppResult<()> {
    std::fs::create_dir_all(&path)?;
    galley::init_rules(Path::new(&path))
}

/// Opens a galley directory and returns its contents. The `galley` URI
/// scheme serves files from this directory only, so that images resolve.
#[tauri::command]
pub fn open_dir(path: String, open: State<'_, OpenDir>) -> AppResult<Galley> {
    let dir = std::fs::canonicalize(&path)?;
    if !dir.is_dir() {
        return Err(AppError::Invalid(format!("{path} is not a directory")));
    }
    let result = galley::scan(&dir)?;
    *open.0.lock() = Some(dir.clone());
    let _ = Settings::update(&data_dir(), |s| s.push_recent(result.path.clone()));
    Ok(result)
}

#[tauri::command]
pub fn scan_dir(open: State<'_, OpenDir>) -> AppResult<Galley> {
    galley::scan(&open.get()?)
}

#[tauri::command]
pub fn init_rules(open: State<'_, OpenDir>) -> AppResult<()> {
    galley::init_rules(&open.get()?)
}

#[tauri::command]
pub fn read_rules(open: State<'_, OpenDir>) -> AppResult<String> {
    galley::read_rules(&open.get()?)
}

#[tauri::command]
pub fn write_rules(text: String, open: State<'_, OpenDir>) -> AppResult<()> {
    galley::write_rules(&open.get()?, &text)
}

/// The template of `GALLEY.md`.
#[tauri::command]
pub fn rules_template() -> &'static str {
    galley::RULES_TEMPLATE
}

#[tauri::command]
pub fn read_file(path: String, open: State<'_, OpenDir>) -> AppResult<String> {
    galley::read_text(&open.get()?, Path::new(&path))
}

#[tauri::command]
pub fn read_annotations(snapshot: String, open: State<'_, OpenDir>) -> AppResult<String> {
    galley::read_annotations(&open.get()?, Path::new(&snapshot))
}

#[tauri::command]
pub fn write_annotations(snapshot: String, text: String, open: State<'_, OpenDir>) -> AppResult<()> {
    galley::write_annotations(&open.get()?, Path::new(&snapshot), &text)
}

#[tauri::command]
pub fn delete_document(document: String, open: State<'_, OpenDir>) -> AppResult<()> {
    galley::delete_document(&open.get()?, Path::new(&document))
}

#[tauri::command]
pub fn delete_snapshots(document: String, names: Vec<String>, open: State<'_, OpenDir>) -> AppResult<()> {
    galley::delete_snapshots(&open.get()?, Path::new(&document), &names)
}

/// The most hits that one search returns.
const SEARCH_LIMIT: usize = 500;

#[tauri::command]
pub fn search(query: String, open: State<'_, OpenDir>) -> AppResult<SearchResult> {
    galley::search(&open.get()?, &query, SEARCH_LIMIT)
}

#[tauri::command]
pub fn hash_files(paths: Vec<String>, open: State<'_, OpenDir>) -> AppResult<Vec<Option<String>>> {
    Ok(galley::hash_files(&open.get()?, &paths))
}

/// Saves the page as a PDF file at `path`. The frontend prepares the page
/// for print first.
#[tauri::command]
pub async fn export_pdf(path: String, window: tauri::WebviewWindow) -> AppResult<()> {
    crate::pdf::export(window, PathBuf::from(path)).await
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PreferencesPayload {
    pub zoom: Option<f64>,
    pub paper_width: Option<u32>,
    pub sidebar_left_width: Option<u32>,
    pub sidebar_right_width: Option<u32>,
    pub contents_height: Option<u32>,
    pub copy_as_markdown: Option<bool>,
}

#[tauri::command]
pub fn save_preferences(prefs: PreferencesPayload) -> AppResult<()> {
    Settings::update(&data_dir(), |s| {
        s.zoom = prefs.zoom;
        s.paper_width = prefs.paper_width;
        s.sidebar_left_width = prefs.sidebar_left_width;
        s.sidebar_right_width = prefs.sidebar_right_width;
        s.contents_height = prefs.contents_height;
        s.copy_as_markdown = prefs.copy_as_markdown;
    })
}

#[tauri::command]
pub fn load_preferences() -> PreferencesPayload {
    let s = Settings::load(&data_dir()).unwrap_or_default();
    PreferencesPayload {
        zoom: s.zoom,
        paper_width: s.paper_width,
        sidebar_left_width: s.sidebar_left_width,
        sidebar_right_width: s.sidebar_right_width,
        contents_height: s.contents_height,
        copy_as_markdown: s.copy_as_markdown,
    }
}
