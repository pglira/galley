# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Galley directories: a tree of documents and their snapshots, newest document first.
- Annotations on selected text and general comments, saved in `annotations.md` of each snapshot.
- Diff of a snapshot against a reference snapshot, with word-level changes, added and removed blocks, and changed images.
- **Copy prompt** (`Ctrl Shift C`): a prompt for the agent with relative paths only.
- Deletion of a document, of one snapshot, and of all other snapshots of a document.
- `GALLEY.md`: the rules for the agent, created from the app.
- Local images in documents, through the `galley` URI scheme. It serves only files of the open galley directory. Remote images do not load.
- Image overlay with zoom and pan.
- Reload of the selected snapshot with its annotations and images: a toolbar button and `F5`.
- Start screen to open or create a galley directory, with recent directories.
- Dark app with a selectable paper color for the document.
- `scripts/install.sh`: installs the launcher, a desktop entry and an icon.
- Page width setting.
- Search in all documents and annotations, with jump to the match.
- PDF export of the document as it shows, with the diff if it is on.
- Editor for `GALLEY.md`, with a revert to the default of the installed Galley version.
- `GALLEY.md` tells the agent to write absolute documents: each snapshot describes the subject as it is, not the changes since the previous snapshot.
- Text size applies to the document only, with browser shortcuts: `Ctrl +`, `Ctrl -`, `Ctrl 0`, `Ctrl` + mouse wheel, and the numpad keys.

### Fixed
- The release build contains the Geist font.
- Dropdown menus are opaque.
- A deletion of snapshots deletes only the snapshots that the dialog names, also when the agent writes a new snapshot at that time.
- A fast change of the selection cannot show or save the annotations of another snapshot.
- Comments that start with `>` or contain a `## N` line survive a save and load.
- A changed code block shows as a removed block and an added block in the diff.
- Code and diagrams take the colors of a new paper tone at once.
- Links in a document do not navigate the window. Web links open in the browser.
- `<style>` elements in a document are removed.
- `GALLEY.md` tells the agent to write `document.md` last in each snapshot.

### Changed
- The agent writes `document.md` instead of `report.md`. The app calls the reports "documents".

### Removed
- Marky features that Galley does not use: folder workspaces, command palette, tabs, split panes, and the light and dark themes.
- Unused UI components and packages.

Galley is a fork of [Marky](https://github.com/GRVYDEV/marky) 0.1.3.
