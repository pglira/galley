//! Screenshots of a rectangle of the webview, as PNG. The rectangle is in
//! CSS pixels of the visible area. The PNG has the resolution of the screen.
//!
//! Only Linux (WebKitGTK) supports this. Other platforms return
//! `AppError::Unsupported`.

use crate::error::{AppError, AppResult};
use tauri::WebviewWindow;

/// A rectangle of the visible area of the webview, in CSS pixels.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[cfg(target_os = "linux")]
pub async fn capture(window: WebviewWindow, rect: Rect) -> AppResult<Vec<u8>> {
    use std::sync::mpsc;
    use webkit2gtk::{SnapshotOptions, SnapshotRegion, WebViewExt};

    if rect.width < 1.0 || rect.height < 1.0 {
        return Err(AppError::Invalid("the region is empty".into()));
    }
    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();
    window
        .with_webview(move |webview| {
            let view = webview.inner();
            view.snapshot(SnapshotRegion::Visible, SnapshotOptions::NONE, None::<&gio::Cancellable>, move |result| {
                let _ = tx.send(result.map_err(|e| e.to_string()).and_then(|surface| crop(&surface, rect)));
            });
        })
        .map_err(|e| AppError::Other(e.into()))?;
    tauri::async_runtime::spawn_blocking(move || rx.recv())
        .await
        .map_err(|e| AppError::Other(e.into()))?
        .map_err(|_| AppError::Invalid("the screenshot stopped without a result".into()))?
        .map_err(|e| AppError::Other(anyhow::anyhow!("screenshot failed: {e}")))
}

/// Copies `rect` of `surface` into a new PNG. The surface has the device
/// scale of the screen, so its user units are CSS pixels.
#[cfg(target_os = "linux")]
fn crop(surface: &cairo::Surface, rect: Rect) -> Result<Vec<u8>, String> {
    let (sx, sy) = surface.device_scale();
    let w = (rect.width * sx).round().max(1.0) as i32;
    let h = (rect.height * sy).round().max(1.0) as i32;
    let out = cairo::ImageSurface::create(cairo::Format::ARgb32, w, h).map_err(|e| e.to_string())?;
    out.set_device_scale(sx, sy);
    {
        let cr = cairo::Context::new(&out).map_err(|e| e.to_string())?;
        cr.set_source_surface(surface, -rect.x, -rect.y).map_err(|e| e.to_string())?;
        cr.paint().map_err(|e| e.to_string())?;
    }
    let mut png = Vec::new();
    out.write_to_png(&mut png).map_err(|e| e.to_string())?;
    Ok(png)
}

#[cfg(not(target_os = "linux"))]
pub async fn capture(_window: WebviewWindow, _rect: Rect) -> AppResult<Vec<u8>> {
    Err(AppError::Unsupported)
}
