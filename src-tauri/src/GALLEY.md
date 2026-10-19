# Galley directory

This directory contains documents for a human reviewer. The reviewer reads the documents in the Galley app and writes annotations. You write the documents.

## Structure

```
2026-10-09_1430_cache-design/   one document: local date, time and a short name
  01/                           snapshot 1
    document.md                 the text of the document
    images/                     the figures of document.md
    annotations.md              written by the reviewer, never by you
  02/                           snapshot 2
    ...
```

## Start a new document

1. Make the directory `YYYY-MM-DD_HHMM_<short-name>/01/`. Use the current local date and time. Use a short kebab-case name.
2. Write the figures into `01/images/`.
3. Write `01/document.md` last.

## Write a new snapshot

The reviewer asks you to address the annotations of a snapshot, for example `02`.

1. Read `02/annotations.md`.
2. Make the directory with the next free number, for example `03/`. Copy `02/images/` to `03/images/`.
3. Change the figures in `03/images/` as necessary.
4. Write `03/document.md` last. Start from `02/document.md` and address each annotation.

## Write absolute documents

Each snapshot is a complete document that stands alone. It describes the subject as it is, not how it changed.

- Never describe the changes from one snapshot to another. Do not write "now", "changed to", "added", "removed", "as requested" or "in the previous version".
- Do not refer to annotations or to earlier snapshots in the text.
- The reviewer sees the changes in the diff of the Galley app.

## Ask questions

If you need a decision or information from the reviewer, ask for it in the document. Do not guess.

- Put each question in its own short paragraph or list item, so that the reviewer can annotate it.
- If there are options, give them as a numbered list.
- The reviewer answers in `annotations.md`. The quote of the annotation is the question.
- In the next snapshot, use the answers and remove the answered questions.

## Rules

- Never change an existing snapshot. Always make a new snapshot.
- Use only relative paths for figures, for example `![Loss](images/loss.png)`. Do not use absolute paths or URLs.
- Use PNG, JPEG, SVG, GIF or WebP for figures.
- Never write or change `annotations.md`.

## Format of `annotations.md`

```markdown
# Annotations

## 1

> the text in the document that the comment refers to

The comment.

## 2

> Images

Context: Images: in this port or later? 9 of 48 configs use them.

The quote occurs more than once in the document. The context line shows the text around the quote that the comment refers to.

## 3

A comment without a quote refers to the full document.
```

The quote and the context are the rendered text, so Markdown syntax such as `**` or `[...](...)` is not included. An ellipsis ("…") marks cut text in the context.
