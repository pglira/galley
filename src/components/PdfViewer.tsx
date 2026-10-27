import * as React from "react";
import { usePreferences } from "@/lib/preferences";
import { loadPdf, renderCanvas, renderTextLayer, type LoadedPdf } from "@/lib/pdf";
import { trackSelection } from "@/lib/pdfSelection";
import { diffStreams, itemStream, tokenize, type PdfDiff, type TextItem } from "@/lib/pdfDiff";
import { clearDiff, drawDiff, drawRemoved, layerStream, OLD_PAGE } from "@/lib/pdfDiffLayer";
import { buildIndex, countQuote, findQuote, quoteContext, unwrapAll, wrapRange } from "@/lib/textRange";
import { headingTarget, KEY_TARGETS, navAction, scrollDistance, SPACE_TARGETS } from "@/lib/navigation";
import { textInRect, trackRegion } from "@/lib/region";
import type { Annotation } from "@/lib/annotations";
import type { Content, RegionSelection, TextSelection } from "@/components/Viewer";

interface Props {
  // The content of a PDF document: `pdf` holds its bytes.
  content: Content;
  // The PDF document of the reference snapshot of the diff, or null for no diff.
  compare: Content | null;
  // True to show the pages of the reference document next to the pages.
  sideBySide: boolean;
  annotations: Annotation[];
  activeAnnotation: number | null;
  onSelection: (sel: TextSelection | null) => void;
  onAnnotationClick: (index: number) => void;
  // Receives a region that the user draws with Ctrl and a drag.
  onRegion: (region: RegionSelection) => void;
  // True if the navigation keys move in the document.
  keyNavigation: boolean;
  articleRef?: React.RefObject<HTMLElement | null>;
  onRendered?: () => void;
  onError?: (message: string) => void;
}

const ANNOTATION_SELECTOR = "mark.galley-annotation";
const PAGE_SELECTOR = ".pdf-page";
// Pages within this distance of the view keep their canvas.
const RENDER_MARGIN = "1500px 0px";
// The space between the two columns of the side-by-side view, in pixels.
const COLUMN_GAP = 16;

const scrollMemory = new Map<string, number>();

// The text layer of page `n` (starting at 1).
function textLayer(root: HTMLElement, n: number): HTMLElement | null {
  return root.querySelector<HTMLElement>(`${PAGE_SELECTOR}[data-page="${n}"] .textLayer`);
}

// The page number of the page that contains `node`, or undefined.
function pageOf(node: Node): number | undefined {
  const el = node instanceof Element ? node : node.parentElement;
  const page = el?.closest<HTMLElement>(PAGE_SELECTOR)?.dataset.page;
  return page ? Number(page) : undefined;
}

// The number of the page nearest to the center of `rect`.
function pageAt(root: HTMLElement, rect: DOMRect): number | undefined {
  const cy = (rect.top + rect.bottom) / 2;
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  for (const page of Array.from(root.querySelectorAll<HTMLElement>(PAGE_SELECTOR))) {
    const r = page.getBoundingClientRect();
    const dist = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
    if (dist < bestDist) {
      best = page;
      bestDist = dist;
    }
  }
  return best ? Number(best.dataset.page) : undefined;
}

