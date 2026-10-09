import * as React from "react";

// The app is always dark. The "paper" is the background of the rendered
// document; its color is selectable. Text, code highlighting and diagrams on
// the paper use light or dark colors to match the paper.

export type Tone = "light" | "dark";

export interface PaperPreset {
  name: string;
  color: string;
}

export const PAPER_PRESETS: PaperPreset[] = [
  { name: "White", color: "#ffffff" },
  { name: "Ivory", color: "#faf7f0" },
  { name: "Sepia", color: "#f1e6cf" },
  { name: "Gray", color: "#e4e4e7" },
  { name: "Slate", color: "#2a2c33" },
  { name: "Black", color: "#161618" },
];

export const DEFAULT_PAPER = "#faf7f0";

const STORAGE_KEY = "galley:paper";

interface Ctx {
  paper: string;
  // The tone of the paper. Content on the paper uses colors for this tone.
  resolved: Tone;
  setPaper: (color: string) => void;
}

const ThemeContext = React.createContext<Ctx | null>(null);

// Returns "light" for colors with a relative luminance above 0.35.
export function toneOf(hex: string): Tone {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return "light";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.35 ? "light" : "dark";
}

function loadPaper(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && /^#[0-9a-f]{6}$/i.test(v)) return v;
  } catch {
    // storage is not available
  }
  return DEFAULT_PAPER;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [paper, setPaperState] = React.useState<string>(loadPaper);

  React.useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const setPaper = React.useCallback((color: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, color);
    } catch {
      // storage is not available
    }
    setPaperState(color);
  }, []);

  const value = React.useMemo(() => ({ paper, resolved: toneOf(paper), setPaper }), [paper, setPaper]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
