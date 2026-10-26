import { describe, it, expect } from "vitest";
import { buildIndex, countQuote, findQuote, insertAt, quoteContext, unwrapAll, wrapRange } from "./textRange";

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

  it("finds the match of a quote inside its context", () => {
    const el = root("<table><tr><td>4</td><td>Images</td></tr></table><ol><li><strong>Images:</strong> now or later?</li></ol>");
    const index = buildIndex(el, { dropWhitespace: true });
    expect(countQuote(index, "Images")).toBe(2);
    expect(findQuote(index, "Images")).toEqual([1, 7]);
    expect(findQuote(index, "Images", "…Images: now or later?")).toEqual([7, 13]);
    expect(findQuote(index, "Images", "not in the document")).toEqual([1, 7]);
  });

  it("returns the block text around a selection", () => {
    const el = root("<p>head <em>Images</em> tail</p><p>next</p>");
    document.body.appendChild(el);
    const range = document.createRange();
    range.selectNodeContents(el.querySelector("em")!);
    expect(quoteContext(range, "del")).toBe("head Images tail");
    expect(quoteContext(range, "del", 3)).toBe("…Images…");
    el.remove();
  });

  it("reads a line break in the context as a space", () => {
    const el = root('<div class="textLayer"><span>one</span><br><span>two</span><br><span>three</span></div>');
    document.body.appendChild(el);
    const range = document.createRange();
    range.selectNodeContents(el.querySelectorAll("span")[1]);
    expect(quoteContext(range)).toBe("one two three");
    el.remove();
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
