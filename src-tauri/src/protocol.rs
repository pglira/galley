//! The `galley` URI scheme serves files of the open galley directories, for
//! example the images of a document. It refuses all paths outside these
//! directories, so a document can only load files of an open galley.

use crate::commands::OpenDirs;
use percent_encoding::percent_decode_str;
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, Runtime, UriSchemeContext};

pub const SCHEME: &str = "galley";

type Body = Cow<'static, [u8]>;

/// Returns the file path of a request URI path. The frontend encodes the full
/// absolute path as one path segment, for example `/%2Fhome%2Fa.png`.
fn file_path(uri_path: &str) -> Option<PathBuf> {
    let encoded = uri_path.strip_prefix('/').unwrap_or(uri_path);
    let decoded = percent_decode_str(encoded).decode_utf8().ok()?;
    Some(PathBuf::from(decoded.as_ref()))
}

fn mime_type(path: &Path) -> &'static str {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        _ => "application/octet-stream",
    }
}

fn status(code: StatusCode) -> Response<Body> {
    Response::builder().status(code).body(Cow::Borrowed(&[][..])).unwrap()
}

/// Returns the file path of a `galley` URI, for example
/// `galley://localhost/%2Fhome%2Fa.png`. Returns `None` for other URIs.
fn uri_file_path(uri: &str) -> Option<PathBuf> {
    let rest = uri.strip_prefix(SCHEME)?.strip_prefix("://")?;
    let path = &rest[rest.find('/')?..];
    let path = path.split(['?', '#']).next().unwrap_or(path);
    file_path(path)
}

/// Returns the file path of a `galley` URI if the file is inside an open
/// galley directory.
pub fn resolve_uri<R: Runtime>(app: &AppHandle<R>, uri: &str) -> Option<PathBuf> {
    let path = uri_file_path(uri)?;
    app.state::<OpenDirs>().all().iter().any(|r| path.starts_with(r)).then_some(path)
}

/// Reads the file at `path` if it is inside an open galley directory.
pub fn read_open_file<R: Runtime>(app: &AppHandle<R>, path: &Path) -> Option<Vec<u8>> {
    let roots = app.state::<OpenDirs>().all();
    let root = roots.iter().find(|r| path.starts_with(r))?;
    crate::galley::read_bytes(root, path).ok()
}

pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>) -> Response<Body> {
    let Some(path) = file_path(request.uri().path()) else {
        return status(StatusCode::BAD_REQUEST);
    };
    let roots = ctx.app_handle().state::<OpenDirs>().all();
    let Some(root) = roots.iter().find(|r| path.starts_with(r)) else {
        return status(StatusCode::FORBIDDEN);
    };
    match crate::galley::read_bytes(root, &path) {
        Ok(bytes) => Response::builder()
            .header(header::CONTENT_TYPE, mime_type(&path))
            .body(Cow::Owned(bytes))
            .unwrap(),
        Err(crate::error::AppError::Invalid(_)) => status(StatusCode::FORBIDDEN),
        Err(_) => status(StatusCode::NOT_FOUND),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_the_encoded_path() {
        assert_eq!(file_path("/%2Fhome%2Fa%20b.png"), Some(PathBuf::from("/home/a b.png")));
        assert_eq!(file_path("/C%3A%5Cr%5Ca.png"), Some(PathBuf::from("C:\\r\\a.png")));
    }

    #[test]
    fn decodes_the_uri() {
        assert_eq!(
            uri_file_path("galley://localhost/%2Fhome%2Fa%20b.png"),
            Some(PathBuf::from("/home/a b.png"))
        );
        assert_eq!(uri_file_path("galley://localhost/%2Fa.png?x=1"), Some(PathBuf::from("/a.png")));
        assert_eq!(uri_file_path("http://galley.localhost/%2Fa.png"), None);
        assert_eq!(uri_file_path("https://example.com/a.png"), None);
    }

    #[test]
    fn guesses_image_types() {
        assert_eq!(mime_type(Path::new("a.PNG")), "image/png");
        assert_eq!(mime_type(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(mime_type(Path::new("a")), "application/octet-stream");
    }
}