// Shows the pages of a PDF document. Each page has a canvas with the image
// of the page and a transparent text layer on top, so that text can be
// selected and annotated. Only the pages near the view keep a canvas.
export function PdfViewer({
  content,
  compare,
  sideBySide,
  annotations,
  activeAnnotation,
  onSelection,
  onAnnotationClick,
  onRegion,
  keyNavigation,
  articleRef,
  onRendered,
  onError,
}: Props) {
  const internalRef = React.useRef<HTMLElement>(null);
  const ref = (articleRef ?? internalRef) as React.RefObject<HTMLElement | null>;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const { zoom, paperWidth } = usePreferences();
  const [pdf, setPdf] = React.useState<LoadedPdf | null>(null);
  const [renderNonce, setRenderNonce] = React.useState(0);
  // True when all pages of the shown layout have their text layers.
  const laidOut = React.useRef(false);
  // The inner width of the scroller, in CSS pixels.
  const [viewWidth, setViewWidth] = React.useState(0);
  // The scroll position to restore after the first layout of a document.
  const restoreTop = React.useRef<number | null>(null);

  const callbacks = React.useRef({ onRendered, onSelection, onAnnotationClick, onRegion, onError });
  React.useEffect(() => {
    callbacks.current = { onRendered, onSelection, onAnnotationClick, onRegion, onError };
  }, [onRendered, onSelection, onAnnotationClick, onRegion, onError]);

  // Load the document. The effect below closes it.
  React.useEffect(() => {
    if (!content.pdf) return;
    let cancelled = false;
    loadPdf(content.pdf)
      .then((doc) => {
        if (cancelled) doc.doc.destroy();
        else setPdf(doc);
      })
      .catch((e) => !cancelled && callbacks.current.onError?.(`Cannot open the PDF: ${e?.message ?? e}`));
    return () => {
      cancelled = true;
      // A new version of the same file keeps the scroll position. For another
      // file, the scroll memory sets the position again.
      if (scrollerRef.current) restoreTop.current ??= scrollerRef.current.scrollTop;
      setPdf(null);
    };
  }, [content.pdf]);

  // Follow the width of the view, with a short delay while it changes.
  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      const style = getComputedStyle(el);
      setViewWidth(el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    };
    measure();
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // The reference document of the diff and its text stream. The effect after
  // the layout closes the document.
  const [oldPdf, setOldPdf] = React.useState<LoadedPdf | null>(null);
  const [oldStream, setOldStream] = React.useState<string | null>(null);
  React.useEffect(() => {
    setOldStream(null);
    if (!compare?.pdf) return;
    let cancelled = false;
    (async () => {
      const loaded = await loadPdf(compare.pdf!);
      if (cancelled) return void loaded.doc.destroy();
      setOldPdf(loaded);
      const pages: TextItem[][] = [];
      for (const page of loaded.pages) {
        if (cancelled) return;
        pages.push((await page.getTextContent()).items as TextItem[]);
      }
      if (!cancelled) setOldStream(itemStream(pages));
    })().catch((e) => !cancelled && callbacks.current.onError?.(`Cannot read the reference PDF: ${e?.message ?? e}`));
    return () => {
      cancelled = true;
      setOldPdf(null);
    };
  }, [compare?.pdf]);

  // The reference document shows next to the pages in the side-by-side view.
  const leftPdf = sideBySide ? oldPdf : null;

  // Lay out all pages with their text layers. The canvases render when a
  // page comes near the view. A new scale keeps the relative scroll position.
  React.useEffect(() => {
    const root = ref.current;
    const scroller = scrollerRef.current;
    if (!root || !scroller || viewWidth <= 0) return;
    if (!pdf) {
      laidOut.current = false;
      root.replaceChildren();
      return;
    }
    let cancelled = false;
    laidOut.current = false;
    // CSS pixels per PDF point. The widest page is as wide as the paper of a
    // Markdown document, or as the view if the view is narrower, times the
    // zoom. All pages use the same scale.
    let scale = 1;
    const fraction = scroller.scrollHeight > 0 ? scroller.scrollTop / scroller.scrollHeight : 0;
    root.replaceChildren();
    root.classList.toggle("side-by-side", leftPdf != null);
    const rendering = new Set<HTMLElement>();
    // The pages near the view. A canvas that finishes after its page left the
    // view is dropped.
    const near = new Set<HTMLElement>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const page = (el.dataset.old ? leftPdf : pdf)?.pages[Number(el.dataset.page) - 1];
          const canvas = el.querySelector("canvas");
          if (!entry.isIntersecting) {
            near.delete(el);
            canvas?.remove();
            continue;
          }
          near.add(el);
          if (!page || canvas || rendering.has(el)) continue;
          rendering.add(el);
          renderCanvas(page, scale)
            .then((c) => {
              if (cancelled || !el.isConnected || !near.has(el)) return;
              el.querySelector("canvas")?.remove();
              el.prepend(c);
            })
            .catch(() => {})
            .finally(() => rendering.delete(el));
        }
      },
      { root: scroller, rootMargin: RENDER_MARGIN }
    );
    // A page with its text layer. A page of the reference document has the
    // class of the old pages and no annotations.
    const makePage = (page: LoadedPdf["pages"][number], old: boolean) => {
      const viewport = page.getViewport({ scale });
      const el = document.createElement("div");
      el.className = old ? OLD_PAGE.slice(1) : "pdf-page";
      el.dataset.page = String(page.pageNumber);
      if (old) el.dataset.old = "1";
      el.style.width = `${viewport.width}px`;
      el.style.height = `${viewport.height}px`;
      el.style.setProperty("--scale-factor", String(scale));
      el.style.setProperty("--total-scale-factor", String(scale));
      el.style.setProperty("--scale-round-x", "1px");
      el.style.setProperty("--scale-round-y", "1px");
      const layer = document.createElement("div");
      layer.className = "textLayer";
      el.append(layer);
      return el;
    };
    (async () => {
      const all = pdf.pages;
      const left = leftPdf?.pages ?? [];
      // In the side-by-side view, two pages share the width.
      const width = left.length ? Math.min(paperWidth, (viewWidth - COLUMN_GAP) / 2) : Math.min(paperWidth, viewWidth);
      const widest = Math.max(...[...all, ...left].map((p) => p.getViewport({ scale: 1 }).width));
      scale = (zoom * width) / widest;
      const pages: HTMLElement[] = [];
      const oldPages: HTMLElement[] = [];
      for (let i = 0; i < Math.max(all.length, left.length); i++) {
        if (left.length) {
          const el = left[i] ? makePage(left[i], true) : document.createElement("div");
          if (left[i]) oldPages.push(el);
          root.append(el);
        }
        const el = all[i] ? makePage(all[i], false) : document.createElement("div");
        if (all[i]) pages.push(el);
        root.append(el);
      }
      scroller.scrollTop = restoreTop.current ?? fraction * scroller.scrollHeight;
      restoreTop.current = null;
      const elements = [...pages, ...oldPages];
      const sources = [...all, ...left];
      elements.forEach((el) => observer.observe(el));
      for (const [i, page] of sources.entries()) {
        if (cancelled) return;
        await renderTextLayer(page, scale, elements[i].querySelector(".textLayer")!);
      }
      if (cancelled) return;
      laidOut.current = true;
      setRenderNonce((x) => x + 1);
      callbacks.current.onRendered?.();
    })().catch((e) => !cancelled && callbacks.current.onError?.(`Cannot show the PDF: ${e?.message ?? e}`));
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // `ref` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, leftPdf, zoom, paperWidth, viewWidth]);

  // Close a document when it is replaced. These effects come after the
  // layout, so that the layout of a document stops before the document closes.
  React.useEffect(() => () => void pdf?.doc.destroy(), [pdf]);
  React.useEffect(() => () => void oldPdf?.doc.destroy(), [oldPdf]);

  // Mark the quotes of the annotations. A quote is searched on its page
  // first, then in the full document.
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    unwrapAll(root, ANNOTATION_SELECTOR);
    annotations.forEach((a, i) => {
      if (!a.quote || a.image || a.region || a.checked !== undefined || a.answer) return;
      const layer = a.page ? textLayer(root, a.page) : null;
      let index = layer ? buildIndex(layer, { dropWhitespace: true }) : null;
      let range = index ? findQuote(index, a.quote, a.context) : null;
      if (!range) {
        index = buildIndex(root, { dropWhitespace: true, skip: OLD_PAGE });
        range = findQuote(index, a.quote, a.context);
      }
      if (!index || !range) return;
      wrapRange(index, range[0], range[1], () => {
        const m = document.createElement("mark");
        m.className = i === activeAnnotation ? "galley-annotation active" : "galley-annotation";
        m.dataset.annotation = String(i);
        return m;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderNonce, annotations, activeAnnotation]);

  // Show the word diff against the reference document. The comparison runs
  // again only if one of the two texts changes; a new layout only moves the
  // marks. In the side-by-side view, the old pages mark the removed words.
  const diffCache = React.useRef<{ oldStream: string; newStream: string; diff: PdfDiff | null } | null>(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (!oldStream) {
      clearDiff(root);
      return;
    }
    if (!laidOut.current) return;
    const dom = layerStream(root);
    const oldDom = root.querySelector(OLD_PAGE) ? layerStream(root, OLD_PAGE) : null;
    // The text of the old pages is the same as the stream of the reference
    // document; the token indices of the diff then apply to the old pages.
    const old = oldDom?.text ?? oldStream;
    let cache = diffCache.current;
    if (!cache || cache.oldStream !== old || cache.newStream !== dom.text) {
      cache = { oldStream: old, newStream: dom.text, diff: diffStreams(old, dom.text) };
      diffCache.current = cache;
      if (!cache.diff) callbacks.current.onError?.("The documents differ too much for a diff.");
    }
    if (!cache.diff) return;
    drawDiff(root, dom, tokenize(dom.text), cache.diff);
    if (oldDom) drawRemoved(oldDom, tokenize(oldDom.text), cache.diff);
    // `ref` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderNonce, oldStream]);

  // Report text selections and clicks on annotation marks.
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onMouseUp = (e: MouseEvent) => {
      // Read the selection after the browser updates it.
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return callbacks.current.onSelection(null);
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) return callbacks.current.onSelection(null);
        const quote = sel.toString().replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
        if (!quote) return callbacks.current.onSelection(null);
        const page = pageOf(range.startContainer);
        const layer = page ? textLayer(root, page) : null;
        const index = buildIndex(layer ?? root, { dropWhitespace: true, skip: OLD_PAGE });
        const context = countQuote(index, quote) > 1 ? quoteContext(range) : "";
        callbacks.current.onSelection({
          quote,
          ...(context && { context }),
          ...(page && { page }),
          rect: range.getBoundingClientRect(),
          ...(e.altKey && { annotate: true }),
        });
      }, 0);
    };
    const onClick = (e: MouseEvent) => {
      const mark = (e.target as Element).closest?.(ANNOTATION_SELECTOR) as HTMLElement | null;
      if (mark?.dataset.annotation && !window.getSelection()?.toString()) {
        callbacks.current.onAnnotationClick(Number(mark.dataset.annotation));
      }
    };
    root.addEventListener("mouseup", onMouseUp);
    root.addEventListener("click", onClick);
    const scroller = scrollerRef.current!;
    const untrack = trackSelection(root, scroller);
    // Ctrl and a drag draw a region in the visible part of the pages.
    const untrackRegion = trackRegion(
      root,
      () => scroller.getBoundingClientRect(),
      (rect) => callbacks.current.onRegion({ rect, context: textInRect(root, rect, OLD_PAGE), page: pageAt(root, rect) })
    );
    return () => {
      untrack();
      untrackRegion();
      root.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move in the document with the navigation keys. The heading keys move by
  // pages.
  React.useEffect(() => {
    if (!keyNavigation) return;
    const onKey = (e: KeyboardEvent) => {
      const action = navAction(e);
      const scroller = scrollerRef.current;
      const root = ref.current;
      if (!action || e.defaultPrevented || !scroller || !root) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(KEY_TARGETS)) return;
      if (e.key === " " && target?.closest(SPACE_TARGETS)) return;
      e.preventDefault();
      if (action === "top") {
        scroller.scrollTop = 0;
      } else if (action === "bottom") {
        scroller.scrollTop = scroller.scrollHeight;
      } else if (action === "nextHeading" || action === "prevHeading") {
        const viewTop = scroller.getBoundingClientRect().top;
        const tops = Array.from(root.querySelectorAll(PAGE_SELECTOR)).map((p) => p.getBoundingClientRect().top - viewTop);
        const i = headingTarget(tops, action === "nextHeading" ? 1 : -1);
        if (i >= 0) scroller.scrollTop += tops[i];
      } else {
        scroller.scrollTop += scrollDistance(action, scroller.clientHeight, 24);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // `ref` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyNavigation]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    restoreTop.current = scrollMemory.get(content.filePath) ?? 0;
    const onScroll = () => scrollMemory.set(content.filePath, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [content.filePath]);

  return (
    <div ref={scrollerRef} className="h-full w-full overflow-auto px-6">
      <article ref={ref} className="pdf-body" />
    </div>
  );
}
