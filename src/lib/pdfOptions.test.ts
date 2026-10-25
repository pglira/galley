import { describe, expect, it } from "vitest";
import { PDF_DEFAULTS, normalizePdfOptions, pageRule } from "./pdfOptions";

describe("normalizePdfOptions", () => {
  it("returns the defaults for missing data", () => {
    expect(normalizePdfOptions(undefined)).toEqual(PDF_DEFAULTS);
    expect(normalizePdfOptions({})).toEqual(PDF_DEFAULTS);
  });

  it("keeps valid values", () => {
    const o = { paper: "a3", landscape: true, margins: "wide", scale: 80 };
    expect(normalizePdfOptions(o)).toEqual(o);
  });

  it("replaces unknown values and clamps the scale", () => {
    expect(normalizePdfOptions({ paper: "b7", margins: "huge", scale: 999, landscape: "yes" })).toEqual({
      ...PDF_DEFAULTS,
      scale: 200,
    });
    expect(normalizePdfOptions({ scale: 10 }).scale).toBe(50);
  });
});

describe("pageRule", () => {
  it("gives the size, the orientation and the margins", () => {
    expect(pageRule({ paper: "a4", landscape: true, margins: "narrow", scale: 100 })).toBe(
      "@page { size: A4 landscape; margin: 8mm 8mm; }"
    );
  });

  it("gives only the orientation for the system paper size", () => {
    expect(pageRule(PDF_DEFAULTS)).toBe("@page { size: portrait; margin: 16mm 14mm; }");
  });
});
