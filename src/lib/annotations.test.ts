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

  it("round-trips quotes with a page", () => {
    const list = [
      { quote: "the loss", page: 3, context: "We plot the loss over epochs.", comment: "Use a log scale." },
      { quote: "abstract", page: 1, comment: "Shorter." },
      { quote: "", comment: "Page: 2 is not a page line" },
    ];
    expect(parseAnnotations(serializeAnnotations(list))).toEqual(list);
    expect(serializeAnnotations(list.slice(1, 2))).toBe("# Annotations\n\n## 1\n\n> abstract\n\nPage: 1\n\nShorter.\n");
    expect(parseAnnotations("## 1\n\n> q\n\nContext: a q b\n\nPage: 4\n\nc")).toEqual([
      { quote: "q", context: "a q b", page: 4, comment: "c" },
    ]);
  });

  it("round-trips regions", () => {
    const list = [
      { quote: "", region: "annotations/region-1.png", page: 4, context: "Figure 3: the loss", comment: "Larger." },
      { quote: "", region: "annotations/region-2.png", comment: "A diagram." },
      { quote: "", comment: "Region: not a region line" },
    ];
    expect(parseAnnotations(serializeAnnotations(list))).toEqual(list);
    expect(serializeAnnotations(list.slice(0, 1))).toBe(
      "# Annotations\n\n## 1\n\nRegion: annotations/region-1.png\n\nPage: 4\n\nContext: Figure 3: the loss\n\nLarger.\n"
    );
  });

  it("round-trips checkboxes", () => {
    const list = [
      { quote: "Redis", checked: true, context: "Which cache should we use?", comment: "" },
      { quote: "Keep the old API", checked: false, comment: "Drop it." },
      { quote: "", comment: "Checked: [x] not a checkbox" },
    ];
    expect(parseAnnotations(serializeAnnotations(list))).toEqual(list);
    expect(serializeAnnotations(list.slice(0, 1))).toBe(
      "# Annotations\n\n## 1\n\nChecked: [x] Redis\n\nContext: Which cache should we use?\n"
    );
  });

  it("round-trips answers in text fields", () => {
    const list = [
      { quote: "How much memory can the cache use?", answer: true, comment: "512 MB per node.\n\nNot more." },
      { quote: "", comment: "Answer: not an answer" },
    ];
    expect(parseAnnotations(serializeAnnotations(list))).toEqual(list);
    expect(serializeAnnotations(list.slice(0, 1))).toBe(
      "# Annotations\n\n## 1\n\nAnswer: How much memory can the cache use?\n\n512 MB per node.\n\nNot more.\n"
    );
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

  it("round-trips annotations of images", () => {
    const list = [
      { quote: "", image: "images/loss.png", comment: "Use a log scale." },
      { quote: "", comment: "Image: not an image line" },
      { quote: "q", comment: "first\nImage: a comment line" },
    ];
    expect(parseAnnotations(serializeAnnotations(list))).toEqual(list);
    expect(serializeAnnotations(list.slice(0, 1))).toBe(
      "# Annotations\n\n## 1\n\nImage: images/loss.png\n\nUse a log scale.\n"
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
