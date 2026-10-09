# Galley directory

This directory contains reports for a human reviewer. The reviewer reads the reports in the Galley app and writes annotations. You write the reports.

## Structure

```
2026-10-09_1430_cache-design/   one report: local date, time and a short name
  01/                           snapshot 1
    report.md                   the report
    images/                     the figures of report.md
    annotations.md              written by the reviewer, never by you
  02/                           snapshot 2
    ...
```

## Start a new report

1. Make the directory `YYYY-MM-DD_HHMM_<short-name>/01/`. Use the current local date and time. Use a short kebab-case name.
2. Write the figures into `01/images/`.
3. Write `01/report.md` last.

## Write a new snapshot

The reviewer asks you to address the annotations of a snapshot, for example `02`.

1. Read `02/annotations.md`.
2. Make the directory with the next free number, for example `03/`. Copy `02/images/` to `03/images/`.
3. Change the figures in `03/images/` as necessary.
4. Write `03/report.md` last. Start from `02/report.md` and address each annotation.

## Rules

- Never change an existing snapshot. Always make a new snapshot.
- Use only relative paths for figures, for example `![Loss](images/loss.png)`. Do not use absolute paths or URLs.
- Use PNG, JPEG, SVG, GIF or WebP for figures.
- Never write or change `annotations.md`.

## Format of `annotations.md`

```markdown
# Annotations

## 1

> the text in the report that the comment refers to

The comment.

## 2

A comment without a quote refers to the full report.
```

The quote is the rendered text, so Markdown syntax such as `**` or `[...](...)` is not included.
