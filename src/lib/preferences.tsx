import * as React from "react";
import { tauri } from "@/lib/tauri";
import { DOC_FONT_DEFAULT, docFont } from "@/lib/fonts";

export interface Preferences {
  copyAsMarkdown: boolean;
  // Scale of the document text, 1 = 100 %.
  zoom: number;
  // Maximum width of the paper in CSS pixels.
  paperWidth: number;
  sidebarLeftWidth: number;
  sidebarRightWidth: number;
  // Height of the table of contents below the document tree, in CSS pixels.
  contentsHeight: number;
  // The id of the font of the rendered document (`src/lib/fonts.ts`).
  docFont: string;
}

const STORAGE_KEY = "galley:preferences";

const DEFAULTS: Preferences = {
  copyAsMarkdown: true,
  zoom: 1.0,
  paperWidth: 860,
  sidebarLeftWidth: 256,
  sidebarRightWidth: 300,
  contentsHeight: 300,
  docFont: DOC_FONT_DEFAULT,
};

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

export const PAPER_WIDTH_MIN = 480;
export const PAPER_WIDTH_MAX = 2400;
export const PAPER_WIDTH_DEFAULT = 860;

export const SIDEBAR_LEFT_MIN = 180;
export const SIDEBAR_LEFT_MAX = 400;
export const SIDEBAR_LEFT_DEFAULT = 256;
export const SIDEBAR_RIGHT_MIN = 220;
export const SIDEBAR_RIGHT_MAX = 520;
export const SIDEBAR_RIGHT_DEFAULT = 300;
export const CONTENTS_HEIGHT_MIN = 60;
export const CONTENTS_HEIGHT_DEFAULT = 300;

interface Ctx extends Preferences {
  setCopyAsMarkdown: (v: boolean) => void;
  setDocFont: (id: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  setPaperWidth: (width: number) => void;
  setSidebarWidth: (side: "left" | "right", width: number) => void;
  resetSidebarWidth: (side: "left" | "right") => void;
  setContentsHeight: (height: number) => void;
  resetContentsHeight: () => void;
}

const PreferencesContext = React.createContext<Ctx | null>(null);

function load(): Preferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function persist(prefs: Preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

let backendTimer: ReturnType<typeof setTimeout> | null = null;
function persistToBackend(prefs: Preferences) {
  if (backendTimer) clearTimeout(backendTimer);
  backendTimer = setTimeout(() => {
    tauri.savePreferences({
      zoom: prefs.zoom,
      paper_width: prefs.paperWidth,
      sidebar_left_width: prefs.sidebarLeftWidth,
      sidebar_right_width: prefs.sidebarRightWidth,
      contents_height: prefs.contentsHeight,
      copy_as_markdown: prefs.copyAsMarkdown,
      doc_font: prefs.docFont,
    }).catch(() => {});
  }, 300);
}

function clampZoom(z: number): number {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 10) / 10;
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = React.useState<Preferences>(load);

  // On mount, reconcile with Rust backend (authoritative source).
  React.useEffect(() => {
    tauri.loadPreferences().then((backend) => {
      setPrefs((prev) => {
        const next = { ...prev };
        if (backend.zoom != null) next.zoom = clampZoom(backend.zoom);
        if (backend.paper_width != null) next.paperWidth = backend.paper_width;
        if (backend.sidebar_left_width != null) next.sidebarLeftWidth = backend.sidebar_left_width;
        if (backend.sidebar_right_width != null) next.sidebarRightWidth = backend.sidebar_right_width;
        if (backend.contents_height != null) next.contentsHeight = backend.contents_height;
        if (backend.copy_as_markdown != null) next.copyAsMarkdown = backend.copy_as_markdown;
        if (backend.doc_font != null) next.docFont = backend.doc_font;
        persist(next);
        return next;
      });
    }).catch(() => {});
  }, []);

  const update = React.useCallback((fn: (prev: Preferences) => Preferences) => {
    setPrefs((prev) => {
      const next = fn(prev);
      persist(next);
      persistToBackend(next);
      return next;
    });
  }, []);

  const setCopyAsMarkdown = React.useCallback(
    (v: boolean) => update((p) => ({ ...p, copyAsMarkdown: v })),
    [update],
  );

  const setDocFont = React.useCallback(
    (id: string) => update((p) => ({ ...p, docFont: id })),
    [update],
  );

  // The document font applies through CSS variables on the root element, so
  // that the viewer and the PDF export use it.
  React.useEffect(() => {
    const font = docFont(prefs.docFont);
    const style = document.documentElement.style;
    style.setProperty("--font-doc", font.family);
    style.setProperty("--doc-font-scale", String(font.scale));
  }, [prefs.docFont]);

  const zoomIn = React.useCallback(
    () => update((p) => ({ ...p, zoom: clampZoom(p.zoom + ZOOM_STEP) })),
    [update],
  );

  const zoomOut = React.useCallback(
    () => update((p) => ({ ...p, zoom: clampZoom(p.zoom - ZOOM_STEP) })),
    [update],
  );

  const zoomReset = React.useCallback(
    () => update((p) => ({ ...p, zoom: 1.0 })),
    [update],
  );

  const setPaperWidth = React.useCallback(
    (width: number) =>
      update((p) => ({
        ...p,
        paperWidth: Math.round(Math.min(PAPER_WIDTH_MAX, Math.max(PAPER_WIDTH_MIN, width))),
      })),
    [update],
  );

  const setSidebarWidth = React.useCallback(
    (side: "left" | "right", width: number) => {
      const min = side === "left" ? SIDEBAR_LEFT_MIN : SIDEBAR_RIGHT_MIN;
      const max = side === "left" ? SIDEBAR_LEFT_MAX : SIDEBAR_RIGHT_MAX;
      const clamped = Math.round(Math.min(max, Math.max(min, width)));
      const key = side === "left" ? "sidebarLeftWidth" : "sidebarRightWidth";
      update((p) => ({ ...p, [key]: clamped }));
    },
    [update],
  );

  const resetSidebarWidth = React.useCallback(
    (side: "left" | "right") => {
      const key = side === "left" ? "sidebarLeftWidth" : "sidebarRightWidth";
      const def = side === "left" ? SIDEBAR_LEFT_DEFAULT : SIDEBAR_RIGHT_DEFAULT;
      update((p) => ({ ...p, [key]: def }));
    },
    [update],
  );

  // The maximum height depends on the height of the sidebar; the layout limits it.
  const setContentsHeight = React.useCallback(
    (height: number) => update((p) => ({ ...p, contentsHeight: Math.round(Math.max(CONTENTS_HEIGHT_MIN, height)) })),
    [update],
  );

  const resetContentsHeight = React.useCallback(
    () => update((p) => ({ ...p, contentsHeight: CONTENTS_HEIGHT_DEFAULT })),
    [update],
  );

  const value = React.useMemo(
    () => ({
      ...prefs,
      setCopyAsMarkdown,
      setDocFont,
      zoomIn,
      zoomOut,
      zoomReset,
      setPaperWidth,
      setSidebarWidth,
      resetSidebarWidth,
      setContentsHeight,
      resetContentsHeight,
    }),
    [
      prefs,
      setCopyAsMarkdown,
      setDocFont,
      zoomIn,
      zoomOut,
      zoomReset,
      setPaperWidth,
      setSidebarWidth,
      resetSidebarWidth,
      setContentsHeight,
      resetContentsHeight,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

export function usePreferences(): Ctx {
  const ctx = React.useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
