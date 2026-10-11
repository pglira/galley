//! The galley directory: reports, their snapshots and the annotations on them.
//!
//! ```text
//! <root>/
//!   GALLEY.md
//!   <report>/          e.g. 2026-10-09_1430_cache-design
//!     01/              snapshot
//!       report.md      written by the agent
//!       images/        written by the agent
//!       annotations.md written by Galley
//! ```

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const RULES_FILE: &str = "GALLEY.md";
pub const REPORT_FILE: &str = "report.md";
pub const ANNOTATIONS_FILE: &str = "annotations.md";
pub const RULES_TEMPLATE: &str = include_str!("GALLEY.md");

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Snapshot {
    pub name: String,
    pub path: String,
    /// Modification time of `report.md` in milliseconds since the Unix epoch.
    pub report_modified: u64,
    /// Modification time of `annotations.md`, or `None` if the file does not exist.
    pub annotations_modified: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Report {
    pub name: String,
    pub path: String,
    /// Snapshots in ascending order.
    pub snapshots: Vec<Snapshot>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Galley {
    pub path: String,
    pub has_rules: bool,
    /// Reports in descending order of name, so the newest report is first.
    pub reports: Vec<Report>,
}

fn is_snapshot_name(name: &str) -> bool {
    !name.is_empty() && name.bytes().all(|b| b.is_ascii_digit())
}

fn modified_ms(path: &Path) -> Option<u64> {
    let meta = std::fs::metadata(path).ok()?;
    let t = meta.modified().ok()?;
    Some(t.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64)
}

fn path_string(path: &Path) -> AppResult<String> {
    path.to_str().map(String::from).ok_or(AppError::NonUtf8Path)
}

fn subdirs(dir: &Path) -> AppResult<Vec<(String, PathBuf)>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let Some(name) = entry.file_name().to_str().map(String::from) else {
            continue;
        };
        if name.starts_with('.') {
            continue;
        }
        out.push((name, entry.path()));
    }
    Ok(out)
}

