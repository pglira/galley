// Diff of two rendered Markdown documents, shown in the newer document.
//
// The diff compares the block elements of both documents. Equal blocks stay
// unchanged. A block with only inline content and changed text shows as the
// old block (class `diff-removed`) followed by the new block (class
// `diff-added`). If the two keep at least half of their text, both get the
// class `diff-pair`, and a word diff marks the deleted text in the old block
// with <del class="diff-del"> and the inserted text in the new block with
// <ins class="diff-ins">. Changes that only short equal text separates form
// one change. Table cells get the deleted and the inserted text inline.
// Other changed blocks with the same tag are compared child by child. Blocks
// that exist in one document only are marked with the classes `diff-added`
// and `diff-removed`.

import { diffArrays, diffWordsWithSpace } from "diff";
import { buildIndex, insertAt, wrapRange } from "@/lib/textRange";

// Returns a key for an image. Images with equal keys are equal.
export type ImageKey = (img: Element) => string;

const INLINE = new Set([
  "A", "ABBR", "B", "BR", "CODE", "DEL", "EM", "I", "IMG", "INPUT", "KBD", "MARK",
  "S", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "U", "INS", "Q", "TIME", "WBR",
]);

// Blocks that a word diff would break. They are compared as a whole.
const ATOMIC = "pre, svg, .katex, .katex-display";

// Content of removed blocks and deleted words. Text in these elements is not
// part of the newer document.
export const REMOVED_SELECTOR = ".diff-removed, .diff-del";

const defaultImageKey: ImageKey = (img) => img.getAttribute("data-src") ?? img.getAttribute("src") ?? "";

function elementKey(el: Element, imageKey: ImageKey): string {
  const clone = el.cloneNode(true) as Element;
  const all = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const origImgs = [el, ...Array.from(el.querySelectorAll("*"))].filter((e) => e.tagName === "IMG");
  let imgIdx = 0;
  for (const e of all) {
    e.removeAttribute("id");
    e.removeAttribute("data-source-map");
    if (e.tagName === "IMG") {
      e.setAttribute("src", imageKey(origImgs[imgIdx++]));
      e.removeAttribute("data-src");
    }
  }
  return clone.outerHTML;
}

function isTextual(el: Element): boolean {
  if (el.matches(ATOMIC) || el.querySelector(ATOMIC)) return false;
  return Array.from(el.querySelectorAll("*")).every((e) => INLINE.has(e.tagName));
}

function markAdded(el: Element) {
  el.classList.add("diff-added");
}

function removedCopy(el: Element): Element {
  el.classList.add("diff-removed");
  return el;
}

// Blocks that cannot show as an old and a new block side by side. They get
// the deleted and the inserted text inline.
const INLINE_DIFF = "td, th";

// Equal text with fewer words than this between two changes joins them.
const MIN_EQUAL_WORDS = 3;
// A text block that keeps less than this part of its text is replaced as a whole.
const MIN_KEPT = 0.5;

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const visibleLength = (s: string) => s.replace(/\s+/g, "").length;

// A run of the word diff: equal text, or a change from `old` to `new`.
type Run = { equal: true; text: string } | { equal: false; old: string; new: string };

// Groups the parts of a word diff into runs. A short equal part between two
// changes becomes part of both the old and the new text of one change.
function groupRuns(parts: { value: string; added?: boolean; removed?: boolean }[]): Run[] {
  const runs: Run[] = [];
  const change = (): Run & { equal: false } => {
    const last = runs[runs.length - 1];
    if (last && !last.equal) return last;
    const run: Run = { equal: false, old: "", new: "" };
    runs.push(run);
    return run;
  };
  parts.forEach((p, i) => {
    if (p.added) change().new += p.value;
    else if (p.removed) change().old += p.value;
    else {
      const last = runs[runs.length - 1];
      const between = last && !last.equal && i < parts.length - 1;
      if (between && wordCount(p.value) < MIN_EQUAL_WORDS) {
        last.old += p.value;
        last.new += p.value;
      } else runs.push({ equal: true, text: p.value });
    }
  });
  return runs;
}

// Wraps each character range of `el` in an element `tag` with class `cls`.
function markRanges(el: Element, ranges: [number, number][], tag: string, cls: string) {
  const doc = el.ownerDocument;
  for (const [start, end] of ranges.reverse()) {
    wrapRange(buildIndex(el), start, end, () => {
      const m = doc.createElement(tag);
      m.className = cls;
      return m;
    });
  }
}

// Marks the changes of `runs` inside `newEl`: the inserted text in
// <ins class="diff-ins">, and the deleted text in <del class="diff-del">
// before it.
function inlineDiff(newEl: Element, runs: Run[]) {
  type Op = { kind: "ins"; start: number; end: number } | { kind: "del"; at: number; text: string };
  const ops: Op[] = [];
  let pos = 0;
  for (const r of runs) {
    if (r.equal) {
      pos += r.text.length;
      continue;
    }
    if (r.old) ops.push({ kind: "del", at: pos, text: r.old });
    if (r.new) {
      ops.push({ kind: "ins", start: pos, end: pos + r.new.length });
      pos += r.new.length;
    }
  }
  const doc = newEl.ownerDocument;
  for (const op of ops.reverse()) {
    const index = buildIndex(newEl, { skip: ".diff-del" });
    if (op.kind === "ins") {
      wrapRange(index, op.start, op.end, () => {
        const ins = doc.createElement("ins");
        ins.className = "diff-ins";
        return ins;
      });
    } else {
      const del = doc.createElement("del");
      del.className = "diff-del";
      del.textContent = op.text;
      if (!insertAt(index, op.at, del, ".diff-ins")) newEl.appendChild(del);
    }
  }
}

