import { describe, it, expect } from "vitest";
import { gutterMarks } from "./diffGutter";

describe("gutterMarks", () => {
  it("scales the spans to the height of the gutter", () => {
    const marks = gutterMarks([{ top: 500, bottom: 600, kind: "add" }], 1000, 100);
    expect(marks).toEqual([{ top: 50, height: 10, kind: "add" }]);
  });

  it("gives small changes the minimum height", () => {
    const marks = gutterMarks([{ top: 100, bottom: 101, kind: "del" }], 1000, 100, 3);
    expect(marks).toEqual([{ top: 10, height: 3, kind: "del" }]);
  });

  it("keeps a mark at the end inside the gutter", () => {
    const [m] = gutterMarks([{ top: 999, bottom: 1000, kind: "add" }], 1000, 100, 3);
    expect(m.top + m.height).toBeLessThanOrEqual(100);
  });

  it("merges near marks of the same kind, not of different kinds", () => {
    const marks = gutterMarks(
      [
        { top: 100, bottom: 120, kind: "add" },
        { top: 130, bottom: 200, kind: "add" },
        { top: 140, bottom: 150, kind: "del" },
      ],
      1000,
      100
    );
    expect(marks.filter((m) => m.kind === "add")).toEqual([{ top: 10, height: 10, kind: "add" }]);
    expect(marks.filter((m) => m.kind === "del")).toHaveLength(1);
  });

  it("returns no marks for an empty document", () => {
    expect(gutterMarks([{ top: 0, bottom: 10, kind: "add" }], 0, 100)).toEqual([]);
  });
});
