import { describe, it, expect } from "vitest";
import { nearestBox } from "./pdfSelection";

describe("nearestBox", () => {
  const boxes = [
    { left: 10, top: 0, right: 50, bottom: 10 },
    { left: 60, top: 0, right: 100, bottom: 10 },
    { left: 10, top: 20, right: 100, bottom: 30 },
  ];

  it("finds the box under the point", () => {
    expect(nearestBox(boxes, 70, 5)).toBe(1);
    expect(nearestBox(boxes, 20, 25)).toBe(2);
  });

  it("prefers a box on the same line", () => {
    expect(nearestBox(boxes, 0, 5)).toBe(0);
    expect(nearestBox(boxes, 200, 5)).toBe(1);
    expect(nearestBox(boxes, 55, 25)).toBe(2);
  });

  it("finds the nearest line between lines and outside", () => {
    expect(nearestBox(boxes, 70, 12)).toBe(1);
    expect(nearestBox(boxes, 70, 19)).toBe(2);
    expect(nearestBox(boxes, 70, 100)).toBe(2);
  });

  it("ignores empty boxes", () => {
    expect(nearestBox([{ left: 0, top: 0, right: 0, bottom: 0 }], 0, 0)).toBe(-1);
    expect(nearestBox([], 0, 0)).toBe(-1);
  });
});
