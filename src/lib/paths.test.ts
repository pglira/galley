import { describe, it, expect } from "vitest";
import { isRelativePath, resolveRelative } from "./paths";

describe("isRelativePath", () => {
  it("accepts relative paths", () => {
    expect(isRelativePath("images/plot.png")).toBe(true);
    expect(isRelativePath("./plot.png")).toBe(true);
    expect(isRelativePath("../plot.png")).toBe(true);
  });
  it("rejects URLs, absolute paths and anchors", () => {
    expect(isRelativePath("https://example.com/a.png")).toBe(false);
    expect(isRelativePath("data:image/png;base64,AAAA")).toBe(false);
    expect(isRelativePath("/abs/a.png")).toBe(false);
    expect(isRelativePath("#top")).toBe(false);
  });
});

describe("resolveRelative", () => {
  it("resolves against the directory of the file", () => {
    expect(resolveRelative("/r/01/document.md", "images/plot.png")).toBe("/r/01/images/plot.png");
  });
  it("handles . and .. segments", () => {
    expect(resolveRelative("/r/01/document.md", "./a/../b.png")).toBe("/r/01/b.png");
    expect(resolveRelative("/r/01/document.md", "../shared/c.png")).toBe("/r/shared/c.png");
  });
  it("decodes percent-encoded names", () => {
    expect(resolveRelative("/r/document.md", "my%20plot.png")).toBe("/r/my plot.png");
  });
  it("keeps Windows separators", () => {
    expect(resolveRelative("C:\\r\\document.md", "images/p.png")).toBe("C:\\r\\images\\p.png");
  });
});
