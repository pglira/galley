# Galley

Galley is a desktop app to review Markdown documents from AI agents. You read a document, annotate it, and give the annotations back to the agent. The agent writes a new snapshot of the document, and Galley shows you what changed.

Galley is a fork of [Marky](https://github.com/GRVYDEV/marky) (Tauri v2, Rust, React).

## Workflow

1. Give the agent a task and point it to a galley directory. Galley writes the rules for the agent into `GALLEY.md` in that directory.
2. The agent writes a document: `YYYY-MM-DD_HHMM_<name>/01/document.md`, with figures in `images/`.
3. Open the galley directory in Galley. The left side shows all documents and their snapshots.
4. Select text in the document and click **Annotate**. Galley saves the annotations in `annotations.md` next to the document.
5. Click **Copy prompt** (`Ctrl Shift C`) and paste the prompt into the terminal of the agent. The prompt uses only relative paths, so it works when the agent runs in a container or on a remote host.
6. The agent writes the next snapshot. Enable **Diff against** to see only the changes since a reference snapshot.
7. When the document is complete, delete the old snapshots: open the menu (`…`) of the snapshot to keep and click **Delete all other snapshots**. The menu can also delete one snapshot. The trash icon of a document deletes the full document directory.

## Galley directory

```
galley/
  GALLEY.md                        rules for the agent
  2026-10-09_1430_cache-design/    one document
    01/                            one snapshot
      document.md                  written by the agent
      images/                      written by the agent
      annotations.md               written by Galley
    02/
```

Galley polls the directory every 2 seconds. Thus it also works on network mounts (for example `sshfs`) and on DevContainer volumes.

## Install

Requirements: Rust, Node.js, pnpm, and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) (on Debian/Ubuntu: `libwebkit2gtk-4.1-dev`).

```bash
scripts/install.sh               # build, install into ~/.local, add Galley to the app menu
scripts/install.sh --no-desktop  # do not add the desktop entry and the icon
scripts/install.sh --uninstall
```

The script installs the launcher `~/.local/bin/galley`. Set `PREFIX` to install to another location.

```bash
galley                           # start screen: open or create a galley directory
galley path/to/galley-directory
```

## Usage

- Click an image to open it in an overlay. Zoom with the mouse wheel or `+` and `-`, pan with drag. `0` fits the image, `1` shows it at 100 %, `Esc` closes.
- Move in the document with the keys: `j` and `k` or the arrow keys (two lines), `d` and `u` (half a page), `Space`, `Shift Space`, `b`, `Page Down` and `Page Up` (a page), `g` or `Home` (top), `G` or `End` (bottom), `]` and `[` (next and previous heading).
- Change the text size of the document with `Ctrl +`, `Ctrl -` and `Ctrl 0` (reset), or with `Ctrl` and the mouse wheel. The images scale with the text.
- Set the page width and the paper color (the page of the document) in the settings menu. Galley is always dark.
- Search all documents and annotations with the field above the document list (`Ctrl Shift F`). Click a hit to open its snapshot at the match. `Ctrl F` finds text in the open document.
- Edit `GALLEY.md` with the scroll icon above the document list. **Revert to default** replaces the text with the default `GALLEY.md` of the installed Galley version. Save with `Ctrl Enter`.
- Annotate the selected text with the "Annotate" button or `Ctrl M`. Add a general comment with the plus icon in the annotations panel or `Ctrl Shift M`. Save a comment with `Ctrl Enter`, cancel with `Esc`.
- Reload the selected snapshot with the reload icon in the toolbar (`F5`). Galley reads the document, its annotations and its images again. Galley also polls the directory every 2 s, but a reload also loads images that changed under the same name.
- Export the document as a PDF with the export icon in the toolbar (`Ctrl P`). The PDF shows the document as it shows on screen, with the diff if it is on, on white paper. On Linux, Galley saves the PDF directly; the paper size comes from `$PAPERSIZE` or `/etc/papersize`, else from the locale. On other systems, the print dialog opens.
- Links to web pages open in the browser. Remote images do not load: a document can only show images from the galley directory.

## Develop

```bash
pnpm install
pnpm tauri dev
```

## Tests

```bash
pnpm test && pnpm typecheck      # frontend
cd src-tauri && cargo test        # backend
```

## License

Apache-2.0, see [LICENSE](LICENSE).