// Compares two text blocks with the same tag. A block with changed text
// shows as the old block followed by the new block, with the deleted text
// and the inserted text marked, if the blocks keep at least half of their
// text.
function textDiff(oldEl: Element, newEl: Element, imageKey: ImageKey) {
  const oldText = oldEl.textContent ?? "";
  const newText = newEl.textContent ?? "";
  const runs = groupRuns(diffWordsWithSpace(oldText, newText));

  const oldImgs = Array.from(oldEl.querySelectorAll("img"));
  const newImgs = Array.from(newEl.querySelectorAll("img"));
  newImgs.forEach((img, i) => {
    if (!oldImgs[i] || imageKey(oldImgs[i]) !== imageKey(img)) img.classList.add("diff-img-changed");
  });

  // Equal text, but other changes (an image, a link target): mark the block.
  if (runs.every((r) => r.equal)) {
    newEl.classList.add("diff-changed");
    return;
  }

  if (newEl.matches(INLINE_DIFF)) {
    inlineDiff(newEl, runs);
    return;
  }
  newEl.parentNode!.insertBefore(removedCopy(oldEl), newEl);
  markAdded(newEl);
  const kept = runs.reduce((n, r) => n + (r.equal ? visibleLength(r.text) : 0), 0);
  if (kept < MIN_KEPT * Math.max(visibleLength(oldText), visibleLength(newText))) return;

  oldEl.classList.add("diff-pair");
  newEl.classList.add("diff-pair");
  const deleted: [number, number][] = [];
  const inserted: [number, number][] = [];
  let oldPos = 0;
  let newPos = 0;
  for (const r of runs) {
    if (r.equal) {
      oldPos += r.text.length;
      newPos += r.text.length;
      continue;
    }
    if (r.old.trim()) deleted.push([oldPos, oldPos + r.old.length]);
    if (r.new.trim()) inserted.push([newPos, newPos + r.new.length]);
    oldPos += r.old.length;
    newPos += r.new.length;
  }
  markRanges(oldEl, deleted, "del", "diff-del");
  markRanges(newEl, inserted, "ins", "diff-ins");
}

function diffPair(oldEl: Element, newEl: Element, imageKey: ImageKey) {
  if (oldEl.tagName !== newEl.tagName || newEl.matches(ATOMIC) || oldEl.matches(ATOMIC)) {
    newEl.parentNode!.insertBefore(removedCopy(oldEl), newEl);
    markAdded(newEl);
    return;
  }
  if (newEl.tagName === "IMG") {
    newEl.classList.add("diff-img-changed");
    return;
  }
  if (isTextual(oldEl) && isTextual(newEl)) {
    textDiff(oldEl, newEl, imageKey);
    return;
  }
  diffChildren(oldEl, newEl, imageKey);
}

function diffChildren(oldParent: Element, newParent: Element, imageKey: ImageKey) {
  const oldEls = Array.from(oldParent.children);
  const newEls = Array.from(newParent.children);
  const changes = diffArrays(
    oldEls.map((e) => elementKey(e, imageKey)),
    newEls.map((e) => elementKey(e, imageKey))
  );

  let oi = 0;
  let ni = 0;
  let removed: Element[] = [];
  let added: Element[] = [];

  const flush = () => {
    const n = Math.min(removed.length, added.length);
    for (let i = 0; i < n; i++) diffPair(removed[i], added[i], imageKey);
    for (const el of added.slice(n)) markAdded(el);
    // Extra removed blocks go before the next block of the newer document.
    const anchor = added.length > n ? added[n] : (newEls[ni] ?? null);
    for (const el of removed.slice(n)) {
      if (anchor) newParent.insertBefore(removedCopy(el), anchor);
      else newParent.appendChild(removedCopy(el));
    }
    removed = [];
    added = [];
  };

  for (const c of changes) {
    const count = c.count ?? c.value.length;
    if (c.removed) {
      removed.push(...oldEls.slice(oi, oi + count));
      oi += count;
    } else if (c.added) {
      added.push(...newEls.slice(ni, ni + count));
      ni += count;
    } else {
      flush();
      oi += count;
      ni += count;
    }
  }
  flush();
}

// Returns the HTML of `newHtml` with the differences to `oldHtml` marked.
export function diffHtml(newHtml: string, oldHtml: string, imageKey: ImageKey = defaultImageKey): string {
  const newTpl = document.createElement("template");
  newTpl.innerHTML = newHtml;
  const oldTpl = document.createElement("template");
  oldTpl.innerHTML = oldHtml;
  const newRoot = document.createElement("div");
  newRoot.appendChild(newTpl.content);
  const oldRoot = document.createElement("div");
  oldRoot.appendChild(oldTpl.content);
  diffChildren(oldRoot, newRoot, imageKey);
  return newRoot.innerHTML;
}
