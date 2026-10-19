use std::path::PathBuf;

/// Resolves the galley directory from argv: the first non-flag argument, if
/// it is a directory. A file argument resolves to the galley directory that
/// contains it, found as the nearest ancestor with `GALLEY.md`.
pub fn resolve(args: &[String]) -> Option<String> {
    let raw = args.iter().skip(1).find(|a| !a.starts_with("--"))?;
    let abs = std::fs::canonicalize(PathBuf::from(raw)).ok()?;
    let dir = if abs.is_dir() {
        abs
    } else {
        abs.ancestors()
            .find(|d| d.join(crate::galley::RULES_FILE).is_file())?
            .to_path_buf()
    };
    dir.to_str().map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn args(p: &std::path::Path) -> Vec<String> {
        vec!["galley".into(), p.to_string_lossy().into_owned()]
    }

    #[test]
    fn no_args_is_none() {
        assert_eq!(resolve(&["galley".to_string()]), None);
    }

    #[test]
    fn missing_path_is_none() {
        assert_eq!(resolve(&["galley".into(), "/nonexistent/xyz123".into()]), None);
    }

    #[test]
    fn directory_resolves_to_itself() {
        let dir = tempdir().unwrap();
        let canon = fs::canonicalize(dir.path()).unwrap();
        assert_eq!(resolve(&args(dir.path())), canon.to_str().map(String::from));
    }

    #[test]
    fn file_resolves_to_galley_root() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("GALLEY.md"), "").unwrap();
        let snap = dir.path().join("r/01");
        fs::create_dir_all(&snap).unwrap();
        fs::write(snap.join("document.md"), "").unwrap();
        let canon = fs::canonicalize(dir.path()).unwrap();
        assert_eq!(resolve(&args(&snap.join("document.md"))), canon.to_str().map(String::from));
    }

    #[test]
    fn flags_are_skipped() {
        let dir = tempdir().unwrap();
        let a = vec!["galley".into(), "--flag".into(), dir.path().to_string_lossy().into_owned()];
        assert!(resolve(&a).is_some());
    }
}
