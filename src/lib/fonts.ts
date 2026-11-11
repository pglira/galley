// The fonts that the user can choose for the rendered document. `scale`
// evens out the x-height, so that all fonts read at about the same size.
export interface DocFont {
  id: string;
  name: string;
  family: string;
  kind: "sans" | "serif";
  scale: number;
}

export const DOC_FONTS: DocFont[] = [
  { id: "inter", name: "Inter", family: '"Inter Variable", sans-serif', kind: "sans", scale: 1 },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", family: '"IBM Plex Sans Variable", sans-serif', kind: "sans", scale: 1 },
  { id: "source-sans-3", name: "Source Sans 3", family: '"Source Sans 3 Variable", sans-serif', kind: "sans", scale: 1.07 },
  { id: "noto-sans", name: "Noto Sans", family: '"Noto Sans Variable", sans-serif', kind: "sans", scale: 1 },
  { id: "fira-sans", name: "Fira Sans", family: '"Fira Sans", sans-serif', kind: "sans", scale: 1 },
  { id: "public-sans", name: "Public Sans", family: '"Public Sans Variable", sans-serif', kind: "sans", scale: 1 },
  { id: "source-serif-4", name: "Source Serif 4", family: '"Source Serif 4 Variable", serif', kind: "serif", scale: 1.07 },
  { id: "literata", name: "Literata", family: '"Literata Variable", serif', kind: "serif", scale: 1.03 },
  { id: "merriweather", name: "Merriweather", family: '"Merriweather Variable", serif', kind: "serif", scale: 0.95 },
  { id: "noto-serif", name: "Noto Serif", family: '"Noto Serif Variable", serif', kind: "serif", scale: 1 },
  { id: "ibm-plex-serif", name: "IBM Plex Serif", family: '"IBM Plex Serif", serif', kind: "serif", scale: 1 },
];

// The groups of the font menu, in menu order.
export const DOC_FONT_KINDS: { kind: DocFont["kind"]; label: string }[] = [
  { kind: "sans", label: "Sans serif" },
  { kind: "serif", label: "Serif" },
];

export const DOC_FONT_DEFAULT = "inter";

// The document font with the id `id`, or the default font for an unknown id.
export function docFont(id: string): DocFont {
  return DOC_FONTS.find((f) => f.id === id) ?? DOC_FONTS[0];
}
