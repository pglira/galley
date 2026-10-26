// Word diff of two PDF documents. The text of a document is a stream of
// characters: the text items of PDF.js in reading order, a line feed at the
// end of each line and a form feed at the end of each page. A word that ends
// with a hyphen at the end of a line continues on the next line, and the
// comparison ignores hyphens, so that a new line break inside a word is no
// change.
//
// Running headers and footers (lines at the top or the bottom of most pages,
// for example "Page 3 of 4") are compared page by page, apart from the body
// text. Thus body text that moves to another page does not show the headers
// and footers between the pages as changes.
import { diffArrays } from "diff";

export interface Token {
  // The word without hyphens, for the comparison.
  key: string;
  // The range [start, end) of the word in the stream.
  start: number;
  end: number;
}

export interface PdfDiff {
  // Ranges [first, last] of new tokens that are not in the old document.
  added: [number, number][];
  // Old text that is not in the new document, the range [first, last] of its
  // old tokens, and the index of the new token before which it was. An index
  // equal to the number of new tokens means the end of the document.
  removed: { at: number; text: string; old: [number, number] }[];
}

// The text items of a page as PDF.js returns them.
export interface TextItem {
  str?: string;
  hasEOL?: boolean;
}

export const PAGE_END = "\f";
const HYPHEN = /[-\u00ad]/;
const HYPHENS = /[-\u00ad]/g;
const PUNCTUATION = /[.,;:!?()[\]{}"'„“”‚‘’«»]/;
// The number of lines at the top and at the bottom of a page that can be a
// running header or footer.
const RUNNING_LINES = 2;

// The stream of the text items of the pages of a document.
export function itemStream(pages: TextItem[][]): string {
  return pages
    .map((items) => items.map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : "")).join("") + PAGE_END)
    .join("");
}

// Splits a stream into words and punctuation. White space ends a word, but a
// line feed after a hyphen does not.
export function tokenize(stream: string): Token[] {
  const tokens: Token[] = [];
  let start = -1;
  const push = (from: number, to: number) => {
    const text = stream.slice(from, to).replace(/\n/g, "");
    tokens.push({ key: text.replace(HYPHENS, "") || text, start: from, end: to });
  };
  // Punctuation at the start and at the end of a word is a token of its own.
  const flush = (end: number) => {
    if (start < 0) return;
    let from = start;
    let to = end;
    while (from < to && PUNCTUATION.test(stream[from])) push(from, ++from);
    const tail: number[] = [];
    while (to > from && PUNCTUATION.test(stream[to - 1])) tail.unshift(--to);
    if (from < to) push(from, to);
    for (const t of tail) push(t, t + 1);
    start = -1;
  };
  for (let i = 0; i < stream.length; i++) {
    const c = stream[i];
    const joins =
      c === "\n" && start >= 0 && i - start > 1 && HYPHEN.test(stream[i - 1]) && i + 1 < stream.length && /\S/.test(stream[i + 1]);
    if (joins) continue;
    if (/\s/.test(c)) flush(i);
    else if (start < 0) start = i;
  }
  flush(stream.length);
  return tokens;
}

// The text of a word as the document shows it, without the line feed.
export function tokenText(stream: string, t: Token): string {
  return stream.slice(t.start, t.end).replace(/\n/g, "");
}

interface Line {
  start: number;
  end: number;
  page: number;
  // The text with each number as "#", so that page numbers do not matter.
  norm: string;
}

// The candidate lines for running headers and footers: the first and the last
// non-empty lines of each page.
function edgeLines(stream: string): Line[] {
  const out: Line[] = [];
  let pageStart = 0;
  stream.split(PAGE_END).forEach((pageText, page) => {
    const lines: Line[] = [];
    let at = pageStart;
    for (const text of pageText.split("\n")) {
      const norm = text.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
      if (norm) lines.push({ start: at, end: at + text.length, page, norm });
      at += text.length + 1;
    }
    const edge = lines.length <= 2 * RUNNING_LINES ? lines : [...lines.slice(0, RUNNING_LINES), ...lines.slice(-RUNNING_LINES)];
    out.push(...edge);
    pageStart += pageText.length + 1;
  });
  return out;
}

// The texts of the lines that are at the top or the bottom of at least half
// of the pages (and of at least two pages) of a document.
function runningNorms(lines: Line[], pageCount: number): Set<string> {
  const pages = new Map<string, Set<number>>();
  for (const l of lines) {
    if (!pages.has(l.norm)) pages.set(l.norm, new Set());
    pages.get(l.norm)!.add(l.page);
  }
  const out = new Set<string>();
  for (const [norm, p] of pages) if (p.size >= 2 && p.size >= pageCount / 2) out.add(norm);
  return out;
}

// For each token: the page of its running header or footer, or -1 for a
// token of the body text.
function runningPages(stream: string, tokens: Token[], running: Set<string>): number[] {
  const lines = edgeLines(stream).filter((l) => running.has(l.norm));
  return tokens.map((t) => lines.find((l) => t.start >= l.start && t.start < l.end)?.page ?? -1);
}

