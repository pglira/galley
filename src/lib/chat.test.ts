import { describe, expect, it } from "vitest";
import { applyEvent, formatTokens, historyItems, newChat, newNames } from "@/lib/chat";

describe("chat", () => {
  it("joins tool results with their calls", () => {
    const items = historyItems([
      { kind: "user", text: "Hi" },
      { kind: "tool_use", id: "t1", name: "Read", summary: "GALLEY.md" },
      { kind: "text", text: "Done." },
      { kind: "tool_result", id: "t1", text: "rules", is_error: false },
      { kind: "tool_result", id: "unknown", text: "x", is_error: true },
    ]);
    expect(items).toEqual([
      { kind: "user", text: "Hi" },
      { kind: "tool", id: "t1", name: "Read", summary: "GALLEY.md", result: "rules", isError: false },
      { kind: "text", text: "Done." },
    ]);
  });

  it("ends the busy state at the end of a turn or of the process", () => {
    const busy = { ...newChat("s", true), busy: true };
    expect(applyEvent(busy, { kind: "text", text: "a" }).busy).toBe(true);
    const ended = applyEvent(busy, { kind: "result", input_tokens: 5, output_tokens: 2, error: null });
    expect(ended.busy).toBe(false);
    expect(ended.items).toEqual([{ kind: "turn", inputTokens: 5, outputTokens: 2, error: null }]);
    const exited = applyEvent(busy, { kind: "exit", error: "boom" });
    expect(exited.busy).toBe(false);
    expect(exited.items).toEqual([{ kind: "error", text: "boom" }]);
    expect(applyEvent(busy, { kind: "exit", error: null }).items).toEqual([]);
  });

  it("finds new names", () => {
    expect(newNames(["a", "b"], ["c", "a", "d", "b"])).toEqual(["c", "d"]);
  });

  it("formats token counts", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(45678)).toBe("46k");
    expect(formatTokens(1_200_000)).toBe("1.2M");
  });
});
