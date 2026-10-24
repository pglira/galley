# CLAUDE.md — Galley

## What this is

Galley is a Tauri desktop app to review Markdown documents from AI agents. It opens a **galley directory**, shows its documents and snapshots, lets the user annotate text, diffs snapshots, and copies a prompt for the agent. See `README.md` for the workflow and `PLAN.md` for the scope.

Galley is a fork of Marky. Keep the scope small: no editor for documents (only for `GALLEY.md`), no agent integration. Files are the only channel to the agent.

## Galley directory

```
<root>/GALLEY.md                         rules for the agent (template: src-tauri/src/GALLEY.md)
<root>/<YYYY-MM-DD_HHMM_name>/<NN>/document.md     agent
<root>/<YYYY-MM-DD_HHMM_name>/<NN>/images/         agent
<root>/<YYYY-MM-DD_HHMM_name>/<NN>/annotations.md  Galley
```

- Galley writes only `annotations.md` and `GALLEY.md`, and deletes documents and snapshots on request. It never writes `document.md` or images.
- Prompts for the agent use only paths relative to the galley root. The agent can see the directory under another absolute path (container, SSH host).
- The format of `annotations.md` is documented in `src-tauri/src/GALLEY.md` and implemented in `src/lib/annotations.ts`. Change both together.

## Stack (do not swap without asking)

Tauri v2 (Rust), Vite + React + TypeScript, pnpm, markdown-it, Shiki, mermaid, shadcn/ui, Tailwind CSS, DOMPurify, `diff` (jsdiff).

## Layout

- `src-tauri/src/galley.rs` — scan, annotations I/O, deletion, image hashes. All paths are checked to be inside the open galley root.
- `src-tauri/src/commands.rs` — Tauri commands; the open root lives in `OpenDir` managed state.
- `src-tauri/src/protocol.rs` — the `galley` URI scheme for the images of the open galley.
- `src-tauri/src/pdf.rs` — PDF export through WebKitGTK (Linux); other platforms use the print dialog.
- `src/App.tsx` — state: open directory, selection, diff, annotations. Polls `scan_dir` every 2 s (works on sshfs and container volumes, where file events do not).
- `src/components/Viewer.tsx` — rendering pipeline: markdown → optional diff → Shiki/mermaid → annotation marks.
- `src/lib/diff.ts` — block diff of rendered HTML with word-level diff inside text blocks.
- `src/lib/textRange.ts` — character index over DOM text, wrap and insert helpers.
- `src/lib/prompt.ts` — the prompt for the agent.
- `src/lib/enhance.ts` — Shiki and mermaid on rendered HTML; used by the viewer and the PDF export.
- `src/lib/print.ts` — PDF export: renders the document into `#print-root`, which only print media shows.
- `src/components/RulesEditor.tsx` — the dialog to edit `GALLEY.md`.
- `src/components/SearchPanel.tsx` — search in all documents (`search` command in `galley.rs`).
- `src/components/TableOfContents.tsx` — the headings of the shown document below the document tree (`src/lib/toc.ts`).

## Conventions

- All `invoke()` calls go through `src/lib/tauri.ts`.
- One markdown-it instance in `src/lib/markdown.ts`. Sanitize all HTML with DOMPurify.
- Relative image paths resolve against the document and load through the `galley` URI scheme (`src-tauri/src/protocol.rs`). It serves only files inside the open galley root. The CSP in `index.html` allows images only from the app, this scheme and `data:`.
- Markdown styles live in `src/styles/markdown.css`, including the diff and annotation styles.
- The app chrome is always dark. The document renders on a `.paper` element with a selectable color (`src/lib/theme.tsx`). `.paper-light` and `.paper-dark` set the color variables for content on the paper; Shiki and mermaid use the tone of the paper.
- `scripts/install.sh` builds the release and installs the launcher, the desktop entry and the icons below `$PREFIX`.

## Testing

- `pnpm test` and `pnpm typecheck` for the frontend; `cargo test` in `src-tauri/`.
- Before reporting a task done, run `pnpm tauri dev` on a galley directory with images and look at the result.