function pageCount(stream: string): number {
  return stream.split(PAGE_END).length - 1 || 1;
}

// Compares the keys of two token lists. `oldIndices` holds the token index in
// the full old document of each token of `oldTokens`. `newIndex` maps an index of `newTokens`
// to the token index in the full new document; the length of `newTokens` maps
// to the index after the last token. Returns false on timeout.
function diffTokens(
  oldStream: string,
  oldTokens: Token[],
  oldIndices: number[],
  newTokens: Token[],
  newIndex: (i: number) => number,
  result: PdfDiff,
  timeout: number
): boolean {
  const changes = diffArrays(
    oldTokens.map((t) => t.key),
    newTokens.map((t) => t.key),
    { timeout }
  );
  if (!changes) return false;
  let o = 0;
  let n = 0;
  for (let k = 0; k < changes.length; k++) {
    const c = changes[k];
    const count = c.count ?? c.value.length;
    // A removed part and an added part with the same text, joined, are the
    // same words with another split, for example "opi nemur" and "opinemur"
    // when one PDF has no hyphen at the line end.
    const next = changes[k + 1];
    if (next && ((c.removed && next.added) || (c.added && next.removed)) && c.value.join("") === next.value.join("")) {
      const nextCount = next.count ?? next.value.length;
      o += c.removed ? count : nextCount;
      n += c.added ? count : nextCount;
      k++;
      continue;
    }
    if (c.added) {
      for (let i = n; i < n + count; i++) {
        const g = newIndex(i);
        const last = result.added[result.added.length - 1];
        if (last && last[1] === g - 1) last[1] = g;
        else result.added.push([g, g]);
      }
      n += count;
    } else if (c.removed) {
      const first = oldTokens[o];
      const last = oldTokens[o + count - 1];
      const text = oldStream
        .slice(first.start, last.end)
        .replace(/([-\u00ad])\n(?=\S)/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
      result.removed.push({ at: newIndex(n), text, old: [oldIndices[o], oldIndices[o + count - 1]] });
      o += count;
    } else {
      o += count;
      n += count;
    }
  }
  return true;
}

// Compares the words of two streams. Returns null if the comparison takes
// longer than `timeout` milliseconds.
export function diffStreams(oldStream: string, newStream: string, timeout = 3000): PdfDiff | null {
  const oldTokens = tokenize(oldStream);
  const newTokens = tokenize(newStream);
  const running = new Set([
    ...runningNorms(edgeLines(oldStream), pageCount(oldStream)),
    ...runningNorms(edgeLines(newStream), pageCount(newStream)),
  ]);
  const oldPages = runningPages(oldStream, oldTokens, running);
  const newPages = runningPages(newStream, newTokens, running);
  const result: PdfDiff = { added: [], removed: [] };

  // The index in the full new document of each token of a part, and of the
  // place after the last token of the part.
  const mapper = (indices: number[]) => (i: number) =>
    i < indices.length ? indices[i] : indices.length ? indices[indices.length - 1] + 1 : newTokens.length;

  const bodyOldIdx = oldTokens.flatMap((_, i) => (oldPages[i] < 0 ? [i] : []));
  const bodyNewIdx = newTokens.flatMap((_, i) => (newPages[i] < 0 ? [i] : []));
  const bodyOld = bodyOldIdx.map((i) => oldTokens[i]);
  if (!diffTokens(oldStream, bodyOld, bodyOldIdx, bodyNewIdx.map((i) => newTokens[i]), mapper(bodyNewIdx), result, timeout)) {
    return null;
  }
  // A page that only the new document has compares its headers and footers
  // with the last old page, without the digits (the page numbers differ),
  // and shows only the inserted words. The headers and footers of a page that
  // only the old document has do not show.
  const oldCount = pageCount(oldStream);
  for (let p = 0; p < pageCount(newStream); p++) {
    const extra = p >= oldCount;
    const noDigits = (t: Token) => (extra ? { ...t, key: t.key.replace(/\d+/g, "#") } : t);
    const runOldIdx = oldTokens.flatMap((_, i) => (oldPages[i] === (extra ? oldCount - 1 : p) ? [i] : []));
    const runOld = runOldIdx.map((i) => noDigits(oldTokens[i]));
    const runNewIdx = newTokens.flatMap((_, i) => (newPages[i] === p ? [i] : []));
    if (runOld.length === 0 && runNewIdx.length === 0) continue;
    const part: PdfDiff = { added: [], removed: [] };
    const runNew = runNewIdx.map((i) => noDigits(newTokens[i]));
    if (!diffTokens(oldStream, runOld, runOldIdx, runNew, mapper(runNewIdx), part, timeout)) {
      return null;
    }
    result.added.push(...part.added);
    if (!extra) result.removed.push(...part.removed);
  }
  result.added.sort((a, b) => a[0] - b[0]);
  result.removed.sort((a, b) => a.at - b.at);
  return result;
}
