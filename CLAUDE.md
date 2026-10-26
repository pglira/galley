# CLAUDE.md — Galley

## What this is

Galley is a Tauri desktop app to review Markdown and PDF documents from AI agents. It opens a **galley directory**, shows its documents and snapshots, lets the user annotate text, diffs snapshots, and copies a prompt for the agent. See `README.md` for the workflow and `PLAN.md` for the scope.

Galley is a fork of Marky. Keep the scope small: no editor for documents (only for `GALLEY.md`), no agent integration. Files are the only channel to the agent.

## Galley directory

```
<root>/GALLEY.md                         rules for the agent (template: src-tauri/src/GALLEY.md)
<root>/<YYYY-MM-DD_HHMM_name>/<NN>/document.md     agent (or document.pdf)
<root>/<YYYY-MM-DD_HHMM_name>/<NN>/images/         agent
<root>/<YYYY-MM-DD_HHMM_name>/<NN>/annotations.md  Galley
<root>/<YYYY-MM-DD_HHMM_name>/<NN>/annotations/    Galley (screenshots of region annotations)
```

- Galley writes only `annotations.md`, the screenshots in `annotations/` and `GALLEY.md`, and deletes documents and snapshots on request. It never writes the document or its images. Saving `annotations.md` deletes the screenshots that it does not refer to.
- Prompts for the agent use only paths relative to the galley root. The agent can see the directory under another absolute path (container, SSH host).
- The format of `annotations.md` is documented in `src-tauri/src/GALLEY.md` and implemented in `src/lib/annotations.ts`. Change both together.

## Stack (do not swap without asking)

Tauri v2 (Rust), Vite + React + TypeScript, pnpm, markdown-it, Shiki, mermaid, shadcn/ui, Tailwind CSS, DOMPurify, `diff` (jsdiff), `pdfjs-dist` (PDF.js).

## Layout

- `src-tauri/src/galley.rs` — scan, annotations I/O, deletion, image hashes. All paths are checked to be inside the galley root.
- `src-tauri/src/commands.rs` — Tauri commands; the open roots live in `OpenDirs` managed state. Commands on a galley take its root, which must be open.
- `src-tauri/src/protocol.rs` — the `galley` URI scheme for the images of the open galleys.
- `src-tauri/src/capture.rs` — screenshots of a rectangle of the webview through WebKitGTK (Linux) for region annotations (`src/lib/region.ts`).
- `src-tauri/src/pdf.rs` — PDF export through WebKitGTK (Linux); other platforms use the print dialog.
- `src/App.tsx` — `AppShell` holds the tabs (`src/components/TabBar.tsx`), one per open galley. `GalleyView` holds the state of one galley: selection, diff, annotations. The shown galley polls `scan_dir` every 2 s (works on sshfs and container volumes, where file events do not).
- `src/components/Viewer.tsx` — rendering pipeline: markdown → optional diff → Shiki/mermaid → annotation marks.
- `src/components/PdfViewer.tsx` — PDF documents: pages with a canvas and a PDF.js text layer (`src/lib/pdf.ts`), annotation marks in the text layer. The canvases render only near the view. PDF bytes load through the `read_binary` command. The text selection follows the nearest text (`src/lib/pdfSelection.ts`). The diff is a word diff of the text streams (`src/lib/pdfDiff.ts`), drawn in a layer on top of each page (`src/lib/pdfDiffLayer.ts`). The side-by-side view puts the pages of the reference (`.pdf-old-page`) next to the pages (`.pdf-page`) in a two-column grid.
- `src/lib/diff.ts` — block diff of rendered HTML with word-level diff inside text blocks.
- `src/lib/textRange.ts` — character index over DOM text, wrap and insert helpers.
- `src/lib/prompt.ts` — the prompt for the agent.
- `src/lib/enhance.ts` — Shiki and mermaid on rendered HTML; used by the viewer and the PDF export.
- `src/lib/print.ts` — PDF export: renders the document into `#print-root`, which only print media shows.
- `src/components/PdfExportDialog.tsx` — the options of the PDF export (`src/lib/pdfOptions.ts`), stored in the preferences as `pdf`.
- `src/components/RulesEditor.tsx` — the dialog to edit `GALLEY.md`.
- `src/components/SearchPanel.tsx` — search in all documents (`search` command in `galley.rs`).
- `src/components/TableOfContents.tsx` — the headings of the shown document below the document tree (`src/lib/toc.ts`).

## Conventions

- All `invoke()` calls go through `src/lib/tauri.ts`.
- One markdown-it instance in `src/lib/markdown.ts`. Sanitize all HTML with DOMPurify.
- Relative image paths resolve against the document and load through the `galley` URI scheme (`src-tauri/src/protocol.rs`). It serves only files inside an open galley root. The CSP in `index.html` allows images only from the app, this scheme and `data:`.
- Markdown styles live in `src/styles/markdown.css`, including the diff and annotation styles.
- The look is flat and academic: all corners are square (the radius tokens in `src/styles/index.css` are 0; do not add `border-radius` or `rounded-full`), the app font is IBM Plex Sans, the document font is a setting (`src/lib/fonts.ts`, default Inter, CSS variable `--font-doc`), and code uses IBM Plex Mono, and the accent is a muted steel blue.
- The app chrome is always dark. The document renders on a `.paper` element with a selectable color (`src/lib/theme.tsx`). `.paper-light` and `.paper-dark` set the color variables for content on the paper; Shiki and mermaid use the tone of the paper.
- `scripts/install.sh` builds the release and installs the launcher, the desktop entry and the icons below `$PREFIX`.

## Testing

- `pnpm test` and `pnpm typecheck` for the frontend; `cargo test` in `src-tauri/`.
- Before reporting a task done, run `pnpm tauri dev` on a galley directory with images and look at the result.
