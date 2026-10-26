// Regions of the shown document: Ctrl and a drag draw a rectangle, and the
// annotation gets a screenshot of it and the text inside it.

// A drawn rectangle needs at least this width and height, in pixels.
const MIN_SIZE = 6;
// The text inside a region is cut after this number of characters.
const MAX_TEXT = 100;

// Lets Ctrl (or Cmd) and a drag in `root` draw a rectangle. The rectangle
// stays inside `bounds`, the visible area of the document. `onRegion`
// receives the rectangle in viewport coordinates. Returns a function that
// removes the listeners.
export function trackRegion(root: HTMLElement, bounds: () => DOMRect, onRegion: (rect: DOMRect) => void): () => void {
  let stop: (() => void) | null = null;
  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    e.stopPropagation();
    window.getSelection()?.removeAllRanges();
    const box = bounds();
    const clampX = (x: number) => Math.min(Math.max(x, box.left), box.right);
    const clampY = (y: number) => Math.min(Math.max(y, box.top), box.bottom);
    const x0 = clampX(e.clientX);
    const y0 = clampY(e.clientY);
    const frame = document.createElement("div");
    frame.className = "galley-region-frame";
    document.body.append(frame);
    let rect = new DOMRect(x0, y0, 0, 0);
    const onMove = (m: MouseEvent) => {
      const x1 = clampX(m.clientX);
      const y1 = clampY(m.clientY);
      rect = new DOMRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      Object.assign(frame.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    };
    const end = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      frame.remove();
      stop = null;
    };
    const onUp = () => {
      end();
      // The click after the drag does not open an image or a link.
      const swallow = (c: MouseEvent) => {
        c.preventDefault();
        c.stopPropagation();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) onRegion(rect);
    };
    stop = end;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  root.addEventListener("mousedown", onMouseDown, true);
  return () => {
    stop?.();
    root.removeEventListener("mousedown", onMouseDown, true);
  };
}

// The words below `root` whose centers are inside `rect` (viewport
// coordinates), in document order, cut after a number of characters. Leaves
// out the text inside elements that match `skip`.
export function textInRect(root: Element, rect: DOMRect, skip?: string): string {
  const inside = (r: DOMRect) => {
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    return cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
  };
  const meets = (r: DOMRect) => r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom;
  const words: string[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (skip && n.parentElement?.closest(skip)) continue;
    range.selectNodeContents(n);
    if (!meets(range.getBoundingClientRect())) continue;
    for (const m of n.data.matchAll(/\S+/g)) {
      range.setStart(n, m.index!);
      range.setEnd(n, m.index! + m[0].length);
      if (inside(range.getBoundingClientRect())) words.push(m[0]);
    }
  }
  const text = words.join(" ");
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).replace(/\s\S*$/, "")}…` : text;
}

// The file name of a new screenshot of a region.
export function regionImageName(now = Date.now()): string {
  return `region-${now}.png`;
}

// Waits until the browser shows the current state of the page.
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
