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
import { buildIndex, countQuote, findQuote, quoteContext, unwrapAll, wrapRange, type TextIndex } from "@/lib/textRange";
import type { Annotation } from "@/lib/annotations";

// The text of the document in a snapshot.
export interface Content {
  source: string;
  filePath: string;
  // The load generation of the content. Its images load with this version.
  version: number;
}

export interface TextSelection {
  quote: string;
  // The text around the quote, if the quote is not unique in the document.
  context?: string;
  rect: DOMRect;
  // True for a selection of only removed text of the diff. It has no quote:
  // the removed text is not part of the snapshot that the annotations are for.
  removed?: boolean;
}

// An image of the shown document.
export interface DocImage {
  src: string;
  alt: string;
  // The image path as it is written in the document.
  path: string;
  // True for an image that shows only as removed text of the diff.
  removed: boolean;
}

// A checkbox of a task list in the shown document.
export interface Choice {
  // The text of the option.
  text: string;
  // The text before the list, or the text of the parent item of a nested list.
  question: string;
  // The state of the checkbox in the document.
  checked: boolean;
}

export interface ViewerHandle {
  // Exports the document as it shows (with the diff, if on) as a PDF on white
  // paper. Returns the path of the saved file, or null.
  exportPdf: (name: string) => Promise<string | null>;
}

interface Props {
  content: Content;
  // The reference document of the diff, or null for no diff.
  compare: Content | null;
  // Content hash of each image, keyed by its asset URL.
  imageHashes: Record<string, string>;
  annotations: Annotation[];
  activeAnnotation: number | null;
  onSelection: (sel: TextSelection | null) => void;
  onAnnotationClick: (index: number) => void;
  // Receives all images of the shown document and the index of the clicked one.
  onImageClick: (images: DocImage[], index: number) => void;
  // Receives a click on a checkbox of the document.
  onCheck: (choice: Choice) => void;
  // Receives the new text of a text field of the document and its question.
  onAnswer: (question: string, text: string) => void;
  articleRef?: React.RefObject<HTMLElement | null>;
  handleRef?: React.Ref<ViewerHandle>;
  onRendered?: () => void;
}

const ANNOTATION_SELECTOR = "mark.galley-annotation";
const IMAGE_MARK = "galley-annotated-image";
const CHECKBOX_SELECTOR = "input.task-list-item-checkbox";
const CHOICE_MARK = "galley-choice";
const CHOICE_ITEM = "galley-choice-item";
const ANSWER_SELECTOR = ".galley-answer > textarea";
const MAX_QUESTION = 300;

// The text of an element without its nested lists and the removed text of the diff.
function ownText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(`ul, ol, ${REMOVED_SELECTOR}`).forEach((e) => e.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

// The question of a block: the text of the previous block with text, or the
// text of the parent list item.
function questionOf(block: Element): string {
  let before = block.previousElementSibling;
  while (before && (before.matches(REMOVED_SELECTOR) || !ownText(before))) before = before.previousElementSibling;
  if (!before && block.parentElement?.tagName === "LI") before = block.parentElement;
  const question = before ? ownText(before) : "";
  return question.length > MAX_QUESTION ? `${question.slice(0, MAX_QUESTION - 1)}…` : question;
}

function choiceOf(box: HTMLInputElement): Choice {
  const item = box.closest("li");
  const list = item?.parentElement;
  return { text: item ? ownText(item) : "", question: list ? questionOf(list) : "", checked: box.hasAttribute("checked") };
}

// The checkboxes of the newer document, with their choices.
function docChoices(root: HTMLElement): { el: HTMLInputElement; choice: Choice }[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>(CHECKBOX_SELECTOR))
    .filter((el) => !el.closest(REMOVED_SELECTOR))
    .map((el) => ({ el, choice: choiceOf(el) }));
}

// The text fields of the newer document, with their questions.
function docAnswers(root: HTMLElement): { el: HTMLTextAreaElement; question: string }[] {
  return Array.from(root.querySelectorAll<HTMLTextAreaElement>(ANSWER_SELECTOR))
    .filter((el) => !el.closest(REMOVED_SELECTOR))
    .map((el) => ({ el, question: questionOf(el.parentElement!) }));
}

// Returns the index of the answer annotation for a question, or -1.
export function findAnswer(annotations: Annotation[], question: string): number {
  return annotations.findIndex((a) => a.answer && a.quote === question);
}

// Returns the index of the first checkbox annotation with the option and the
// question of a choice, or -1.
export function findChoice(annotations: Annotation[], choice: Choice): number {
  return annotations.findIndex(
    (a) => a.checked !== undefined && a.quote === choice.text && (a.context ?? "") === choice.question
  );
}

function docImages(root: HTMLElement): { el: HTMLImageElement; image: DocImage }[] {
  return Array.from(root.querySelectorAll("img")).map((el) => ({
    el,
    image: {
      src: el.currentSrc || el.src,
      alt: el.alt,
      path: el.getAttribute("data-src") ?? "",
      removed: el.closest(REMOVED_SELECTOR) != null,
    },
  }));
}

