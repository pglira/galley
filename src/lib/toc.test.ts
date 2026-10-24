import { describe, it, expect } from "vitest";
import { currentHeading, headingText, tocEntries } from "./toc";

function root(html: string): HTMLElement {
  const el = document.createElement("article");
  el.innerHTML = html;
  return el;
}

describe("tocEntries", () => {
  it("lists the headings with their levels and texts", () => {
    const el = root(
      '<h1 id="a"><a class="header-anchor" href="#a">#</a> Title</h1><p>x</p><h2>One <em>two</em></h2><h3>Three</h3>'
    );
    expect(tocEntries(el)).toEqual([
      { level: 1, text: "Title" },
      { level: 2, text: "One two" },
      { level: 3, text: "Three" },
    ]);
  });

  it("skips the removed headings and the removed text of the diff", () => {
    const el = root(
      '<h2 class="diff-removed">Old</h2><h2>New <del class="diff-del">old</del><ins class="diff-ins">name</ins></h2>'
    );
    expect(tocEntries(el)).toEqual([{ level: 2, text: "New name" }]);
  });
});

describe("headingText", () => {
  it("collapses white space", () => {
    expect(headingText(root("<h2>  a \n b </h2>").firstElementChild!)).toBe("a b");
  });
});

describe("currentHeading", () => {
  it("is -1 before the first heading reaches the top quarter", () => {
    expect(currentHeading([300, 900], 800, false)).toBe(-1);
  });

  it("is the last heading above the top quarter", () => {
    expect(currentHeading([-500, 100, 700], 800, false)).toBe(1);
    expect(currentHeading([-500, 0, 700], 800, false)).toBe(1);
    expect(currentHeading([-500, -100, 300], 800, false)).toBe(1);
  });

  it("is the last heading in the view at the end of the document", () => {
    expect(currentHeading([-500, 100, 700], 800, true)).toBe(2);
  });
});
