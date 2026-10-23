// Keys that move in the document. The letter keys follow the pager `less`
// and Vim.

export type NavAction =
  | "lineDown"
  | "lineUp"
  | "halfDown"
  | "halfUp"
  | "pageDown"
  | "pageUp"
  | "top"
  | "bottom"
  | "nextHeading"
  | "prevHeading";

export interface NavKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// Returns the action of a key, or null for a key that does not move.
export function navAction(e: NavKey): NavAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case "j":
    case "ArrowDown":
      return "lineDown";
    case "k":
    case "ArrowUp":
      return "lineUp";
    case "d":
      return "halfDown";
    case "u":
      return "halfUp";
    case " ":
      return e.shiftKey ? "pageUp" : "pageDown";
    case "PageDown":
      return "pageDown";
    case "b":
    case "PageUp":
      return "pageUp";
    case "g":
    case "Home":
      return "top";
    case "G":
    case "End":
      return "bottom";
    case "]":
      return "nextHeading";
    case "[":
      return "prevHeading";
  }
  return null;
}

// Returns the scroll distance of a move by lines or pages. A page keeps two
// lines of the previous page in view.
export function scrollDistance(action: NavAction, viewHeight: number, lineHeight: number): number {
  const page = Math.max(lineHeight, viewHeight - 2 * lineHeight);
  switch (action) {
    case "lineDown":
      return 2 * lineHeight;
    case "lineUp":
      return -2 * lineHeight;
    case "halfDown":
      return viewHeight / 2;
    case "halfUp":
      return -viewHeight / 2;
    case "pageDown":
      return page;
    case "pageUp":
      return -page;
    default:
      return 0;
  }
}

// Distance in pixels below which a heading counts as at the top of the view.
const AT_TOP = 2;

// Returns the index of the next heading below the top of the view, or of the
// previous heading above it, or -1. `tops` are the distances of the headings
// from the top of the view, in document order.
export function headingTarget(tops: number[], direction: 1 | -1): number {
  if (direction === 1) return tops.findIndex((t) => t > AT_TOP);
  for (let i = tops.length - 1; i >= 0; i--) if (tops[i] < -AT_TOP) return i;
  return -1;
}
