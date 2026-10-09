import { describe, it, expect } from "vitest";
import { buildPrompt, nextSnapshotName } from "./prompt";

describe("prompt", () => {
  it("numbers the next snapshot", () => {
    expect(nextSnapshotName(["01", "02"])).toBe("03");
    expect(nextSnapshotName(["01", "09"])).toBe("10");
    expect(nextSnapshotName(["001"])).toBe("002");
    expect(nextSnapshotName([])).toBe("01");
  });

  it("uses relative paths only", () => {
    const p = buildPrompt("2026-10-09_1430_x", "01", ["01", "02"]);
    expect(p).toContain("`2026-10-09_1430_x/01/annotations.md`");
    expect(p).toContain("`2026-10-09_1430_x/03/`");
    expect(p).not.toMatch(/(^|\s|`)\//);
  });
});
