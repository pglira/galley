// The overview gutter of the diff: a strip beside the scroller that shows
// where in the document the changes are. The strip maps the full scroll
// height of the document onto its own height, like the scrollbar.

// The kind of a change: inserted text or removed text.
export type GutterKind = "add" | "del";

// A change of the document, in pixels from the top of the scroll content.
export interface GutterSpan {
  top: number;
  bottom: number;
  kind: GutterKind;
}

// A mark of the gutter, in percent of the height of the gutter.
export interface GutterMark {
  top: number;
  height: number;
  kind: GutterKind;
}

// The elements that hold the changes of a Markdown diff and of a PDF diff.
export const GUTTER_SELECTORS: Record<GutterKind, string> = {
  add: ".diff-added, .diff-changed, .diff-img-changed, .pdf-page .pdf-diff-ins",
  del: ".diff-removed, .pdf-page .pdf-diff-del, .pdf-old-page .pdf-diff-del-box",
};

// Converts the spans of a document with the scroll height `total` into the
// marks of a gutter that is `height` pixels high. Each mark is at least
// `minPx` pixels high. Marks of the same kind that touch or overlap in the
// gutter merge into one mark.
export function gutterMarks(spans: GutterSpan[], total: number, height: number, minPx = 4): GutterMark[] {
  if (total <= 0 || height <= 0) return [];
  const scale = height / total;
  const out: GutterMark[] = [];
  for (const kind of ["add", "del"] as const) {
    const px = spans
      .filter((s) => s.kind === kind)
      .map((s) => {
        const top = Math.max(0, Math.min(height - minPx, s.top * scale));
        const bottom = Math.max(top + minPx, Math.min(height, s.bottom * scale));
        return [top, bottom] as [number, number];
      })
      .sort((a, b) => a[0] - b[0]);
    let cur: [number, number] | null = null;
    for (const p of px) {
      if (cur && p[0] <= cur[1] + 1) cur[1] = Math.max(cur[1], p[1]);
      else {
        if (cur) out.push(toMark(cur, height, kind));
        cur = [p[0], p[1]];
      }
    }
    if (cur) out.push(toMark(cur, height, kind));
  }
  return out.sort((a, b) => a.top - b.top);
}

function toMark([top, bottom]: [number, number], height: number, kind: GutterKind): GutterMark {
  return { top: (top / height) * 100, height: ((bottom - top) / height) * 100, kind };
}

// The changes below `root`, in pixels from the top of the content of
// `scroller`. Elements that do not show have no span.
export function gutterSpans(scroller: HTMLElement, root: HTMLElement): GutterSpan[] {
  const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
  const out: GutterSpan[] = [];
  for (const kind of ["add", "del"] as const) {
    for (const el of Array.from(root.querySelectorAll(GUTTER_SELECTORS[kind]))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out.push({ top: r.top - origin, bottom: r.bottom - origin, kind });
    }
  }
  return out;
}
