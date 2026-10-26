// Text selection with the mouse in the text layers of PDF pages. The text
// layer has transparent spans at absolute positions. A drag that starts or
// ends between the spans lets the browser select from the start or to the
// end of the page. Thus a drag sets the selection itself: each end of the
// selection is the text position nearest to the mouse.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Returns the index of the box nearest to the point (x, y), or -1 for no
// boxes. A box on the same line (vertical distance 0) is always nearer than a
// box on another line.
export function nearestBox(boxes: Box[], x: number, y: number): number {
  let best = -1;
  let bestDy = Infinity;
  let bestDx = Infinity;
  boxes.forEach((b, i) => {
    if (b.right <= b.left || b.bottom <= b.top) return;
    const dy = y < b.top ? b.top - y : y > b.bottom ? y - b.bottom : 0;
    const dx = x < b.left ? b.left - x : x > b.right ? x - b.right : 0;
    if (dy < bestDy || (dy === bestDy && dx < bestDx)) {
      best = i;
      bestDy = dy;
      bestDx = dx;
    }
  });
  return best;
}

interface Point {
  node: Node;
  offset: number;
}

const PAGE = ".pdf-page";
const LAYER = ".textLayer";
// The edge zone of the scroller, in pixels, where a drag scrolls.
const EDGE = 30;

function textNodes(el: Element): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

// The text layer of the page under the point, or of the page nearest to it.
function layerAt(root: HTMLElement, y: number): HTMLElement | null {
  const pages = Array.from(root.querySelectorAll<HTMLElement>(PAGE));
  const boxes = pages.map((p) => {
    const r = p.getBoundingClientRect();
    return { left: 0, right: 1, top: r.top, bottom: r.bottom };
  });
  const i = nearestBox(boxes, 0, y);
  return i < 0 ? null : pages[i].querySelector<HTMLElement>(LAYER);
}

// The text position nearest to the point (x, y): inside the span under the
// point, else at the near end of the nearest span of the nearest page.
function pointAt(root: HTMLElement, x: number, y: number): Point | null {
  const layer = layerAt(root, y);
  if (!layer) return null;
  const spans = Array.from(layer.querySelectorAll<HTMLElement>(":scope > span, :scope .markedContent > span")).filter(
    (s) => s.textContent
  );
  const rects = spans.map((s) => s.getBoundingClientRect());
  const i = nearestBox(rects, x, y);
  if (i < 0) return null;
  const span = spans[i];
  const r = rects[i];
  const nodes = textNodes(span);
  if (nodes.length === 0) return null;
  if (x <= r.left) return { node: nodes[0], offset: 0 };
  if (x >= r.right) return { node: nodes[nodes.length - 1], offset: nodes[nodes.length - 1].length };
  const caret = document.caretRangeFromPoint?.(x, Math.min(Math.max(y, r.top + 1), r.bottom - 1));
  if (caret && span.contains(caret.startContainer)) return { node: caret.startContainer, offset: caret.startOffset };
  return { node: nodes[0], offset: x - r.left < r.right - x ? 0 : nodes[0].length };
}

// Handles drags in the text layers below `root`, which scrolls in
// `scroller`. A drag near the top or the bottom edge of the scroller scrolls
// it. Returns a function that removes the listeners.
export function trackSelection(root: HTMLElement, scroller: HTMLElement): () => void {
  let anchor: Point | null = null;
  let last = { x: 0, y: 0 };
  let frame = 0;

  const extend = () => {
    if (!anchor) return;
    const focus = pointAt(root, last.x, last.y);
    if (!focus) return;
    window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  };
  const autoScroll = () => {
    frame = 0;
    if (!anchor) return;
    const r = scroller.getBoundingClientRect();
    const step = last.y < r.top + EDGE ? -(r.top + EDGE - last.y) : last.y > r.bottom - EDGE ? last.y - (r.bottom - EDGE) : 0;
    if (step === 0) return;
    scroller.scrollTop += Math.max(-40, Math.min(40, step / 2));
    extend();
    frame = requestAnimationFrame(autoScroll);
  };
  const onMouseDown = (e: MouseEvent) => {
    // A double or triple click selects a word or a line, as usual.
    if (e.button !== 0 || e.detail > 1 || e.shiftKey) return;
    const target = e.target as Element;
    if (!target.closest?.(PAGE) || target.closest("a, button")) return;
    const point = pointAt(root, e.clientX, e.clientY);
    if (!point) return;
    e.preventDefault();
    anchor = point;
    last = { x: e.clientX, y: e.clientY };
    window.getSelection()?.collapse(point.node, point.offset);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
  const onMouseMove = (e: MouseEvent) => {
    last = { x: e.clientX, y: e.clientY };
    extend();
    if (!frame) frame = requestAnimationFrame(autoScroll);
  };
  const onMouseUp = () => {
    anchor = null;
    cancelAnimationFrame(frame);
    frame = 0;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  };

  root.addEventListener("mousedown", onMouseDown);
  return () => {
    onMouseUp();
    root.removeEventListener("mousedown", onMouseDown);
  };
}