const scrollMemory = new Map<string, number>();

// Text that is the same in the plain and in the diff view of a document, and
// before and after `enhance`.
const ANCHOR_SKIP = `${REMOVED_SELECTOR}, pre, svg, button, .mermaid-block`;

// A character of the newer document and its distance from the top of the
// scroller. The character is an index into the anchor text of the article.
interface ScrollAnchor {
  pos: number;
  offset: number;
}

function charRect(index: TextIndex, i: number): DOMRect {
  const range = document.createRange();
  range.setStart(index.nodes[i], index.offsets[i]);
  range.setEnd(index.nodes[i], index.offsets[i] + 1);
  return range.getBoundingClientRect();
}

// Returns the first character of the anchor text that shows at or below the
// top of the scroller, or null if the scroller is at the top.
function captureAnchor(scroller: HTMLElement, root: HTMLElement): ScrollAnchor | null {
  if (scroller.scrollTop === 0) return null;
  const index = buildIndex(root, { dropWhitespace: true, skip: ANCHOR_SKIP });
  const top = scroller.getBoundingClientRect().top;
  let lo = 0;
  let hi = index.nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (charRect(index, mid).bottom > top) hi = mid;
    else lo = mid + 1;
  }
  if (lo === index.nodes.length) return null;
  return { pos: lo, offset: charRect(index, lo).top - top };
}

// Scrolls so that the character of `anchor` is at its distance from the top.
function restoreAnchor(scroller: HTMLElement, root: HTMLElement, anchor: ScrollAnchor) {
  const index = buildIndex(root, { dropWhitespace: true, skip: ANCHOR_SKIP });
  if (anchor.pos >= index.nodes.length) return;
  const top = scroller.getBoundingClientRect().top;
  scroller.scrollTop += charRect(index, anchor.pos).top - top - anchor.offset;
}

function imageResolver(content: Content) {
  return (src: string) => (isRelativePath(src) ? assetUrl(resolveRelative(content.filePath, src), content.version) : src);
}

