use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Settings {
    /// Recently opened galley directories, the most recent first.
    #[serde(default)]
    pub recent_dirs: Vec<String>,
    #[serde(default)]
    pub zoom: Option<f64>,
    #[serde(default)]
    pub paper_width: Option<u32>,
    #[serde(default)]
    pub sidebar_left_width: Option<u32>,
    #[serde(default)]
    pub sidebar_right_width: Option<u32>,
    /// Height of the table of contents below the document tree.
    #[serde(default)]
    pub contents_height: Option<u32>,
    #[serde(default)]
    pub copy_as_markdown: Option<bool>,
}

const FILE_NAME: &str = "settings.json";
const RECENT_LIMIT: usize = 8;

impl Settings {
    pub fn load(dir: &Path) -> AppResult<Self> {
        let p = dir.join(FILE_NAME);
        if !p.exists() {
            return Ok(Self::default());
        }
        let raw = std::fs::read_to_string(&p)?;
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    pub fn save(&self, dir: &Path) -> AppResult<()> {
        std::fs::create_dir_all(dir)?;
        let p = dir.join(FILE_NAME);
        let tmp = dir.join(format!("{FILE_NAME}.tmp"));
        let raw = serde_json::to_string_pretty(self)?;
        std::fs::write(&tmp, raw)?;
        std::fs::rename(&tmp, &p)?;
        Ok(())
    }

    /// Moves `dir` to the front of the recent directories.
    pub fn push_recent(&mut self, dir: String) {
        self.recent_dirs.retain(|d| d != &dir);
        self.recent_dirs.insert(0, dir);
        self.recent_dirs.truncate(RECENT_LIMIT);
    }

    /// Removes `dir` from the recent directories.
    pub fn remove_recent(&mut self, dir: &str) {
        self.recent_dirs.retain(|d| d != dir);
    }

    /// Loads the settings from `dir`, applies `f` and saves them.
    pub fn update(dir: &Path, f: impl FnOnce(&mut Settings)) -> AppResult<()> {
        let mut s = Self::load(dir)?;
        f(&mut s);
        s.save(dir)
    }
}

pub fn data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("galley")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn round_trip_with_update() {
        let dir = tempdir().unwrap();
        Settings::update(dir.path(), |s| s.push_recent("/tmp/g".into())).unwrap();
        let loaded = Settings::load(dir.path()).unwrap();
        assert_eq!(loaded.recent_dirs, ["/tmp/g"]);
    }

    #[test]
    fn remove_recent_keeps_the_others() {
        let mut s = Settings::default();
        s.push_recent("/g/a".into());
        s.push_recent("/g/b".into());
        s.remove_recent("/g/a");
        s.remove_recent("/g/missing");
        assert_eq!(s.recent_dirs, ["/g/b"]);
    }

    #[test]
    fn push_recent_dedups_and_caps() {
        let mut s = Settings::default();
        for i in 0..20 {
            s.push_recent(format!("/g/{i}"));
        }
        s.push_recent("/g/15".into());
        assert_eq!(s.recent_dirs.len(), RECENT_LIMIT);
        assert_eq!(s.recent_dirs[0], "/g/15");
        assert_eq!(s.recent_dirs.iter().filter(|d| *d == "/g/15").count(), 1);
    }

    #[test]
    fn load_missing_file_is_default() {
        let dir = tempdir().unwrap();
        assert!(Settings::load(dir.path()).unwrap().recent_dirs.is_empty());
    }

    #[test]
    fn load_corrupt_file_falls_back_to_default() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("settings.json"), "{not json").unwrap();
        assert!(Settings::load(dir.path()).unwrap().recent_dirs.is_empty());
    }
}
