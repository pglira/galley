import { describe, it, expect } from "vitest";
import { snippet } from "./search";

describe("snippet", () => {
  it("returns the match with its context", () => {
    expect(snippet("  The Cache is hot.", "cache")).toEqual({ before: "The ", match: "Cache", after: " is hot." });
  });

  it("cuts long context", () => {
    const s = snippet(`${"a".repeat(100)}X${"b".repeat(100)}`, "x", 10);
    expect(s).toEqual({ before: `…${"a".repeat(10)}`, match: "X", after: `${"b".repeat(10)}…` });
  });

  it("returns the start of the line if nothing matches", () => {
    expect(snippet("abc", "z")).toEqual({ before: "", match: "", after: "abc" });
  });
});
