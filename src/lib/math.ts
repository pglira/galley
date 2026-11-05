// LaTeX math in rendered Markdown. A formula (`.katex`) holds its TeX
// source in a hidden element (`.katex-tex`) and the output of KaTeX for the
// eye (`.katex-html`). The text of a formula for quotes, annotation marks
// and the diff is its TeX source.

import katex from "katex";

export const MATH = ".katex";

// Text that a text index of the document leaves out, so that a formula
// counts as its TeX source.
export const MATH_HIDDEN = ".katex-html";

// Text that is not visible: the TeX source of all formulas.
export const MATH_INVISIBLE = ".katex-tex";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Renders `tex` as HTML, with the TeX source in front of the output of KaTeX.
// Throws on a parse error if the options of KaTeX say so.
export function renderMath(tex: string, options?: katex.KatexOptions): string {
  const html = katex.renderToString(tex, { ...options, output: "html" });
  const source = `<span class="katex-tex">${escapeHtml(tex.trim())}</span>`;
  return html.replace('<span class="katex">', `<span class="katex">${source}`);
}

// Extends `range` to contain whole formulas at its two ends. Returns true if
// `range` changed.
export function extendToMath(range: Range): boolean {
  const formula = (n: Node) => (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest(MATH);
  const start = formula(range.startContainer);
  const end = formula(range.endContainer);
  if (start) range.setStartBefore(start);
  if (end) range.setEndAfter(end);
  return Boolean(start || end);
}

// Returns the text of `frag` with each formula as its TeX source. Removes
// the elements that match `skip` first.
export function fragmentText(frag: DocumentFragment, skip?: string): string {
  frag.querySelectorAll(skip ? `${skip}, ${MATH_HIDDEN}` : MATH_HIDDEN).forEach((e) => e.remove());
  return frag.textContent ?? "";
}
