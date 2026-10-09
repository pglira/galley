import * as React from "react";
import { renderMarkdown } from "@/lib/markdown";
import { enhance } from "@/lib/enhance";
import { exportPdf } from "@/lib/print";
import { handleCopyAsMarkdown } from "@/lib/copyAsMarkdown";
import { useTheme } from "@/lib/theme";
import { usePreferences } from "@/lib/preferences";
import { isRelativePath, resolveRelative } from "@/lib/paths";
import { assetUrl, openUrl } from "@/lib/tauri";
import { diffHtml, REMOVED_SELECTOR } from "@/lib/diff";
import { buildIndex, findQuote, unwrapAll, wrapRange } from "@/lib/textRange";
import type { Annotation } from "@/lib/annotations";

export interface Document {
  source: string;
  filePath: string;
}

export interface TextSelection {
  quote: string;
  rect: DOMRect;
}

export interface ViewerHandle {
  // Exports the report as it shows (with the diff, if on) as a PDF on white
  // paper. Returns the path of the saved file, or null.
  exportPdf: (name: string) => Promise<string | null>;
}

interface Props {
  doc: Document;
  // The reference document of the diff, or null for no diff.
  compare: Document | null;
  // Content hash of each image, keyed by its asset URL.
  imageHashes: Record<string, string>;
  annotations: Annotation[];
  activeAnnotation: number | null;
  onSelection: (sel: TextSelection | null) => void;
  onAnnotationClick: (index: number) => void;
  onImageClick: (src: string, alt: string) => void;
  articleRef?: React.RefObject<HTMLElement | null>;
  handleRef?: React.Ref<ViewerHandle>;
  onRendered?: () => void;
}

const ANNOTATION_SELECTOR = "mark.galley-annotation";

const scrollMemory = new Map<string, number>();

function imageResolver(filePath: string) {
  return (src: string) => (isRelativePath(src) ? assetUrl(resolveRelative(filePath, src)) : src);
}

export function Viewer({
  doc,
  compare,
  imageHashes,
  annotations,
  activeAnnotation,
  onSelection,
  onAnnotationClick,
  onImageClick,
  articleRef,
  handleRef,
  onRendered,
}: Props) {
  const internalRef = React.useRef<HTMLElement>(null);
  const ref = (articleRef ?? internalRef) as React.RefObject<HTMLElement | null>;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const { paper, resolved } = useTheme();
  const { copyAsMarkdown, zoom, paperWidth } = usePreferences();
  const [renderNonce, setRenderNonce] = React.useState(0);

  // Keep callbacks fresh without making them effect dependencies.
  const callbacks = React.useRef({ onRendered, onSelection, onAnnotationClick, onImageClick });
  React.useEffect(() => {
    callbacks.current = { onRendered, onSelection, onAnnotationClick, onImageClick };
  }, [onRendered, onSelection, onAnnotationClick, onImageClick]);

  const html = React.useMemo(() => {
    const current = renderMarkdown(doc.source, imageResolver(doc.filePath));
    if (!compare) return current;
    const old = renderMarkdown(compare.source, imageResolver(compare.filePath));
    const imageKey = (img: Element) =>
      `${img.getAttribute("data-src") ?? ""}#${imageHashes[img.getAttribute("src") ?? ""] ?? ""}`;
    return diffHtml(current, old, imageKey);
  }, [doc, compare, imageHashes]);

  // Highlight code and render diagrams after each new HTML. A new paper tone
  // restores the plain HTML first, so that code and diagrams get the colors
  // of the new tone.
  const renderedTone = React.useRef(resolved);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (renderedTone.current !== resolved) {
      renderedTone.current = resolved;
      root.innerHTML = html;
    }
    let cancelled = false;
    enhance(root, resolved, () => cancelled).then((done) => {
      if (!done) return;
      setRenderNonce((n) => n + 1);
      callbacks.current.onRendered?.();
    });
    return () => {
      cancelled = true;
    };
    // `ref` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, resolved]);

  // Mark the quotes of the annotations.
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    unwrapAll(root, ANNOTATION_SELECTOR);
    annotations.forEach((a, i) => {
      if (!a.quote) return;
      const index = buildIndex(root, { dropWhitespace: true, skip: `${REMOVED_SELECTOR}, svg` });
      const range = findQuote(index, a.quote);
      if (!range) return;
      wrapRange(index, range[0], range[1], () => {
        const m = document.createElement("mark");
        m.className = i === activeAnnotation ? "galley-annotation active" : "galley-annotation";
        m.dataset.annotation = String(i);
        return m;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderNonce, annotations, activeAnnotation]);

  // Report text selections and clicks on annotation marks.
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onMouseUp = () => {
      // Read the selection after the browser updates it.
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return callbacks.current.onSelection(null);
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) return callbacks.current.onSelection(null);
        const frag = range.cloneContents();
        const removed = frag.querySelectorAll(REMOVED_SELECTOR);
        removed.forEach((e) => e.remove());
        const raw = removed.length > 0 ? (frag.textContent ?? "") : sel.toString();
        const quote = raw.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
        if (!quote) return callbacks.current.onSelection(null);
        callbacks.current.onSelection({ quote, rect: range.getBoundingClientRect() });
      }, 0);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.tagName === "IMG" && !window.getSelection()?.toString()) {
        e.preventDefault();
        const img = target as HTMLImageElement;
        callbacks.current.onImageClick(img.currentSrc || img.src, img.alt);
        return;
      }
      // Links never navigate the webview. Anchors scroll, web and mail links
      // open outside Galley, and all other links do nothing.
      const link = target.closest?.("a[href]") as HTMLAnchorElement | null;
      if (link) {
        e.preventDefault();
        const href = link.getAttribute("href") ?? "";
        if (href.startsWith("#")) {
          const id = decodeURIComponent(href.slice(1));
          root.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" });
        } else if (/^(https?|mailto):/i.test(href)) {
          openUrl(href).catch(() => {});
        }
        return;
      }
      const mark = (e.target as Element).closest?.(ANNOTATION_SELECTOR) as HTMLElement | null;
      if (mark?.dataset.annotation) callbacks.current.onAnnotationClick(Number(mark.dataset.annotation));
    };
    root.addEventListener("mouseup", onMouseUp);
    root.addEventListener("click", onClick);
    return () => {
      root.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("click", onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = scrollMemory.get(doc.filePath) ?? 0;
    const onScroll = () => scrollMemory.set(doc.filePath, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [doc.filePath]);

  // Intercept copy events to write original markdown source to clipboard.
  React.useEffect(() => {
    const root = ref.current;
    if (!root || !copyAsMarkdown || compare) return;
    const onCopy = (e: ClipboardEvent) => handleCopyAsMarkdown(e, root as HTMLElement, doc.source);
    root.addEventListener("copy", onCopy);
    return () => root.removeEventListener("copy", onCopy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.source, copyAsMarkdown, compare]);

  React.useImperativeHandle(handleRef, () => ({ exportPdf: (name) => exportPdf(html, name) }), [html]);

  // A stable object, so that React sets innerHTML only when the HTML changes.
  // Otherwise each re-render would remove the highlighting and the marks.
  const dangerousHtml = React.useMemo(() => ({ __html: html }), [html]);

  return (
    <div ref={scrollerRef} className="h-full w-full overflow-auto px-6">
      <div
        className={`paper paper-${resolved}`}
        style={
          { "--paper": paper, "--doc-zoom": zoom, "--paper-width": `${paperWidth}px` } as React.CSSProperties
        }
      >
        <article ref={ref} className="markdown-body" dangerouslySetInnerHTML={dangerousHtml} />
      </div>
    </div>
  );
}
