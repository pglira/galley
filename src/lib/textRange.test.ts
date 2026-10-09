import { describe, it, expect } from "vitest";
import { buildIndex, findQuote, insertAt, unwrapAll, wrapRange } from "./textRange";

function root(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

const mark = () => document.createElement("mark");

describe("textRange", () => {
  it("finds a quote across elements and whitespace", () => {
    const el = root("<p>the <em>fast</em>\n cache</p><p>next</p>");
    const index = buildIndex(el, { dropWhitespace: true });
    const range = findQuote(index, "fast cache next");
    expect(range).not.toBeNull();
    wrapRange(index, range![0], range![1], mark);
    expect(el.innerHTML).toBe("<p>the <em><mark>fast</mark></em>\n <mark>cache</mark></p><p><mark>next</mark></p>");
  });

  it("unwraps marks", () => {
    const el = root("<p>a <mark>b</mark> c</p>");
    unwrapAll(el, "mark");
    expect(el.innerHTML).toBe("<p>a b c</p>");
  });

  it("skips text inside matching elements", () => {
    const el = root("<p>a<del>x</del>b</p>");
    expect(buildIndex(el, { skip: "del" }).text).toBe("ab");
  });

  it("inserts at a character and at the end", () => {
    const el = root("<p>abc</p>");
    insertAt(buildIndex(el), 1, document.createElement("br"));
    insertAt(buildIndex(el), 3, document.createElement("hr"));
    expect(el.innerHTML).toBe("<p>a<br>bc<hr></p>");
  });
});
