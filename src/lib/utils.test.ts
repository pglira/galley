import { describe, expect, it } from "vitest";
import { cn, formatTime } from "./utils";

describe("cn", () => {
  it("merges classes", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("dedupes conflicting tailwind classes via tailwind-merge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("filters falsy values", () => {
    expect(cn("a", undefined, false, null, "b")).toBe("a b");
  });

  it("supports conditional via clsx", () => {
    expect(cn({ a: true, b: false })).toBe("a");
  });
});

describe("formatTime", () => {
  it("formats a local time with zero padding", () => {
    expect(formatTime(new Date(2026, 0, 5, 7, 3).getTime())).toBe("2026-01-05 07:03");
  });
});
