import { REMOVED_SELECTOR } from "@/lib/diff";

// A heading of the shown document.
export interface TocEntry {
  // 1 for h1, 6 for h6.
  level: number;
  text: string;
}

// The headings of the newer document, in document order. Headings of the
// removed text of the diff are not part of the snapshot.
export function tocHeadings(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).filter(
    (h) => !h.closest(REMOVED_SELECTOR)
  );
}

// The text of a heading without its permalink and the removed text of the diff.
export function headingText(h: Element): string {
  const clone = h.cloneNode(true) as Element;
  clone.querySelectorAll(`.header-anchor, ${REMOVED_SELECTOR}`).forEach((e) => e.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function tocEntries(root: ParentNode): TocEntry[] {
  return tocHeadings(root).map((h) => ({ level: Number(h.tagName.slice(1)), text: headingText(h) }));
}

// Part of the view height below its top in which a heading counts as current.
const CURRENT_ZONE = 0.25;

// Returns the index of the current heading: the last heading above the top
// quarter of the view, or -1. `tops` are the distances of the headings from
// the top of the view, in document order. At the end of the document, the
// last heading in the view is current, so that each heading can be current.
export function currentHeading(tops: number[], viewHeight: number, atBottom: boolean): number {
  const limit = atBottom ? viewHeight : Math.max(2, viewHeight * CURRENT_ZONE);
  let current = -1;
  tops.forEach((t, i) => {
    if (t <= limit) current = i;
  });
  return current;
}
