//! Saves the page of the webview as a PDF file, without a print dialog. The
//! page decides what prints through its print styles.
//!
//! Only Linux (WebKitGTK) supports this. Other platforms return
//! `AppError::Unsupported`, and the frontend opens the print dialog instead.

use crate::error::{AppError, AppResult};
use tauri::WebviewWindow;

/// The page setup of a PDF export.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct PageOptions {
    /// A libpaper paper name such as `a4` or `letter`, or `system` for the
    /// paper size of the system.
    pub paper: String,
    pub landscape: bool,
    /// Top and bottom margin in mm.
    pub margin_vertical: f64,
    /// Left and right margin in mm.
    pub margin_horizontal: f64,
}

#[cfg(target_os = "linux")]
pub async fn export(window: WebviewWindow, path: std::path::PathBuf, options: PageOptions) -> AppResult<()> {
    use std::sync::mpsc;
    use webkit2gtk::PrintOperationExt;

    let uri = glib::filename_to_uri(&path, None).map_err(|e| AppError::Invalid(e.to_string()))?;
    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    window
        .with_webview(move |webview| {
            let settings = gtk::PrintSettings::new();
            // GTK names its file printer with this translated text.
            settings.set_printer(&glib::dgettext(Some("gtk30"), "Print to File"));
            settings.set(gtk::PRINT_SETTINGS_OUTPUT_FILE_FORMAT, Some("pdf"));
            settings.set(gtk::PRINT_SETTINGS_OUTPUT_URI, Some(&uri));
            let paper = if options.paper == "system" {
                paper_name()
            } else {
                gtk_paper_name(&options.paper).map(String::from)
            };
            let orientation = if options.landscape {
                gtk::PageOrientation::Landscape
            } else {
                gtk::PageOrientation::Portrait
            };
            settings.set_orientation(orientation);
            let page = gtk::PageSetup::new();
            page.set_paper_size(&gtk::PaperSize::new(paper.as_deref()));
            page.set_orientation(orientation);
            page.set_top_margin(options.margin_vertical, gtk::Unit::Mm);
            page.set_bottom_margin(options.margin_vertical, gtk::Unit::Mm);
            page.set_left_margin(options.margin_horizontal, gtk::Unit::Mm);
            page.set_right_margin(options.margin_horizontal, gtk::Unit::Mm);
            let op = webkit2gtk::PrintOperation::new(&webview.inner());
            op.set_print_settings(&settings);
            op.set_page_setup(&page);
            let failed = tx.clone();
            op.connect_failed(move |_, e| {
                let _ = failed.send(Err(e.to_string()));
            });
            op.connect_finished(move |_| {
                let _ = tx.send(Ok(()));
            });
            op.print();
        })
        .map_err(|e| AppError::Other(e.into()))?;
    // A failed print sends an error and then finishes. The first message counts.
    let result = tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| AppError::Other(e.into()))?
        .map_err(|_| AppError::Invalid("the print operation stopped without a result".into()))?;
    result.map_err(|e| AppError::Other(anyhow::anyhow!("PDF export failed: {e}")))?;
    if !path.is_file() {
        return Err(AppError::Invalid(format!("{} was not written", path.display())));
    }
    Ok(())
}

/// The GTK name of the system paper size, as libpaper finds it: `$PAPERSIZE`,
/// then `/etc/papersize`. `None` selects the paper size of the locale.
#[cfg(target_os = "linux")]
fn paper_name() -> Option<String> {
    let name = std::env::var("PAPERSIZE")
        .ok()
        .or_else(|| std::fs::read_to_string("/etc/papersize").ok())?;
    let name = name
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#'))?
        .to_ascii_lowercase();
    gtk_paper_name(&name).map(String::from)
}

#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn gtk_paper_name(libpaper_name: &str) -> Option<&'static str> {
    Some(match libpaper_name {
        "a3" => "iso_a3",
        "a4" => "iso_a4",
        "a5" => "iso_a5",
        "letter" => "na_letter",
        "legal" => "na_legal",
        _ => return None,
    })
}

#[cfg(not(target_os = "linux"))]
pub async fn export(_window: WebviewWindow, _path: std::path::PathBuf, _options: PageOptions) -> AppResult<()> {
    Err(AppError::Unsupported)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_libpaper_names() {
        assert_eq!(gtk_paper_name("a4"), Some("iso_a4"));
        assert_eq!(gtk_paper_name("letter"), Some("na_letter"));
        assert_eq!(gtk_paper_name("b7"), None);
    }
}
