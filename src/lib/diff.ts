// Diff of two rendered Markdown documents, shown in the newer document.
//
// The diff compares the block elements of both documents. Equal blocks stay
// unchanged. A changed block with only inline content gets a word diff:
// inserted words in <ins class="diff-ins">, deleted words in
// <del class="diff-del">. Other changed blocks with the same tag are compared
// child by child. Blocks that exist in one document only are marked with the
// classes `diff-added` and `diff-removed`.

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

function wordDiff(oldEl: Element, newEl: Element, imageKey: ImageKey) {
  const oldText = oldEl.textContent ?? "";
  const newText = newEl.textContent ?? "";
  const parts = diffWordsWithSpace(oldText, newText);

  type Op = { kind: "ins"; start: number; end: number } | { kind: "del"; at: number; text: string };
  const ops: Op[] = [];
  let pos = 0;
  for (const p of parts) {
    if (p.added) {
      ops.push({ kind: "ins", start: pos, end: pos + p.value.length });
      pos += p.value.length;
    } else if (p.removed) {
      ops.push({ kind: "del", at: pos, text: p.value });
    } else {
      pos += p.value.length;
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

  // Equal text, but other changes (an image, a link target): mark the block,
  // and outline the changed images.
  if (ops.length === 0) newEl.classList.add("diff-changed");
  const oldImgs = Array.from(oldEl.querySelectorAll("img"));
  const newImgs = Array.from(newEl.querySelectorAll("img"));
  newImgs.forEach((img, i) => {
    if (!oldImgs[i] || imageKey(oldImgs[i]) !== imageKey(img)) img.classList.add("diff-img-changed");
  });
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
    wordDiff(oldEl, newEl, imageKey);
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
