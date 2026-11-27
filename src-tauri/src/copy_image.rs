//! The "Copy Image" item of the context menu of the webview. For an image of
//! the `galley` URI scheme, an item replaces the stock item of WebKitGTK: it
//! reads the image file of the open galley and puts its pixels on the
//! clipboard.
//!
//! Only Linux (WebKitGTK) needs this. On other platforms `install` does
//! nothing.

use tauri::{Runtime, WebviewWindow};

#[cfg(target_os = "linux")]
pub fn install<R: Runtime>(window: &WebviewWindow<R>) {
    use tauri::Manager;
    use webkit2gtk::{ContextMenuAction, ContextMenuExt, ContextMenuItem, ContextMenuItemExt, HitTestResultExt, WebViewExt};

    let app = window.app_handle().clone();
    let _ = window.with_webview(move |webview| {
        webview.inner().connect_context_menu(move |_, menu, _, hit| {
            let Some(uri) = hit.image_uri() else { return false };
            let Some(path) = crate::protocol::resolve_uri(&app, &uri) else { return false };
            let items = menu.items();
            let Some(position) =
                items.iter().position(|item| item.stock_action() == ContextMenuAction::CopyImageToClipboard)
            else {
                return false;
            };

            let action = gio::SimpleAction::new("galley-copy-image", None);
            let app = app.clone();
            action.connect_activate(move |_, _| {
                if let Err(e) = copy_to_clipboard(&app, &path) {
                    eprintln!("galley: copy image failed: {e}");
                }
            });
            menu.remove(&items[position]);
            menu.insert(&ContextMenuItem::from_gaction(&action, "Copy Image", None), position as i32);
            false
        });
    });
}

#[cfg(not(target_os = "linux"))]
pub fn install<R: Runtime>(_window: &WebviewWindow<R>) {}

/// Puts the image at `path` on the clipboard as pixels.
#[cfg(target_os = "linux")]
fn copy_to_clipboard<R: Runtime>(app: &tauri::AppHandle<R>, path: &std::path::Path) -> Result<(), String> {
    use gtk::gdk_pixbuf::PixbufLoader;
    use gtk::prelude::*;

    let bytes = crate::protocol::read_open_file(app, path).ok_or("the file is not in an open galley")?;
    let loader = PixbufLoader::new();
    loader.write(&bytes).map_err(|e| e.to_string())?;
    loader.close().map_err(|e| e.to_string())?;
    let pixbuf = loader.pixbuf().ok_or("the file is not an image")?;
    let clipboard = gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD);
    clipboard.set_image(&pixbuf);
    clipboard.store();
    Ok(())
}
