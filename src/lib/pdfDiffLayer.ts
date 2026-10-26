// Shows a PDF diff on the pages: green boxes on the inserted words, and red
// markers where text was removed. In the side-by-side view, the old pages
// show red boxes on the removed words. The marks lie in a layer on top of
// each page, so the text layer does not change.
import { PAGE_END, type PdfDiff, type Token } from "@/lib/pdfDiff";

// The pages of the shown document, and the pages of the reference document
// in the side-by-side view.
export const NEW_PAGE = ".pdf-page";
export const OLD_PAGE = ".pdf-old-page";
const PAGE = `${NEW_PAGE}, ${OLD_PAGE}`;
const LAYER_CLASS = "pdf-diff-layer";

// The text of the text layers below `root`, as a stream for `tokenize`, with
// the text node and the offset of each character. A line end is a line feed
// and a page end is a form feed, both without a node.
export interface DomStream {
  text: string;
  nodes: (Text | null)[];
  offsets: number[];
}

export function layerStream(root: HTMLElement, page = NEW_PAGE): DomStream {
  const out: DomStream = { text: "", nodes: [], offsets: [] };
  const parts: string[] = [];
  const push = (c: string, node: Text | null, offset: number) => {
    parts.push(c);
    out.nodes.push(node);
    out.offsets.push(offset);
  };
  const visit = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n as Text;
      for (let i = 0; i < t.data.length; i++) push(t.data[i], t, i);
    } else if (n.nodeName === "BR") {
      push("\n", null, 0);
    } else {
      for (let c = n.firstChild; c; c = c.nextSibling) visit(c);
    }
  };
  for (const layer of Array.from(root.querySelectorAll<HTMLElement>(`${page} .textLayer`))) {
    visit(layer);
    push(PAGE_END, null, 0);
  }
  out.text = parts.join("");
  return out;
}

// Removes the diff layers below `root`.
export function clearDiff(root: HTMLElement): void {
  root.querySelectorAll(`.${LAYER_CLASS}`).forEach((el) => el.remove());
}

// The diff layer of the page that contains `node`, made if necessary.
function layerOf(node: Node): HTMLElement | null {
  const page = node.parentElement?.closest<HTMLElement>(PAGE);
  if (!page) return null;
  let layer = page.querySelector<HTMLElement>(`:scope > .${LAYER_CLASS}`);
  if (!layer) {
    layer = document.createElement("div");
    layer.className = LAYER_CLASS;
    page.append(layer);
  }
  return layer;
}

// Positions `el` in its page at the viewport rectangle `r`, in percent of the
// page size, so that the mark keeps its place when the page scales.
function place(el: HTMLElement, layer: HTMLElement, r: DOMRect) {
  const p = layer.getBoundingClientRect();
  Object.assign(el.style, {
    left: `${((r.left - p.left) / p.width) * 100}%`,
    top: `${((r.top - p.top) / p.height) * 100}%`,
    width: `${(r.width / p.width) * 100}%`,
    height: `${(r.height / p.height) * 100}%`,
  });
}

// The viewport rectangles of the characters [start, end) of the stream,
// grouped by text node.
function rects(dom: DomStream, start: number, end: number): { node: Text; rects: DOMRect[] }[] {
  const out: { node: Text; rects: DOMRect[] }[] = [];
  const range = document.createRange();
  let i = start;
  while (i < end) {
    const node = dom.nodes[i];
    if (!node) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < end && dom.nodes[j + 1] === node) j++;
    range.setStart(node, dom.offsets[i]);
    range.setEnd(node, dom.offsets[j] + 1);
    out.push({ node, rects: Array.from(range.getClientRects()).filter((r) => r.width > 0.5 && r.height > 0.5) });
    i = j + 1;
  }
  return out;
}

// Draws boxes of class `className` on the characters [start, end) of `dom`.
function drawBoxes(dom: DomStream, start: number, end: number, className: string): void {
  for (const { node, rects: rs } of rects(dom, start, end)) {
    const layer = layerOf(node);
    if (!layer) continue;
    for (const r of rs) {
      const el = document.createElement("div");
      el.className = className;
      place(el, layer, r);
      layer.append(el);
    }
  }
}

// Draws red boxes on the removed words of the old pages. `tokens` are the
// tokens of the stream `dom` of the old pages.
export function drawRemoved(dom: DomStream, tokens: Token[], diff: PdfDiff): void {
  for (const { old: [first, last] } of diff.removed) {
    if (!tokens[first] || !tokens[last]) continue;
    drawBoxes(dom, tokens[first].start, tokens[last].end, "pdf-diff-del-box");
  }
}

// Draws the diff into the pages below `root`. `tokens` are the tokens of the
// stream `dom`.
export function drawDiff(root: HTMLElement, dom: DomStream, tokens: Token[], diff: PdfDiff): void {
  clearDiff(root);
  for (const [first, last] of diff.added) {
    // The text from the first to the last word, also the spaces between them.
    drawBoxes(dom, tokens[first].start, tokens[last].end, "pdf-diff-ins");
  }
  for (const { at, text } of diff.removed) {
    // The marker stands before the next word, or after the last word.
    const after = at >= tokens.length;
    const t = after ? tokens[tokens.length - 1] : tokens[at];
    if (!t) continue;
    const pos = after ? t.end - 1 : t.start;
    const hit = rects(dom, pos, pos + 1)[0];
    const r = hit?.rects[0];
    if (!hit || !r) continue;
    const layer = layerOf(hit.node);
    if (!layer) continue;
    const el = document.createElement("div");
    el.className = "pdf-diff-del";
    el.dataset.text = text.length > 400 ? `${text.slice(0, 399)}…` : text;
    place(el, layer, new DOMRect(after ? r.right : r.left, r.top, 0, r.height));
    layer.append(el);
  }
}
