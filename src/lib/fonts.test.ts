import { describe, it, expect } from "vitest";
import { DOC_FONTS, DOC_FONT_DEFAULT, DOC_FONT_KINDS, docFont } from "./fonts";

describe("docFont", () => {
  it("finds a font by its id", () => {
    expect(docFont("fira-sans").name).toBe("Fira Sans");
  });
  it("falls back to the default font for an unknown id", () => {
    expect(docFont("comic-sans").id).toBe(DOC_FONT_DEFAULT);
  });
  it("has unique ids", () => {
    expect(new Set(DOC_FONTS.map((f) => f.id)).size).toBe(DOC_FONTS.length);
  });
  it("puts each font into a group of the menu", () => {
    const kinds = new Set(DOC_FONT_KINDS.map((k) => k.kind));
    expect(DOC_FONTS.every((f) => kinds.has(f.kind))).toBe(true);
  });
  it("has serif fonts", () => {
    expect(DOC_FONTS.filter((f) => f.kind === "serif").length).toBeGreaterThan(0);
  });
});
