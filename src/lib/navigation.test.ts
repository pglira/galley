import { describe, it, expect } from "vitest";
import { headingTarget, navAction, scrollDistance, type NavKey } from "./navigation";

const key = (k: string, mods: Partial<NavKey> = {}): NavKey => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("navAction", () => {
  it("maps the letter keys and the standard keys", () => {
    expect(navAction(key("j"))).toBe("lineDown");
    expect(navAction(key("ArrowUp"))).toBe("lineUp");
    expect(navAction(key("d"))).toBe("halfDown");
    expect(navAction(key("u"))).toBe("halfUp");
    expect(navAction(key(" "))).toBe("pageDown");
    expect(navAction(key(" ", { shiftKey: true }))).toBe("pageUp");
    expect(navAction(key("b"))).toBe("pageUp");
    expect(navAction(key("g"))).toBe("top");
    expect(navAction(key("G", { shiftKey: true }))).toBe("bottom");
    expect(navAction(key("End"))).toBe("bottom");
    expect(navAction(key("]"))).toBe("nextHeading");
    expect(navAction(key("["))).toBe("prevHeading");
  });

  it("ignores keys with Ctrl, Meta or Alt and other keys", () => {
    expect(navAction(key("j", { ctrlKey: true }))).toBeNull();
    expect(navAction(key("d", { metaKey: true }))).toBeNull();
    expect(navAction(key("g", { altKey: true }))).toBeNull();
    expect(navAction(key("x"))).toBeNull();
  });
});

describe("scrollDistance", () => {
  it("scrolls by lines, half pages and pages", () => {
    expect(scrollDistance("lineDown", 800, 20)).toBe(40);
    expect(scrollDistance("lineUp", 800, 20)).toBe(-40);
    expect(scrollDistance("halfDown", 800, 20)).toBe(400);
    expect(scrollDistance("pageDown", 800, 20)).toBe(760);
    expect(scrollDistance("pageUp", 800, 20)).toBe(-760);
  });
});

describe("headingTarget", () => {
  it("finds the next and the previous heading", () => {
    const tops = [-500, -100, 0, 1, 300, 900];
    expect(headingTarget(tops, 1)).toBe(4);
    expect(headingTarget(tops, -1)).toBe(1);
    expect(headingTarget([-10, -5], 1)).toBe(-1);
    expect(headingTarget([5, 10], -1)).toBe(-1);
  });
});
