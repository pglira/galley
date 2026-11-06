import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import deflist from "markdown-it-deflist";
import mark from "markdown-it-mark";
import frontMatter from "markdown-it-front-matter";
import katex from "@vscode/markdown-it-katex";
import type Katex from "katex";
import { renderMath } from "@/lib/math";
import DOMPurify from "dompurify";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
});

md.use(anchor, {
  permalink: anchor.permalink.linkInsideHeader({
    symbol: "#",
    placement: "before",
    ariaHidden: true,
  }),
  slugify: (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-"),
});
md.use(footnote);
md.use(taskLists, { enabled: true, label: false });
// Definition lists (`Term` and `: Definition` on the next line) and
// highlighted text (`==text==`).
md.use(deflist);
md.use(mark);

// GitHub alerts: a block quote whose first line is `[!NOTE]`, `[!TIP]`,
// `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]` renders as
// <div class="markdown-alert markdown-alert-<kind>">. The title of the alert
// comes from CSS, so it is not part of the text of the document.
const ALERT = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i;

md.core.ruler.after("block", "alerts", (state) => {
  const tokens = state.tokens;
  for (let i = 0; i + 2 < tokens.length; i++) {
    const open = tokens[i];
    const inline = tokens[i + 2];
    if (open.type !== "blockquote_open" || tokens[i + 1].type !== "paragraph_open" || inline.type !== "inline") continue;
    const match = ALERT.exec(inline.content);
    if (!match) continue;
    let depth = 0;
    let j = i;
    for (; j < tokens.length; j++) {
      if (tokens[j].type === "blockquote_open") depth++;
      else if (tokens[j].type === "blockquote_close" && --depth === 0) break;
    }
    open.tag = "div";
    if (tokens[j]) tokens[j].tag = "div";
    open.attrSet("class", `markdown-alert markdown-alert-${match[1].toLowerCase()}`);
    inline.content = inline.content.slice(match[0].length);
    // A marker alone in its paragraph leaves an empty paragraph.
    if (!inline.content.trim()) tokens.splice(i + 1, 3);
  }
});

// Strip YAML front matter so files written for static-site generators,
// Obsidian, MDX, or spec corpora don't render as a giant setext heading
// at the top of the document. Without this, a leading `---\n...key: value\n---`
// block is parsed as: thematic break + paragraph + setext H2 underline.
// We capture the front matter and discard it; future work could expose the
// captured value for metadata display.
md.use(frontMatter, () => {
  // intentionally empty — front matter is not rendered
});

// An image that is alone in a paragraph renders as a figure. The alt text of
// the image, with its inline Markdown, is the caption.
md.core.ruler.push("figures", (state) => {
  const tokens = state.tokens;
  for (let i = 1; i < tokens.length - 1; i++) {
    const open = tokens[i - 1];
    const inline = tokens[i];
    const close = tokens[i + 1];
    if (open.type !== "paragraph_open" || inline.type !== "inline" || close.type !== "paragraph_close") continue;
    // Paragraphs of tight lists render without tags.
    if (open.hidden) continue;
    const children = (inline.children ?? []).filter((t) => !(t.type === "text" && !t.content.trim()));
    const image = children[0];
    if (children.length !== 1 || image.type !== "image" || !image.content.trim()) continue;
    open.tag = close.tag = "figure";
    image.meta = { ...image.meta, figure: true };
  }
});

const defaultImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const img = defaultImage(tokens, idx, options, env, self);
  if (!token.meta?.figure) return img;
  return `${img}<figcaption>${self.renderInline(token.children ?? [], options, env)}</figcaption>`;
};

// A question block groups a question with the fields for its answer: task
// lists and `answer` blocks. The paragraph before the fields is the question.
// The paragraph that starts a list item is the text of the item, not a
// question. Fields inside a question block belong to that block.
function isField(token: Token): boolean {
  if (token.type === "fence") return token.info.trim() === "answer";
  return (
    (token.type === "bullet_list_open" || token.type === "ordered_list_open") &&
    (token.attrGet("class") ?? "").split(" ").includes("contains-task-list")
  );
}

// Returns the index after the field that starts at `i`.
function fieldEnd(tokens: Token[], i: number): number {
  if (tokens[i].nesting === 0) return i + 1;
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    depth += tokens[j].nesting;
    if (depth === 0) return j + 1;
  }
  return tokens.length;
}

md.core.ruler.push("questions", (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    if (!isField(tokens[i])) continue;
    let start = i;
    const before = tokens[i - 3];
    if (
      tokens[i - 1]?.type === "paragraph_close" &&
      before?.type === "paragraph_open" &&
      before.level === tokens[i].level &&
      tokens[i - 4]?.type !== "list_item_open"
    ) {
      start = i - 3;
    }
    let end = fieldEnd(tokens, i);
    while (end < tokens.length && isField(tokens[end])) end = fieldEnd(tokens, end);
    const open = new state.Token("question_open", "div", 1);
    open.block = true;
    open.attrSet("class", "galley-question");
    const close = new state.Token("question_close", "div", -1);
    close.block = true;
    tokens.splice(end, 0, close);
    tokens.splice(start, 0, open);
    i = end + 1;
  }
});

