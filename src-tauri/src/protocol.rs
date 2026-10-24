//! The `galley` URI scheme serves files of the open galley directories, for
//! example the images of a document. It refuses all paths outside these
//! directories, so a document can only load files of an open galley.

use crate::commands::OpenDirs;
use percent_encoding::percent_decode_str;
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext};

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
    fn guesses_image_types() {
        assert_eq!(mime_type(Path::new("a.PNG")), "image/png");
        assert_eq!(mime_type(Path::new("a.svg")), "image/svg+xml");
        assert_eq!(mime_type(Path::new("a")), "application/octet-stream");
    }
}
