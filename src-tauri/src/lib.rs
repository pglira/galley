mod cli;
mod commands;
mod error;
mod fs;
mod galley;
mod pdf;
mod protocol;
mod settings;

use commands::{InitialDir, OpenDir};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let initial = cli::resolve(&args);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // A second launch with a directory opens it in the running window.
            if let Some(dir) = cli::resolve(&argv) {
                let _ = app.emit("galley://open", dir);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .register_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .manage(OpenDir::default())
        .manage(InitialDir(initial))
        .invoke_handler(tauri::generate_handler![
            commands::get_initial_dir,
            commands::get_recent_dirs,
            commands::create_dir,
            commands::open_dir,
            commands::scan_dir,
            commands::init_rules,
            commands::read_file,
            commands::read_annotations,
            commands::write_annotations,
            commands::delete_report,
            commands::delete_snapshots,
            commands::hash_files,
            commands::search,
            commands::export_pdf,
            commands::save_preferences,
            commands::load_preferences,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
