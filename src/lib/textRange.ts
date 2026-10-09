// Character-level access to the text of a DOM subtree: find text, wrap a
// range of characters in elements, and insert elements at a character.

export interface TextIndex {
  text: string;
  // For each character of `text`: its text node and offset in that node.
  nodes: Text[];
  offsets: number[];
}

export interface IndexOptions {
  // Leave out text nodes inside elements that match this selector.
  skip?: string;
  // Leave out whitespace characters.
  dropWhitespace?: boolean;
}

export function buildIndex(root: Node, opts: IndexOptions = {}): TextIndex {
  const nodes: Text[] = [];
  const offsets: number[] = [];
  let text = "";
  const visit = (n: Node) => {
    if (n.nodeType === 3) {
      const t = n as Text;
      for (let i = 0; i < t.data.length; i++) {
        if (opts.dropWhitespace && /\s/.test(t.data[i])) continue;
        text += t.data[i];
        nodes.push(t);
        offsets.push(i);
      }
      return;
    }
    if (n.nodeType === 1 && opts.skip && (n as Element).matches(opts.skip)) return;
    for (let c = n.firstChild; c; c = c.nextSibling) visit(c);
  };
  visit(root);
  return { text, nodes, offsets };
}

// Wraps the characters [start, end) of `index` in elements made by `make`.
// Each text node in the range gets its own wrapper. Whitespace-only pieces
// are left unwrapped. Returns the wrappers in document order.
export function wrapRange(
  index: TextIndex,
  start: number,
  end: number,
  make: () => HTMLElement
): HTMLElement[] {
  if (end <= start) return [];
  // Collect [node, from, to) segments, in document order.
  const segments: { node: Text; from: number; to: number }[] = [];
  for (let i = start; i < end; i++) {
    const node = index.nodes[i];
    const off = index.offsets[i];
    const last = segments[segments.length - 1];
    if (last && last.node === node) last.to = off + 1;
    else segments.push({ node, from: off, to: off + 1 });
  }
  const out: HTMLElement[] = [];
  for (const seg of segments.reverse()) {
    let node = seg.node;
    if (seg.to < node.data.length) node.splitText(seg.to);
    if (seg.from > 0) node = node.splitText(seg.from);
    if (!node.data.trim()) continue;
    const el = make();
    node.parentNode!.insertBefore(el, node);
    el.appendChild(node);
    out.push(el);
  }
  return out.reverse();
}

// Inserts `el` before the character at `pos` of `index`, or after the last
// character if `pos` equals the text length. If the character is the first
// one of an element that matches `outside`, `el` goes before that element.
export function insertAt(index: TextIndex, pos: number, el: HTMLElement, outside?: string): boolean {
  if (index.nodes.length === 0) return false;
  if (pos >= index.text.length) {
    const node = index.nodes[index.nodes.length - 1];
    const off = index.offsets[index.offsets.length - 1] + 1;
    if (off < node.data.length) node.splitText(off);
    const wrapper = outside ? node.parentElement?.closest(outside) : null;
    const after = wrapper ?? node;
    after.parentNode!.insertBefore(el, after.nextSibling);
    return true;
  }
  let node = index.nodes[pos];
  const off = index.offsets[pos];
  if (off > 0) node = node.splitText(off);
  const parent = node.parentElement;
  const wrapper = outside && parent?.matches(outside) && parent.firstChild === node ? parent : null;
  const before = wrapper ?? node;
  before.parentNode!.insertBefore(el, before);
  return true;
}

// Finds `quote` in `index`, ignoring whitespace in both. `index` must be
// built with `dropWhitespace`. Returns the character range or null.
export function findQuote(index: TextIndex, quote: string): [number, number] | null {
  const needle = quote.replace(/\s+/g, "");
  if (!needle) return null;
  const at = index.text.indexOf(needle);
  return at < 0 ? null : [at, at + needle.length];
}

// Removes the wrappers that match `selector` and keeps their content.
export function unwrapAll(root: Element, selector: string): void {
  for (const el of Array.from(root.querySelectorAll(selector))) {
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  }
}
