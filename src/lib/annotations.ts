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
// An annotation without a quote refers to the full report. The context line
// is optional: it locates a quote that occurs more than once in the report.
// A comment line that starts with ">" or "Context:", or looks like a "## N"
// heading, gets a Markdown escape ("\\"), so that it reads back as comment
// text.

export interface Annotation {
  quote: string;
  // The text around the quote, if the quote is not unique in the report.
  context?: string;
  comment: string;
}

const HEADING = /^##\s+\d+\s*$/;
// A comment line that needs one more backslash, with any backslashes it has.
const ESCAPED = /^\\*(>|Context:|##\s+\d+\s*$)/;
const CONTEXT = /^Context:\s*/;

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
    const quote: string[] = [];
    while (i < lines.length && lines[i].startsWith(">")) {
      quote.push(lines[i].replace(/^> ?/, ""));
      i++;
    }
    let context: string | undefined;
    if (quote.length > 0) {
      let j = i;
      while (j < lines.length && !lines[j].trim()) j++;
      if (j < lines.length && CONTEXT.test(lines[j])) {
        context = lines[j].replace(CONTEXT, "").trim();
        i = j + 1;
      }
    }
    const a: Annotation = { quote: quote.join("\n").trim(), comment: lines.slice(i).map(unescapeLine).join("\n").trim() };
    if (context) a.context = context;
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
    if (a.quote.trim()) {
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
    parts.push(a.comment.trim().split("\n").map(escapeLine).join("\n"));
    return parts.join("\n\n");
  });
  return `# Annotations\n\n${sections.join("\n\n")}\n`;
}
