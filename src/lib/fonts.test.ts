import { describe, it, expect } from "vitest";
import { DOC_FONTS, DOC_FONT_DEFAULT, docFont } from "./fonts";

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
});