// Inject data-source-map attributes on block-level tokens so the copy handler
// can map rendered DOM selections back to original source lines.
md.core.ruler.push("source_map_attrs", (state) => {
  for (const token of state.tokens) {
    if (!token.map) continue;
    const attr = `${token.map[0]},${token.map[1]}`;
    if (token.nesting === 1) {
      // Opening block tags: p, h1–h6, ul, ol, li, blockquote, table, etc.
      token.attrPush(["data-source-map", attr]);
    } else if (token.nesting === 0 && (token.type === "hr" || token.type === "code_block")) {
      token.attrPush(["data-source-map", attr]);
    }
    // fence tokens are handled in the fence renderer override below.
  }
});

// Mark mermaid blocks for client-side rendering rather than syntax highlighting.
// An `answer` block is a text field for the reviewer. Its content is the hint
// that the empty text field shows.
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const info = (token.info || "").trim();
  const sourceMapAttr = token.map ? ` data-source-map="${token.map[0]},${token.map[1]}"` : "";
  if (info === "mermaid") {
    const code = token.content;
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre class="mermaid-pending"${sourceMapAttr}><code>${escaped}</code></pre>`;
  }
  if (info === "answer") {
    const hint = md.utils.escapeHtml(token.content.replace(/\s+/g, " ").trim() || "Answer");
    return `<div class="galley-answer"${sourceMapAttr}><textarea rows="3" placeholder="${hint}"></textarea></div>\n`;
  }
  let html = defaultFence(tokens, idx, options, env, self);
  if (sourceMapAttr) {
    html = html.replace(/^<pre(?=[\s>])/, `<pre${sourceMapAttr}`);
  }
  return html;
};

// LaTeX math through KaTeX: `$inline$`, `$$display$$` and `math` code
// blocks. A formula with an error shows its error message. Display math
// gets the source lines like other blocks.
md.use(katex, {
  enableFencedBlocks: true,
  throwOnError: false,
  katex: { renderToString: renderMath } as unknown as typeof Katex,
});

// LaTeX delimiters `\(...\)` in a line of text and `\[...\]` for a formula
// on its own lines. They give the same tokens as `$...$` and `$$...$$`.
md.inline.ruler.before("escape", "math_paren", (state, silent) => {
  const start = state.pos;
  if (!state.src.startsWith("\\(", start)) return false;
  const end = state.src.indexOf("\\)", start + 2);
  if (end < 0 || !state.src.slice(start + 2, end).trim()) return false;
  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = "\\(";
    token.content = state.src.slice(start + 2, end);
  }
  state.pos = end + 2;
  return true;
});

md.block.ruler.after(
  "blockquote",
  "math_bracket",
  (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const lineText = (l: number) => state.src.slice(state.bMarks[l] + state.tShift[l], state.eMarks[l]);
    const first = lineText(startLine);
    if (!first.startsWith("\\[")) return false;
    const lines = [first.slice(2)];
    let line = startLine;
    // The formula ends at the first line that ends with `\]`. An empty line
    // before it means that the block is not a formula.
    while (!lines[lines.length - 1].trimEnd().endsWith("\\]")) {
      line++;
      if (line >= endLine || state.isEmpty(line)) return false;
      lines.push(lineText(line));
    }
    const last = lines.length - 1;
    lines[last] = lines[last].trimEnd().slice(0, -2);
    const content = lines.join("\n").trim();
    if (!content) return false;
    if (silent) return true;
    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content = content;
    token.map = [startLine, line + 1];
    token.markup = "\\[";
    state.line = line + 1;
    return true;
  },
  { alt: ["paragraph", "reference", "blockquote", "list"] },
);

function withSourceMap(html: string, token: Token): string {
  if (!token.map) return html;
  return html.replace(/^<p(?=[\s>])/, `<p data-source-map="${token.map[0]},${token.map[1]}"`);
}

const mathBlock = md.renderer.rules.math_block!;
md.renderer.rules.math_block = (tokens, idx, options, env, self) =>
  withSourceMap(mathBlock(tokens, idx, options, env, self), tokens[idx]);
const mathFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const html = mathFence(tokens, idx, options, env, self);
  return tokens[idx].info.trim().toLowerCase() === "math" ? withSourceMap(html, tokens[idx]) : html;
};

// Add target=_blank to external http(s) links.
const defaultLink = md.renderer.rules.link_open || ((tokens, idx, options, _env, self) =>
  self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") || "";
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noreferrer noopener");
  }
  return defaultLink(tokens, idx, options, env, self);
};

// Rewrites the `src` of every <img>, from Markdown or raw HTML, through
// `resolveImage`. The hook runs after DOMPurify's URI checks, so the resolved
// URL can use a custom scheme such as the Tauri asset protocol.
export function renderMarkdown(source: string, resolveImage?: (src: string) => string): string {
  const html = md.render(source);
  if (resolveImage) {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName !== "IMG") return;
      const src = node.getAttribute("src");
      if (!src) return;
      node.setAttribute("data-src", src);
      node.setAttribute("src", resolveImage(src));
    });
  }
  try {
    return DOMPurify.sanitize(html, {
      ADD_ATTR: ["target", "class", "id", "aria-hidden", "data-source-map"],
      ADD_TAGS: ["section"],
      // A <style> element in a document would restyle the whole app.
      FORBID_TAGS: ["style"],
    });
  } finally {
    if (resolveImage) DOMPurify.removeHook("afterSanitizeAttributes");
  }
}