export function Viewer({
  content,
  compare,
  imageHashes,
  annotations,
  activeAnnotation,
  onSelection,
  onAnnotationClick,
  onImageClick,
  onCheck,
  onAnswer,
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
  const callbacks = React.useRef({ onRendered, onSelection, onAnnotationClick, onImageClick, onCheck, onAnswer });
  React.useEffect(() => {
    callbacks.current = { onRendered, onSelection, onAnnotationClick, onImageClick, onCheck, onAnswer };
  }, [onRendered, onSelection, onAnnotationClick, onImageClick, onCheck, onAnswer]);

  const html = React.useMemo(() => {
    const current = renderMarkdown(content.source, imageResolver(content));
    if (!compare) return current;
    const old = renderMarkdown(compare.source, imageResolver(compare));
    const imageKey = (img: Element) =>
      `${img.getAttribute("data-src") ?? ""}#${imageHashes[img.getAttribute("src") ?? ""] ?? ""}`;
    return diffHtml(current, old, imageKey);
  }, [content, compare, imageHashes]);

  // New HTML for the same document (diff on or off, a reload) keeps the text
  // at the top of the scroller in its place. The anchor is read from the DOM
  // before React replaces the HTML, and applied after the new HTML and again
  // after `enhance`, which changes the height of code blocks and diagrams.
  const shown = React.useRef({ html, filePath: content.filePath });
  const anchor = React.useRef<ScrollAnchor | null>(null);
  if (html !== shown.current.html && content.filePath === shown.current.filePath) {
    if (scrollerRef.current && ref.current) anchor.current = captureAnchor(scrollerRef.current, ref.current);
  }
  React.useLayoutEffect(() => {
    if (content.filePath !== shown.current.filePath) anchor.current = null;
    shown.current = { html, filePath: content.filePath };
    if (anchor.current && scrollerRef.current && ref.current) {
      restoreAnchor(scrollerRef.current, ref.current, anchor.current);
    }
    // `ref` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

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
      if (anchor.current && scrollerRef.current) {
        restoreAnchor(scrollerRef.current, root, anchor.current);
        anchor.current = null;
      }
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
    const images = docImages(root).filter((d) => !d.image.removed);
    images.forEach(({ el }) => el.classList.remove(IMAGE_MARK, "active"));
    // Removed checkboxes and text fields of the diff are not part of the snapshot.
    root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`${CHECKBOX_SELECTOR}, ${ANSWER_SELECTOR}`).forEach((el) => {
      if (el.closest(REMOVED_SELECTOR)) el.disabled = true;
    });
    // Each text field shows its answer. A text field in use keeps its text.
    for (const { el, question } of docAnswers(root)) {
      const i = findAnswer(annotations, question);
      if (el !== document.activeElement) el.value = i >= 0 ? annotations[i].comment : "";
      el.parentElement!.classList.toggle("active", i >= 0 && i === activeAnnotation);
      if (i >= 0) el.parentElement!.setAttribute("data-annotation", String(i));
      else el.parentElement!.removeAttribute("data-annotation");
    }
    // Each checkbox shows the state that the reviewer set, else the state in the document.
    for (const { el, choice } of docChoices(root)) {
      const item = el.closest("li");
      el.classList.remove(CHOICE_MARK, "active");
      item?.classList.remove(CHOICE_ITEM);
      item?.removeAttribute("data-annotation");
      const i = findChoice(annotations, choice);
      el.checked = i >= 0 ? annotations[i].checked! : choice.checked;
      if (i < 0) continue;
      el.classList.add(CHOICE_MARK);
      if (i === activeAnnotation) el.classList.add("active");
      item?.classList.add(CHOICE_ITEM);
      item?.setAttribute("data-annotation", String(i));
    }
    annotations.forEach((a, i) => {
      if (a.image) {
        // The first image with the path carries the mark.
        const el = images.find((d) => d.image.path === a.image)?.el;
        if (!el) return;
        el.classList.add(IMAGE_MARK);
        if (i === activeAnnotation) el.classList.add("active");
        return;
      }
      if (!a.quote || a.checked !== undefined || a.answer) return;
      const index = buildIndex(root, { dropWhitespace: true, skip: `${REMOVED_SELECTOR}, svg` });
      const range = findQuote(index, a.quote, a.context);
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
    const onMouseUp = (e: MouseEvent) => {
      if ((e.target as Element).closest?.("textarea")) return;
      // Read the selection after the browser updates it.
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return callbacks.current.onSelection(null);
        const range = sel.getRangeAt(0);
        if (!root.contains(range.commonAncestorContainer)) return callbacks.current.onSelection(null);
        const onlyRemoved = () =>
          callbacks.current.onSelection({ quote: "", removed: true, rect: range.getBoundingClientRect() });
        const ancestor = range.commonAncestorContainer;
        const ancestorEl = ancestor instanceof Element ? ancestor : ancestor.parentElement;
        if (ancestorEl?.closest(REMOVED_SELECTOR)) return onlyRemoved();
        const frag = range.cloneContents();
        const removed = frag.querySelectorAll(REMOVED_SELECTOR);
        removed.forEach((e) => e.remove());
        const raw = removed.length > 0 ? (frag.textContent ?? "") : sel.toString();
        const quote = raw.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
        if (!quote) return removed.length > 0 ? onlyRemoved() : callbacks.current.onSelection(null);
        const skip = `${REMOVED_SELECTOR}, svg`;
        const index = buildIndex(root, { dropWhitespace: true, skip });
        const context = countQuote(index, quote) > 1 ? quoteContext(range, skip) : "";
        callbacks.current.onSelection({ quote, ...(context && { context }), rect: range.getBoundingClientRect() });
      }, 0);
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.matches(CHECKBOX_SELECTOR)) {
        // The annotations set the state of the checkbox.
        e.preventDefault();
        // The browser resets the checkbox after the click, so the new state applies later.
        const choice = choiceOf(target as HTMLInputElement);
        if (!target.closest(REMOVED_SELECTOR)) setTimeout(() => callbacks.current.onCheck(choice), 0);
        return;
      }
      if (target.tagName === "IMG" && !window.getSelection()?.toString()) {
        e.preventDefault();
        const images = docImages(root);
        const index = images.findIndex((d) => d.el === target);
        callbacks.current.onImageClick(images.map((d) => d.image), index);
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
      const mark = (e.target as Element).closest?.(`${ANNOTATION_SELECTOR}, li.${CHOICE_ITEM}`) as HTMLElement | null;
      if (mark?.dataset.annotation) callbacks.current.onAnnotationClick(Number(mark.dataset.annotation));
    };
    const onChange = (e: Event) => {
      const el = e.target as HTMLTextAreaElement;
      if (!el.matches(ANSWER_SELECTOR) || el.closest(REMOVED_SELECTOR)) return;
      callbacks.current.onAnswer(questionOf(el.parentElement!), el.value);
    };
    // Ctrl+Enter in a text field saves the answer.
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && el.matches(ANSWER_SELECTOR)) el.blur();
    };
    root.addEventListener("mouseup", onMouseUp);
    root.addEventListener("click", onClick);
    root.addEventListener("change", onChange);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("click", onClick);
      root.removeEventListener("change", onChange);
      root.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = scrollMemory.get(content.filePath) ?? 0;
    const onScroll = () => scrollMemory.set(content.filePath, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [content.filePath]);

  // Intercept copy events to write original markdown source to clipboard.
  React.useEffect(() => {
    const root = ref.current;
    if (!root || !copyAsMarkdown || compare) return;
    const onCopy = (e: ClipboardEvent) => {
      // Text fields copy their own text.
      if ((e.target as Element).closest?.("textarea")) return;
      handleCopyAsMarkdown(e, root as HTMLElement, content.source);
    };
    root.addEventListener("copy", onCopy);
    return () => root.removeEventListener("copy", onCopy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content.source, copyAsMarkdown, compare]);

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
