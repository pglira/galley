// The annotations of a snapshot, stored as Markdown in `annotations.md`:
//
//   # Annotations
//
//   ## 1
//
//   > quoted text
//
//   Context: the sentence with the quoted text
//
//   The comment.
//
// An annotation of an image has an image line instead of the quote:
//
//   Image: images/loss.png
//
// The path is the image path as it is written in the document. An annotation
// of a checkbox in a task list has a checked line instead of the quote, with
// the state that the reviewer set and the text of the option:
//
//   Checked: [x] the option
//
//   Context: the question, which is the text before the list
//
// The comment of a checkbox annotation can be empty. The answer in a text
// field has an answer line with the question instead of the quote, and the
// answer as the comment:
//
//   Answer: the question, which is the text before the text field
//
// An annotation
// without a quote and without an image refers to the full document. The context line
// is optional: it locates a quote that occurs more than once in the document.
// A comment line that starts with ">", "Context:", "Image:", "Checked:" or "Answer:", or looks like a "## N"
// heading, gets a Markdown escape ("\\"), so that it reads back as comment
// text.

export interface Annotation {
  quote: string;
  // The text around the quote, if the quote is not unique in the document.
  context?: string;
  // The path of the annotated image, as it is written in the document.
  image?: string;
  // The state that the reviewer set for the checkbox of the option in `quote`.
  // The context is the question of the option.
  checked?: boolean;
  // True for the answer in a text field. The quote is the question and the
  // comment is the answer.
  answer?: boolean;
  comment: string;
}

const HEADING = /^##\s+\d+\s*$/;
// A comment line that needs one more backslash, with any backslashes it has.
const ESCAPED = /^\\*(>|Context:|Image:|Checked:|Answer:|##\s+\d+\s*$)/;
const CONTEXT = /^Context:\s*/;
const IMAGE = /^Image:\s*/;
const ANSWER = /^Answer:\s*/;
const CHECKED = /^Checked:\s*\[([ xX])\]\s*(.*)$/;

function escapeLine(line: string): string {
  return ESCAPED.test(line) ? `\\${line}` : line;
}

function unescapeLine(line: string): string {
  return line.startsWith("\\") && ESCAPED.test(line) ? line.slice(1) : line;
}

export function parseAnnotations(text: string): Annotation[] {
  const out: Annotation[] = [];
  let lines: string[] | null = null;
  const flush = () => {
    if (!lines) return;
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    const first = lines[i] ?? "";
    let image: string | undefined;
    let answer = false;
    let checked: boolean | undefined;
    const quote: string[] = [];
    const m = CHECKED.exec(first);
    if (IMAGE.test(first)) {
      image = first.replace(IMAGE, "").trim();
      i++;
    } else if (ANSWER.test(first)) {
      answer = true;
      quote.push(first.replace(ANSWER, ""));
      i++;
    } else if (m) {
      checked = m[1] !== " ";
      quote.push(m[2]);
      i++;
    } else {
      while (i < lines.length && lines[i].startsWith(">")) {
        quote.push(lines[i].replace(/^> ?/, ""));
        i++;
      }
    }
    let context: string | undefined;
    if (quote.length > 0 && !answer) {
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && CONTEXT.test(lines[j])) {
        context = lines[j].replace(CONTEXT, "").trim();
        i = j + 1;
      }
    }
    const a: Annotation = { quote: quote.join("\n").trim(), comment: lines.slice(i).map(unescapeLine).join("\n").trim() };
    if (context) a.context = context;
    if (image) a.image = image;
    if (checked !== undefined) a.checked = checked;
    if (answer) a.answer = true;
    out.push(a);
  };
  for (const line of text.split(/\r?\n/)) {
    if (HEADING.test(line)) {
      flush();
      lines = [];
    } else if (lines) {
      lines.push(line);
    }
  }
  flush();
  return out;
}

export function serializeAnnotations(list: Annotation[]): string {
  if (list.length === 0) return "";
  const sections = list.map((a, i) => {
    const parts = [`## ${i + 1}`];
    if (a.image) {
      parts.push(`Image: ${a.image}`);
    } else if (a.answer) {
      parts.push(`Answer: ${a.quote.replace(/\s+/g, " ").trim()}`);
    } else if (a.checked !== undefined) {
      parts.push(`Checked: [${a.checked ? "x" : " "}] ${a.quote.replace(/\s+/g, " ").trim()}`);
      const context = a.context?.replace(/\s+/g, " ").trim();
      if (context) parts.push(`Context: ${context}`);
    } else if (a.quote.trim()) {
      parts.push(
        a.quote
          .trim()
          .split("\n")
          .map((l) => (l.trim() ? `> ${l.trim()}` : ">"))
          .join("\n")
      );
      const context = a.context?.replace(/\s+/g, " ").trim();
      if (context) parts.push(`Context: ${context}`);
    }
    const comment = a.comment.trim();
    if (comment) parts.push(comment.split("\n").map(escapeLine).join("\n"));
    return parts.join("\n\n");
  });
  return `# Annotations\n\n${sections.join("\n\n")}\n`;
}
