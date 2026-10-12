import { describe, it, expect } from "vitest";
import { parseAnnotations, serializeAnnotations } from "./annotations";

describe("annotations", () => {
  it("round-trips quotes and comments", () => {
    const list = [
      { quote: "the cache is invalidated", comment: "Is this true for batch writes?" },
      { quote: "", comment: "Make the summary shorter.\n\nAnd add a table." },
      { quote: "line one\nline two", comment: "Two lines." },
    ];
    expect(parseAnnotations(serializeAnnotations(list))).toEqual(list);
  });

  it("round-trips comments that look like quotes or headings", () => {
    const list = [
      { quote: "", comment: "> I disagree\nreason" },
      { quote: "q", comment: "first\n## 2\nstill first" },
      { quote: "", comment: "\\> already escaped\n\\\\## 3" },
    ];
    expect(parseAnnotations(serializeAnnotations(list))).toEqual(list);
  });

  it("round-trips the context of a quote", () => {
    const list = [
      { quote: "Images", context: "4. Images: in this port or later?", comment: "now" },
      { quote: "", comment: "Context: not a context" },
      { quote: "q", comment: "Context: a comment line" },
    ];
    expect(parseAnnotations(serializeAnnotations(list))).toEqual(list);
    expect(serializeAnnotations(list.slice(0, 1))).toBe(
      "# Annotations\n\n## 1\n\n> Images\n\nContext: 4. Images: in this port or later?\n\nnow\n"
    );
  });

  it("writes the documented format", () => {
    expect(serializeAnnotations([{ quote: "q", comment: "c" }])).toBe("# Annotations\n\n## 1\n\n> q\n\nc\n");
  });

  it("writes nothing for an empty list", () => {
    expect(serializeAnnotations([])).toBe("");
    expect(parseAnnotations("")).toEqual([]);
  });
});
