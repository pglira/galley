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
// A quote in a PDF document has a page line after the quote, with the number
// of the page (starting at 1) where the quote starts:
//
//   Page: 3
//
// An annotation of a rectangular region of the document has a region line
// instead of the quote, with the path of a screenshot of the region. The
// path is relative to the snapshot directory. A page line and a context line
// can follow: the page of a PDF document, and the text inside the region:
//
//   Region: annotations/region-1761478512345.png
//
//   Page: 4
//
//   Context: the text inside the region
//
// An annotation
// without a quote, an image or a region refers to the full document. The context line
// is optional: it locates a quote that occurs more than once in the document.
// A comment line that starts with ">", "Context:", "Page:", "Region:", "Image:", "Checked:" or "Answer:", or looks like a "## N"
// heading, gets a Markdown escape ("\\"), so that it reads back as comment
// text.

export interface Annotation {
  quote: string;
  // The text around the quote, if the quote is not unique in the document.
  context?: string;
  // The page of the quote in a PDF document, starting at 1.
  page?: number;
  // The path of the annotated image, as it is written in the document.
  image?: string;
  // The path of the screenshot of an annotated region, relative to the
  // snapshot directory. The context is the text inside the region.
  region?: string;
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
const ESCAPED = /^\\*(>|Context:|Page:|Region:|Image:|Checked:|Answer:|##\s+\d+\s*$)/;
const CONTEXT = /^Context:\s*/;
const PAGE = /^Page:\s*(\d+)\s*$/;
const REGION = /^Region:\s*/;
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
    let region: string | undefined;
    if (REGION.test(first)) {
      region = first.replace(REGION, "").trim();
      i++;
    } else if (IMAGE.test(first)) {
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
    let page: number | undefined;
    // The page line and the context line follow the quote, in any order.
    while ((quote.length > 0 && !answer) || region) {
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      const p = j < lines.length ? PAGE.exec(lines[j]) : null;
      if (p && page === undefined && checked === undefined) {
        page = Number(p[1]);
      } else if (j < lines.length && CONTEXT.test(lines[j]) && context === undefined) {
        context = lines[j].replace(CONTEXT, "").trim();
      } else {
        break;
      }
      i = j + 1;
    }
    const a: Annotation = { quote: quote.join("\n").trim(), comment: lines.slice(i).map(unescapeLine).join("\n").trim() };
    if (context) a.context = context;
    if (page) a.page = page;
    if (image) a.image = image;
    if (region) a.region = region;
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
    if (a.region) {
      parts.push(`Region: ${a.region}`);
      if (a.page) parts.push(`Page: ${a.page}`);
      const context = a.context?.replace(/\s+/g, " ").trim();
      if (context) parts.push(`Context: ${context}`);
    } else if (a.image) {
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
      if (a.page) parts.push(`Page: ${a.page}`);
      const context = a.context?.replace(/\s+/g, " ").trim();
      if (context) parts.push(`Context: ${context}`);
    }
    const comment = a.comment.trim();
    if (comment) parts.push(comment.split("\n").map(escapeLine).join("\n"));
    return parts.join("\n\n");
  });
  return `# Annotations\n\n${sections.join("\n\n")}\n`;
}
