import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import frontMatter from "markdown-it-front-matter";
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

