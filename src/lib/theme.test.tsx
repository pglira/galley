import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ThemeProvider, useTheme, toneOf, DEFAULT_PAPER } from "./theme";

function Probe() {
  const { paper, resolved } = useTheme();
  return <span>{`${paper}:${resolved}`}</span>;
}

describe("theme", () => {
  it("provides the default paper", () => {
    localStorage.clear();
    const html = renderToString(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(html).toContain(`${DEFAULT_PAPER}:light`);
  });

  it("finds the tone of a paper color", () => {
    expect(toneOf("#ffffff")).toBe("light");
    expect(toneOf("#f1e6cf")).toBe("light");
    expect(toneOf("#2a2c33")).toBe("dark");
    expect(toneOf("#000000")).toBe("dark");
  });

  it("throws if useTheme used outside provider", () => {
    expect(() => renderToString(<Probe />)).toThrow();
  });
});
