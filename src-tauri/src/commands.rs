use crate::error::{AppError, AppResult};
use crate::galley::{self, Galley, SearchResult};
use crate::settings::{data_dir, Settings};
use parking_lot::Mutex;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::State;

/// The open galley directories, as canonical paths. Each tab of the window
/// shows one of them.
#[derive(Default)]
pub struct OpenDirs(pub Mutex<Vec<PathBuf>>);

/// The galley directory given on the command line.
pub struct InitialDir(pub Option<String>);

impl OpenDirs {
    /// Returns `root` if it is an open galley directory.
    fn get(&self, root: &str) -> AppResult<PathBuf> {
        let root = PathBuf::from(root);
        if self.0.lock().contains(&root) {
            Ok(root)
        } else {
            Err(AppError::Invalid(format!("{} is not an open galley directory", root.display())))
        }
    }

    /// Returns a copy of the open galley directories.
    pub fn all(&self) -> Vec<PathBuf> {
        self.0.lock().clone()
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

/// Returns the names that the user gives to tabs, by galley path.
#[tauri::command]
pub fn get_tab_names() -> BTreeMap<String, String> {
    Settings::load(&data_dir()).unwrap_or_default().tab_names
}

/// Sets the tab name of the galley directory `path`. An empty name removes
/// it. Returns all tab names.
#[tauri::command]
pub fn set_tab_name(path: String, name: String) -> AppResult<BTreeMap<String, String>> {
    Settings::update(&data_dir(), |s| s.set_tab_name(&path, &name))?;
    Ok(get_tab_names())
}

/// Makes a new galley directory with `GALLEY.md`. An existing directory gets
/// `GALLEY.md` if it has none.
#[tauri::command]
pub fn create_dir(path: String) -> AppResult<()> {
    std::fs::create_dir_all(&path)?;
    galley::init_rules(Path::new(&path))
}

/// Opens a galley directory and returns its contents. The `galley` URI
/// scheme serves files from the open directories only, so that images resolve.
/// The `path` of the result identifies the directory in all other commands.
#[tauri::command]
pub fn open_dir(path: String, open: State<'_, OpenDirs>) -> AppResult<Galley> {
    let dir = std::fs::canonicalize(&path)?;
    if !dir.is_dir() {
        return Err(AppError::Invalid(format!("{path} is not a directory")));
    }
    let result = galley::scan(&dir)?;
    {
        let mut dirs = open.0.lock();
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    let _ = Settings::update(&data_dir(), |s| s.push_recent(result.path.clone()));
    Ok(result)
}

/// Closes an open galley directory. The `galley` URI scheme no longer serves
/// its files.
#[tauri::command]
pub fn close_dir(root: String, open: State<'_, OpenDirs>) {
    open.0.lock().retain(|d| d != Path::new(&root));
}

#[tauri::command]
pub fn scan_dir(root: String, open: State<'_, OpenDirs>) -> AppResult<Galley> {
    galley::scan(&open.get(&root)?)
}

#[tauri::command]
pub fn init_rules(root: String, open: State<'_, OpenDirs>) -> AppResult<()> {
    galley::init_rules(&open.get(&root)?)
}

#[tauri::command]
pub fn read_rules(root: String, open: State<'_, OpenDirs>) -> AppResult<String> {
    galley::read_rules(&open.get(&root)?)
}

#[tauri::command]
pub fn write_rules(root: String, text: String, open: State<'_, OpenDirs>) -> AppResult<()> {
    galley::write_rules(&open.get(&root)?, &text)
}

/// The template of `GALLEY.md`.
#[tauri::command]
pub fn rules_template() -> &'static str {
    galley::RULES_TEMPLATE
}

#[tauri::command]
pub fn read_file(root: String, path: String, open: State<'_, OpenDirs>) -> AppResult<String> {
    galley::read_text(&open.get(&root)?, Path::new(&path))
}

/// Reads a file inside the galley as bytes, for example a PDF document.
#[tauri::command]
pub fn read_binary(root: String, path: String, open: State<'_, OpenDirs>) -> AppResult<tauri::ipc::Response> {
    Ok(tauri::ipc::Response::new(galley::read_bytes(&open.get(&root)?, Path::new(&path))?))
}

#[tauri::command]
pub fn read_annotations(root: String, snapshot: String, open: State<'_, OpenDirs>) -> AppResult<String> {
    galley::read_annotations(&open.get(&root)?, Path::new(&snapshot))
}

#[tauri::command]
pub fn write_annotations(root: String, snapshot: String, text: String, open: State<'_, OpenDirs>) -> AppResult<()> {
    galley::write_annotations(&open.get(&root)?, Path::new(&snapshot), &text)
}

#[tauri::command]
pub fn delete_document(root: String, document: String, open: State<'_, OpenDirs>) -> AppResult<()> {
    galley::delete_document(&open.get(&root)?, Path::new(&document))
}

#[tauri::command]
pub fn delete_snapshots(
    root: String,
    document: String,
    names: Vec<String>,
    open: State<'_, OpenDirs>,
) -> AppResult<()> {
    galley::delete_snapshots(&open.get(&root)?, Path::new(&document), &names)
}

/// The most hits that one search returns.
const SEARCH_LIMIT: usize = 500;

#[tauri::command]
pub fn search(root: String, query: String, open: State<'_, OpenDirs>) -> AppResult<SearchResult> {
    galley::search(&open.get(&root)?, &query, SEARCH_LIMIT)
}

#[tauri::command]
pub fn hash_files(root: String, paths: Vec<String>, open: State<'_, OpenDirs>) -> AppResult<Vec<Option<String>>> {
    Ok(galley::hash_files(&open.get(&root)?, &paths))
}

/// Saves the page as a PDF file at `path` with the page setup `page`. The
/// frontend prepares the page for print first.
#[tauri::command]
pub async fn export_pdf(path: String, page: crate::pdf::PageOptions, window: tauri::WebviewWindow) -> AppResult<()> {
    crate::pdf::export(window, PathBuf::from(path), page).await
}

/// Takes a screenshot of a rectangle of the visible area of the window and
/// returns it as PNG.
#[tauri::command]
pub async fn capture_region(rect: crate::capture::Rect, window: tauri::WebviewWindow) -> AppResult<tauri::ipc::Response> {
    Ok(tauri::ipc::Response::new(crate::capture::capture(window, rect).await?))
}

/// Writes the screenshot of a region annotation into the `annotations`
/// directory of a snapshot. Returns its path relative to the snapshot. The
/// body of the request is the PNG; the percent-encoded headers `root`,
/// `snapshot` and `name` give the galley, the snapshot directory and the
/// file name.
#[tauri::command]
pub fn write_region_image(request: tauri::ipc::Request<'_>, open: State<'_, OpenDirs>) -> AppResult<String> {
    let tauri::ipc::InvokeBody::Raw(png) = request.body() else {
        return Err(AppError::Invalid("the request has no PNG".into()));
    };
    let header = |key: &str| -> AppResult<String> {
        let value = request
            .headers()
            .get(key)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Invalid(format!("the request has no {key}")))?;
        percent_encoding::percent_decode_str(value)
            .decode_utf8()
            .map(|v| v.into_owned())
            .map_err(|_| AppError::Invalid(format!("the {key} is not UTF-8")))
    };
    let root = header("root")?;
    galley::write_region_image(&open.get(&root)?, Path::new(&header("snapshot")?), &header("name")?, png)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PreferencesPayload {
    pub zoom: Option<f64>,
    pub paper_width: Option<u32>,
    pub sidebar_left_width: Option<u32>,
    pub sidebar_right_width: Option<u32>,
    pub contents_height: Option<u32>,
    pub copy_as_markdown: Option<bool>,
    pub doc_font: Option<String>,
    pub pdf: Option<serde_json::Value>,
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
        s.doc_font = prefs.doc_font;
        s.pdf = prefs.pdf;
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
        doc_font: s.doc_font,
        pdf: s.pdf,
    }
}
