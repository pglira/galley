// Options of the PDF export: page setup and scale of the content.

export interface PdfOptions {
  // An id of PAPER_SIZES. "system" uses the paper size of the system.
  paper: string;
  landscape: boolean;
  // An id of PDF_MARGINS.
  margins: string;
  // Scale of the content in percent.
  scale: number;
}

export const PAPER_SIZES = [
  { id: "system", label: "System", css: null },
  { id: "a4", label: "A4", css: "A4" },
  { id: "a3", label: "A3", css: "A3" },
  { id: "a5", label: "A5", css: "A5" },
  { id: "letter", label: "Letter", css: "letter" },
  { id: "legal", label: "Legal", css: "legal" },
] as const;

// Top and bottom margin, left and right margin, in mm.
export const PDF_MARGINS = [
  { id: "narrow", label: "Narrow", vertical: 8, horizontal: 8 },
  { id: "normal", label: "Normal", vertical: 16, horizontal: 14 },
  { id: "wide", label: "Wide", vertical: 25, horizontal: 25 },
] as const;

export const PDF_SCALE_MIN = 50;
export const PDF_SCALE_MAX = 200;
export const PDF_SCALE_STEP = 5;

export const PDF_DEFAULTS: PdfOptions = { paper: "system", landscape: false, margins: "normal", scale: 100 };

// Returns valid options from stored data. Unknown or missing values take the
// default.
export function normalizePdfOptions(raw: unknown): PdfOptions {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scale = typeof o.scale === "number" && Number.isFinite(o.scale) ? o.scale : PDF_DEFAULTS.scale;
  return {
    paper: PAPER_SIZES.some((p) => p.id === o.paper) ? (o.paper as string) : PDF_DEFAULTS.paper,
    landscape: typeof o.landscape === "boolean" ? o.landscape : PDF_DEFAULTS.landscape,
    margins: PDF_MARGINS.some((m) => m.id === o.margins) ? (o.margins as string) : PDF_DEFAULTS.margins,
    scale: Math.round(Math.min(PDF_SCALE_MAX, Math.max(PDF_SCALE_MIN, scale))),
  };
}

export function pdfMargins(o: PdfOptions): { vertical: number; horizontal: number } {
  return PDF_MARGINS.find((m) => m.id === o.margins) ?? PDF_MARGINS[1];
}

// The CSS `@page` rule of the options.
export function pageRule(o: PdfOptions): string {
  const css = PAPER_SIZES.find((p) => p.id === o.paper)?.css;
  const orientation = o.landscape ? "landscape" : "portrait";
  const size = css ? `${css} ${orientation}` : orientation;
  const m = pdfMargins(o);
  return `@page { size: ${size}; margin: ${m.vertical}mm ${m.horizontal}mm; }`;
}
