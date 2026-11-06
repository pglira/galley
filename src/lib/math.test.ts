import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";
import { extendToMath, fragmentText } from "./math";
import { buildIndex, findQuote } from "./textRange";

function render(source: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = renderMarkdown(source);
  document.body.replaceChildren(root);
  return root;
}

describe("math", () => {
  it("renders inline math, display math and math code blocks", () => {
    const html = renderMarkdown("Euler $e^{i\\pi}+1=0$.\n\n$$\n\\sqrt{x}\n$$\n\n```math\n\\frac{a}{b}\n```");
    expect(html).toMatch(/<p data-source-map="0,1">Euler <span class="katex"><span class="katex-tex">e\^\{i\\pi\}\+1=0<\/span>/);
    expect(html).toMatch(/<p data-source-map="2,5" class="katex-block">.*<span class="katex-tex">\\sqrt\{x\}<\/span>/s);
    expect(html).toMatch(/<p data-source-map="6,9" class="katex-block">.*<span class="katex-tex">\\frac\{a\}\{b\}<\/span>/s);
    expect(html).toContain("katex-html");
    expect(html).not.toContain("<math");
  });

  it("renders the delimiters \\(...\\) and \\[...\\]", () => {
    const html = renderMarkdown("Area \\(\\pi r^2\\) here.\n\n\\[\nx = \\frac{a}{b}\n\\]\n\nText\n\\[ y^2 \\]");
    expect(html).toMatch(/<p data-source-map="0,1">Area <span class="katex"><span class="katex-tex">\\pi r\^2<\/span>/);
    expect(html).toMatch(/<p data-source-map="2,5" class="katex-block">.*<span class="katex-tex">x = \\frac\{a\}\{b\}<\/span>/s);
    expect(html).toMatch(/<p data-source-map="7,8" class="katex-block">.*<span class="katex-tex">y\^2<\/span>/s);
  });

  it("keeps escaped brackets and parentheses as text", () => {
    expect(renderMarkdown("See \\[1\\] and \\(a).")).toContain("See [1] and (a).");
    expect(renderMarkdown("\\[\n\nno end")).not.toContain("katex");
  });

  it("leaves dollar amounts as text", () => {
    expect(renderMarkdown("It costs $5 and $6.")).not.toContain("katex");
  });

  it("shows the error of a formula that does not parse", () => {
    expect(renderMarkdown("Bad $\\frac{a$ here.")).toContain("katex-error");
  });

  it("escapes the TeX source", () => {
    expect(renderMarkdown("$a<b$")).toContain('<span class="katex-tex">a&lt;b</span>');
  });

  it("finds a quote with a formula as its TeX source", () => {
    const root = render("The area is $\\pi r^2$ for a circle.");
    const index = buildIndex(root, { dropWhitespace: true, skip: ".katex-html" });
    expect(index.text).toBe("Theareais\\pir^2foracircle.");
    expect(findQuote(index, "is \\pi r^2 for")).not.toBeNull();
  });

  it("extends a range to whole formulas and reads them as TeX", () => {
    const root = render("The area is $\\pi r^2$ for a circle.");
    const glyph = root.querySelector(".katex-html .mord")!;
    const range = document.createRange();
    range.setStart(root.querySelector("p")!.firstChild!, 4);
    range.setEnd(glyph, 0);
    expect(extendToMath(range)).toBe(true);
    expect(fragmentText(range.cloneContents()).replace(/\s+/g, " ")).toBe("area is \\pi r^2");
  });
});
