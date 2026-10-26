// PDF.js: loads PDF documents and renders their pages into canvases and text
// layers. The worker of PDF.js parses the documents off the main thread.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy };

// A loaded PDF document with all its pages.
export interface LoadedPdf {
  doc: PDFDocumentProxy;
  pages: PDFPageProxy[];
}

// Loads a PDF document from its bytes. PDF.js takes ownership of the buffer
// that it receives, so it gets a copy and `data` stays usable.
//
// PDF.js keeps the page count of the last loaded document in a global, and
// `getPage` refuses page numbers above it, also for other documents. Thus
// all pages are requested directly after the load, before another document
// can load, and the callers use only these pages.
export async function loadPdf(data: Uint8Array): Promise<LoadedPdf> {
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise;
  const requests = Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1));
  try {
    return { doc, pages: await Promise.all(requests) };
  } catch (e) {
    doc.destroy();
    throw e;
  }
}

// Draws a page into a new canvas at `scale` CSS pixels per point, with the
// resolution of the screen.
export async function renderCanvas(page: PDFPageProxy, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * ratio);
  canvas.height = Math.floor(viewport.height * ratio);
  await page.render({
    canvas,
    canvasContext: canvas.getContext("2d")!,
    viewport,
    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
  }).promise;
  return canvas;
}

// Fills `container` with the selectable text of a page, at `scale` CSS pixels
// per point. The text is transparent and lies on top of the canvas.
export async function renderTextLayer(page: PDFPageProxy, scale: number, container: HTMLElement): Promise<void> {
  const viewport = page.getViewport({ scale });
  const layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
  await layer.render();
}

