import { describe, it, expect } from "vitest";
import { getSourceRange } from "./copyAsMarkdown";

function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

// A minimal selection: getSourceRange reads only the anchor, the focus and the text.
function select(start: Node, startOffset: number, end: Node, endOffset: number): Selection {
  const range = document.createRange();
  range.setStart(start, startOffset);
  range.setEnd(end, endOffset);
  return { anchorNode: start, focusNode: end, toString: () => range.toString() } as unknown as Selection;
}

describe("getSourceRange", () => {
  const html =
    '<p data-source-map="0,1">intro text</p>' +
    '<pre data-source-map="2,6"><code>line one\nline two\nline three</code></pre>';

  it("returns null for a part of one block", () => {
    const el = root(html);
    const code = el.querySelector("code")!.firstChild!;
    expect(getSourceRange(select(code, 9, code, 17), el)).toBeNull();
  });

  it("returns the lines of a block whose whole text is selected", () => {
    const el = root(html);
    const p = el.querySelector("p")!.firstChild!;
    expect(getSourceRange(select(p, 0, p, 10), el)).toEqual([0, 1]);
  });

  it("returns the lines of all blocks that a selection spans", () => {
    const el = root(html);
    const p = el.querySelector("p")!.firstChild!;
    const code = el.querySelector("code")!.firstChild!;
    expect(getSourceRange(select(p, 6, code, 4), el)).toEqual([0, 6]);
  });
});
