import { describe, it, expect } from "vitest";
import { highlightMatches, matchAtLine, setActiveMatch } from "./docSearch";

function setup(html: string) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("highlightMatches", () => {
  it("wraps every case-insensitive match", () => {
    const root = setup("<p>Hello world, hello there</p>");
    const h = highlightMatches(root, "hello");
    expect(h.matches).toHaveLength(2);
    expect(root.querySelectorAll("mark.doc-search-match")).toHaveLength(2);
  });

  it("ignores empty queries", () => {
    const root = setup("<p>some text</p>");
    const h = highlightMatches(root, "");
    expect(h.matches).toHaveLength(0);
    expect(root.querySelector("mark")).toBeNull();
  });

  it("returns a clear() that restores original text", () => {
    const root = setup("<p>foo bar foo</p>");
    const h = highlightMatches(root, "foo");
    expect(h.matches).toHaveLength(2);
    h.clear();
    expect(root.querySelector("mark")).toBeNull();
    expect(root.textContent).toBe("foo bar foo");
  });

  it("does not match inside SCRIPT or STYLE", () => {
    const root = setup("<style>foo</style><p>foo</p><script>foo</script>");
    const h = highlightMatches(root, "foo");
    expect(h.matches).toHaveLength(1);
  });

  it("leaves out the elements that match skip", () => {
    const root = setup('<div class="old"><p>foo</p></div><p>foo</p>');
    const h = highlightMatches(root, "foo", ".old");
    expect(h.matches).toHaveLength(1);
    expect(h.matches[0].closest(".old")).toBeNull();
  });
});

describe("setActiveMatch", () => {
  it("toggles active class to one element at a time", () => {
    const root = setup("<p>a a a</p>");
    const h = highlightMatches(root, "a");
    setActiveMatch(h.matches, 0);
    expect(h.matches[0].classList.contains("doc-search-active")).toBe(true);
    setActiveMatch(h.matches, 1);
    expect(h.matches[0].classList.contains("doc-search-active")).toBe(false);
    expect(h.matches[1].classList.contains("doc-search-active")).toBe(true);
  });

  it("wraps negative indices", () => {
    const root = setup("<p>a a</p>");
    const h = highlightMatches(root, "a");
    const target = setActiveMatch(h.matches, -1);
    expect(target).toBe(h.matches[1]);
  });
});

describe("matchAtLine", () => {
  it("finds the first match in the block of a source line", () => {
    const root = setup('<p data-source-map="0,2">a x</p><ul><li data-source-map="3,4">x <em>x</em></li></ul>');
    const h = highlightMatches(root, "x");
    expect(matchAtLine(h.matches, 1)).toBe(0);
    expect(matchAtLine(h.matches, 3)).toBe(1);
    expect(matchAtLine(h.matches, 9)).toBe(0);
  });
});