/// Lists all reports and snapshots under `root`. A snapshot is a directory
/// with a numeric name that contains `report.md`. Reports without snapshots
/// are left out.
pub fn scan(root: &Path) -> AppResult<Galley> {
    let mut reports = Vec::new();
    for (name, path) in subdirs(root)? {
        let mut snapshots = Vec::new();
        for (snap_name, snap_path) in subdirs(&path)? {
            if !is_snapshot_name(&snap_name) {
                continue;
            }
            let Some(report_modified) = modified_ms(&snap_path.join(REPORT_FILE)) else {
                continue;
            };
            snapshots.push(Snapshot {
                name: snap_name,
                path: path_string(&snap_path)?,
                report_modified,
                annotations_modified: modified_ms(&snap_path.join(ANNOTATIONS_FILE)),
            });
        }
        if snapshots.is_empty() {
            continue;
        }
        snapshots.sort_by_key(|s| s.name.parse::<u64>().unwrap_or(0));
        reports.push(Report {
            name,
            path: path_string(&path)?,
            snapshots,
        });
    }
    reports.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(Galley {
        path: path_string(root)?,
        has_rules: root.join(RULES_FILE).is_file(),
        reports,
    })
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SearchHit {
    pub report: String,
    pub snapshot: String,
    /// `report.md` or `annotations.md`.
    pub file: String,
    /// Line number, starting at 1.
    pub line: usize,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    /// True if the search stopped at the limit of hits.
    pub truncated: bool,
}

/// The longest line text that a search hit contains.
const HIT_TEXT_MAX: usize = 2000;

/// Finds the lines that contain `query` (case-insensitive) in `report.md` and
/// `annotations.md` of all snapshots. The newest report and the newest
/// snapshot come first. The search stops after `limit` hits.
pub fn search(root: &Path, query: &str, limit: usize) -> AppResult<SearchResult> {
    let needle = query.trim().to_lowercase();
    let mut hits = Vec::new();
    if needle.is_empty() {
        return Ok(SearchResult { hits, truncated: false });
    }
    let galley = scan(root)?;
    for report in &galley.reports {
        for snap in report.snapshots.iter().rev() {
            for file in [REPORT_FILE, ANNOTATIONS_FILE] {
                let Ok(text) = std::fs::read_to_string(Path::new(&snap.path).join(file)) else {
                    continue;
                };
                for (i, line) in text.lines().enumerate() {
                    if !line.to_lowercase().contains(&needle) {
                        continue;
                    }
                    if hits.len() == limit {
                        return Ok(SearchResult { hits, truncated: true });
                    }
                    let end = line.char_indices().nth(HIT_TEXT_MAX).map_or(line.len(), |(b, _)| b);
                    hits.push(SearchHit {
                        report: report.name.clone(),
                        snapshot: snap.name.clone(),
                        file: file.to_string(),
                        line: i + 1,
                        text: line[..end].to_string(),
                    });
                }
            }
        }
    }
    Ok(SearchResult { hits, truncated: false })
}

/// Writes `GALLEY.md` into `root` if the file does not exist.
pub fn init_rules(root: &Path) -> AppResult<()> {
    let p = root.join(RULES_FILE);
    if p.exists() {
        return Ok(());
    }
    std::fs::write(p, RULES_TEMPLATE)?;
    Ok(())
}

/// Returns the canonical path of `path` if it is inside `root`.
fn inside(root: &Path, path: &Path) -> AppResult<PathBuf> {
    let root = std::fs::canonicalize(root)?;
    let p = std::fs::canonicalize(path)?;
    if !p.starts_with(&root) {
        return Err(AppError::Invalid(format!("{} is outside the galley directory", p.display())));
    }
    Ok(p)
}

/// Returns the canonical path of `report` if it is a report directory of `root`.
fn report_dir(root: &Path, report: &Path) -> AppResult<PathBuf> {
    let p = inside(root, report)?;
    if p.parent() != Some(std::fs::canonicalize(root)?.as_path()) {
        return Err(AppError::Invalid(format!("{} is not a report", p.display())));
    }
    Ok(p)
}

/// Returns the canonical path of `snapshot` if it is a snapshot directory of `root`.
fn snapshot_dir(root: &Path, snapshot: &Path) -> AppResult<PathBuf> {
    let p = inside(root, snapshot)?;
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let is_snapshot = is_snapshot_name(name)
        && p.parent().and_then(|r| r.parent()) == Some(std::fs::canonicalize(root)?.as_path());
    if !is_snapshot {
        return Err(AppError::Invalid(format!("{} is not a snapshot", p.display())));
    }
    Ok(p)
}

/// Reads a text file inside `root`.
pub fn read_text(root: &Path, path: &Path) -> AppResult<String> {
    crate::fs::read_text(inside(root, path)?)
}

/// Reads a file inside `root` as bytes.
pub fn read_bytes(root: &Path, path: &Path) -> AppResult<Vec<u8>> {
    Ok(std::fs::read(inside(root, path)?)?)
}

/// Reads `annotations.md` of a snapshot. Returns an empty string if the file
/// does not exist.
pub fn read_annotations(root: &Path, snapshot: &Path) -> AppResult<String> {
    let p = snapshot_dir(root, snapshot)?.join(ANNOTATIONS_FILE);
    if !p.exists() {
        return Ok(String::new());
    }
    crate::fs::read_text(p)
}

/// Writes `annotations.md` of a snapshot atomically. An empty `text` removes
/// the file.
pub fn write_annotations(root: &Path, snapshot: &Path, text: &str) -> AppResult<()> {
    let dir = snapshot_dir(root, snapshot)?;
    let p = dir.join(ANNOTATIONS_FILE);
    if text.trim().is_empty() {
        if p.exists() {
            std::fs::remove_file(p)?;
        }
        return Ok(());
    }
    let tmp = dir.join(format!(".{ANNOTATIONS_FILE}.tmp"));
    std::fs::write(&tmp, text)?;
    std::fs::rename(&tmp, &p)?;
    Ok(())
}

/// Deletes a report directory with all its snapshots.
pub fn delete_report(root: &Path, report: &Path) -> AppResult<()> {
    std::fs::remove_dir_all(report_dir(root, report)?)?;
    Ok(())
}

/// Deletes the snapshots `names` of a report. All names are checked before
/// the first deletion, so that an invalid name deletes nothing. Other
/// snapshot directories (also one that the agent writes at the moment) stay.
pub fn delete_snapshots(root: &Path, report: &Path, names: &[String]) -> AppResult<()> {
    let dir = report_dir(root, report)?;
    let paths = names
        .iter()
        .map(|name| {
            let p = dir.join(name);
            if !is_snapshot_name(name) || !p.is_dir() {
                return Err(AppError::Invalid(format!("{name} is not a snapshot of {}", dir.display())));
            }
            Ok(p)
        })
        .collect::<AppResult<Vec<_>>>()?;
    for p in paths {
        std::fs::remove_dir_all(p)?;
    }
    Ok(())
}

/// Returns a content hash for each file inside `root`, or `None` for files
/// that cannot be read. The hash identifies changed images between snapshots.
pub fn hash_files(root: &Path, paths: &[String]) -> Vec<Option<String>> {
    paths
        .iter()
        .map(|p| {
            let p = inside(root, Path::new(p)).ok()?;
            let bytes = std::fs::read(p).ok()?;
            let mut h = std::collections::hash_map::DefaultHasher::new();
            bytes.hash(&mut h);
            Some(format!("{:016x}", h.finish()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn snapshot(root: &Path, report: &str, snap: &str) -> PathBuf {
        let p = root.join(report).join(snap);
        fs::create_dir_all(&p).unwrap();
        fs::write(p.join(REPORT_FILE), "# r\n").unwrap();
        p
    }

    #[test]
    fn scan_orders_reports_and_snapshots() {
        let dir = tempdir().unwrap();
        snapshot(dir.path(), "2026-01-01_0900_a", "01");
        snapshot(dir.path(), "2026-01-02_0900_b", "02");
        snapshot(dir.path(), "2026-01-02_0900_b", "10");
        snapshot(dir.path(), "2026-01-02_0900_b", "01");
        let g = scan(dir.path()).unwrap();
        let names: Vec<_> = g.reports.iter().map(|r| r.name.as_str()).collect();
        assert_eq!(names, ["2026-01-02_0900_b", "2026-01-01_0900_a"]);
        let snaps: Vec<_> = g.reports[0].snapshots.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(snaps, ["01", "02", "10"]);
        assert!(!g.has_rules);
    }

    #[test]
    fn scan_skips_incomplete_and_hidden_entries() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("r/01")).unwrap();
        fs::create_dir_all(dir.path().join("r/images")).unwrap();
        snapshot(dir.path(), ".hidden", "01");
        let g = scan(dir.path()).unwrap();
        assert!(g.reports.is_empty());
    }

    #[test]
    fn annotations_round_trip_and_removal() {
        let dir = tempdir().unwrap();
        let s = snapshot(dir.path(), "r", "01");
        assert_eq!(read_annotations(dir.path(), &s).unwrap(), "");
        write_annotations(dir.path(), &s, "# Annotations\n").unwrap();
        assert_eq!(read_annotations(dir.path(), &s).unwrap(), "# Annotations\n");
        let g = scan(dir.path()).unwrap();
        assert!(g.reports[0].snapshots[0].annotations_modified.is_some());
        write_annotations(dir.path(), &s, "  \n").unwrap();
        assert!(!s.join(ANNOTATIONS_FILE).exists());
    }

    #[test]
    fn annotations_only_in_snapshots() {
        let dir = tempdir().unwrap();
        snapshot(dir.path(), "r", "01");
        assert!(write_annotations(dir.path(), &dir.path().join("r"), "x").is_err());
        let other = tempdir().unwrap();
        let s = snapshot(other.path(), "r", "01");
        assert!(write_annotations(dir.path(), &s, "x").is_err());
    }

    #[test]
    fn delete_snapshots_deletes_only_the_names() {
        let dir = tempdir().unwrap();
        snapshot(dir.path(), "r", "01");
        snapshot(dir.path(), "r", "02");
        snapshot(dir.path(), "r", "03");
        fs::create_dir_all(dir.path().join("r/04")).unwrap();
        let names = ["01".to_string(), "03".to_string()];
        delete_snapshots(dir.path(), &dir.path().join("r"), &names).unwrap();
        assert!(!dir.path().join("r/01").exists());
        assert!(dir.path().join("r/02/report.md").exists());
        assert!(!dir.path().join("r/03").exists());
        assert!(dir.path().join("r/04").exists());
    }

    #[test]
    fn delete_snapshots_refuses_invalid_names() {
        let dir = tempdir().unwrap();
        snapshot(dir.path(), "r", "01");
        fs::create_dir_all(dir.path().join("r/images")).unwrap();
        let r = dir.path().join("r");
        for bad in ["", "..", "images", "09", "../r"] {
            let names = ["01".to_string(), bad.to_string()];
            assert!(delete_snapshots(dir.path(), &r, &names).is_err(), "{bad}");
        }
        assert!(dir.path().join("r/01").exists());
        assert!(dir.path().join("r/images").exists());
    }

    #[test]
    fn delete_report_deletes_only_reports() {
        let dir = tempdir().unwrap();
        let s = snapshot(dir.path(), "r", "01");
        assert!(delete_report(dir.path(), &s).is_err());
        assert!(delete_report(dir.path(), dir.path()).is_err());
        let other = tempdir().unwrap();
        snapshot(other.path(), "x", "01");
        assert!(delete_report(dir.path(), &other.path().join("x")).is_err());
        assert!(other.path().join("x/01").exists());
        delete_report(dir.path(), &dir.path().join("r")).unwrap();
        assert!(!dir.path().join("r").exists());
        assert!(dir.path().exists());
    }

    #[test]
    fn search_finds_lines_newest_first() {
        let dir = tempdir().unwrap();
        let s1 = snapshot(dir.path(), "r", "01");
        let s2 = snapshot(dir.path(), "r", "02");
        fs::write(s1.join(REPORT_FILE), "# T\nThe Cache is hot.\n").unwrap();
        fs::write(s2.join(REPORT_FILE), "# T\nno match\nthe cache is cold\n").unwrap();
        fs::write(s2.join(ANNOTATIONS_FILE), "## 1\n\nWhy a cache?\n").unwrap();
        let r = search(dir.path(), " CACHE ", 10).unwrap();
        let found: Vec<_> = r.hits.iter().map(|h| (h.snapshot.as_str(), h.file.as_str(), h.line)).collect();
        assert_eq!(
            found,
            [("02", REPORT_FILE, 3), ("02", ANNOTATIONS_FILE, 3), ("01", REPORT_FILE, 2)]
        );
        assert!(!r.truncated);
        assert_eq!(r.hits[2].text, "The Cache is hot.");
        let r = search(dir.path(), "cache", 2).unwrap();
        assert_eq!(r.hits.len(), 2);
        assert!(r.truncated);
        assert!(search(dir.path(), "  ", 10).unwrap().hits.is_empty());
    }

    #[test]
    fn init_rules_does_not_overwrite() {
        let dir = tempdir().unwrap();
        init_rules(dir.path()).unwrap();
        assert!(scan(dir.path()).unwrap().has_rules);
        fs::write(dir.path().join(RULES_FILE), "custom").unwrap();
        init_rules(dir.path()).unwrap();
        assert_eq!(fs::read_to_string(dir.path().join(RULES_FILE)).unwrap(), "custom");
    }

    #[test]
    fn hash_files_detects_changes() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.png");
        let b = dir.path().join("b.png");
        fs::write(&a, "1").unwrap();
        fs::write(&b, "2").unwrap();
        let paths = [a, b, dir.path().join("missing.png")]
            .map(|p| p.to_str().unwrap().to_string());
        let h = hash_files(dir.path(), &paths);
        assert!(h[0].is_some() && h[1].is_some());
        assert_ne!(h[0], h[1]);
        assert_eq!(h[2], None);
    }
}
