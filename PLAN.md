# Plan: Galley

A desktop app to review Markdown reports from AI agents. Fork of [Marky](https://github.com/GRVYDEV/marky) (Tauri v2, Rust, React).

## Workflow

1. You give the agent a task and point it to a galley directory.
2. The agent reads `GALLEY.md` in that directory and starts a new report.
3. You open the galley directory in Galley on the host.
4. You select a report and a snapshot, and annotate the text.
5. You click **Copy prompt** and paste the prompt into the agent's terminal.
6. The agent writes the next snapshot. You enable the diff to see only the changes.

## Galley directory

```
galley/
  GALLEY.md                        # rules for the agent
  2026-10-09_1430_cache-design/    # one report, the name starts with date and time
    01/                            # one snapshot
      report.md                    # agent
      images/                      # agent
      annotations.md               # Galley
    02/
      ...
```

- The agent writes `report.md` and `images/`. Galley writes only `annotations.md` and `GALLEY.md`.
- Each snapshot is a complete copy with its own images. Thus old snapshots always show the correct images.
- All paths are relative. This works on the host, in a DevContainer and on an SSH server.

## Rules for the agent (`GALLEY.md`)

- For a new task, make a new report directory `YYYY-MM-DD_HHMM_<short-name>/01/`.
- For a new snapshot, copy the last snapshot directory to the next number. Then edit it. Do not copy `annotations.md`.
- Use relative image paths only, for example `images/plot.png`.
- Never write `annotations.md`.

## UI

- **Left:** a tree with all reports in chronological order. Each report contains its snapshots.
- **Center:** the rendered snapshot.
- **Annotate:** select text and add a comment. Galley saves it in `annotations.md` of the snapshot.
- **Diff:** a checkbox to enable the diff, and a dropdown to select the reference snapshot.
- **Copy prompt:** copies a prompt with relative paths only, for example:
  `Read 2026-10-09_1430_cache-design/02/annotations.md in the galley directory and write snapshot 03.`
- **Delete old snapshots:** keeps only the last snapshot of a report.

## Steps

1. Fork Marky. Make sure that it shows local images.
2. Tree view and snapshot view.
3. Annotations and **Copy prompt**.
4. Diff.
5. Delete old snapshots.
