# Galley directory

This directory contains documents for a human reviewer. The reviewer reads the documents in the Galley app and writes annotations. You write the documents.

## Structure

```
2026-10-09_1430_cache-design/   one document: local date, time and a short name
  01/                           snapshot 1
    document.md                 the text of the document (or document.pdf)
    images/                     the figures of document.md
    annotations.md              written by the reviewer, never by you
    annotations/                screenshots for annotations.md, never by you
  02/                           snapshot 2
    ...
```

## PDF documents

A snapshot can contain `document.pdf` instead of `document.md`, for example a paper that you make with LaTeX or Typst. A snapshot contains only one of the two files. Write `document.pdf` last, as the last step of the snapshot. Keep the source files of the PDF outside the snapshot directory or in a subdirectory of it. The reviewer cannot answer questions with checkboxes or text fields in a PDF document.

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
- If there are options, give them as a task list directly after the question. The reviewer clicks the checkboxes in the Galley app. Write each option on one line and make the options different from each other. Tell in the question if the reviewer can select one option or more than one option.

  ```markdown
  Which cache do you prefer? Select one option.

  - [ ] Redis
  - [ ] Memcached
  - [ ] An LRU cache in the process
  ```

- If you need a short text from the reviewer, for example a value or a name, put an `answer` block directly after the question. The Galley app shows it as a text field. The content of the block is an optional hint that shows in the empty text field. Give each such question its own text.

  ````markdown
  How much memory can the cache use on one node?

  ```answer
  A size in MB
  ```
  ````

- The reviewer answers in `annotations.md`. An annotation of a question has the question as its quote. A checkbox answer has a `Checked:` line with the option and its question as the context. A text field answer has an `Answer:` line with the question.
- In the next snapshot, use the answers and remove the answered questions.

## Keep the chat short

The reviewer reads the documents, not the chat. Put all content into the document.

- After a snapshot, reply in the chat with one to three short sentences: the path of the new snapshot and, if necessary, a short note, for example a problem that blocks you.
- Do not repeat the content of the document in the chat. Do not list the annotations or how you addressed them.
- Ask questions in the document, not in the chat. Ask in the chat only if you cannot write the snapshot without an answer.

## Rules

- Never change an existing snapshot. Always make a new snapshot.
- Use only relative paths for figures, for example `![Training loss over the epochs](images/loss.png)`. Do not use absolute paths or URLs.
- Give each figure a caption. Put the figure in its own paragraph, with an empty line before and after it. The alt text is the caption: write it as a short sentence that tells what the figure shows.
- Use PNG, JPEG, SVG, GIF or WebP for figures.
- Never write or change `annotations.md` or the `annotations/` directory. Do not copy `annotations/` into a new snapshot.

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

Image: images/loss.png

The comment refers to the full image. The path is the image path as it is written in `document.md`.

## 4

Checked: [x] Redis

Context: Which cache do you prefer? Select one option.

The reviewer selected the option "Redis" of the question in the context line. The comment is optional. "[ ]" means that the reviewer cleared a checkbox that is checked in `document.md`.

## 5

Answer: How much memory can the cache use on one node?

512 MB

The reviewer wrote "512 MB" into the text field after the question in the answer line.

## 6

> the loss decreases

Page: 3

The quote is on page 3 of `document.pdf`. A quote has a page line only in a PDF document.

## 7

Region: annotations/region-1761478512345.png

Page: 2

Context: Figure 2: Gantt chart of the work packages

The comment refers to a region of the document, for example a figure or a table. The region line has the path of a screenshot of the region, relative to the snapshot directory. Look at the screenshot to see what the reviewer means. The page line exists only for a PDF document. The context line holds the text inside the region, if there is text.

## 8

A comment without a quote, an image or a region refers to the full document.
```

The quote and the context are the rendered text, so Markdown syntax such as `**` or `[...](...)` is not included. An ellipsis ("…") marks cut text in the context. In a PDF document, the quote is the text of the PDF. Its line breaks and hyphens can be different from the source of the PDF.
