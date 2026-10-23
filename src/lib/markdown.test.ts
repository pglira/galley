import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("rewrites image sources through the resolver", () => {
    const html = renderMarkdown('![a](images/a.png)\n\n<img src="b.png">', (src) => `asset://${src}`);
    expect(html).toContain('src="asset://images/a.png"');
    expect(html).toContain('src="asset://b.png"');
  });

  it("renders an image alone in a paragraph as a figure with a caption", () => {
    const html = renderMarkdown("![The *loss* curve](images/loss.png)\n\nText ![inline](images/b.png) here.");
    expect(html).toMatch(/<figure[^>]*><img src="images\/loss.png" alt="The loss curve"><figcaption>The <em>loss<\/em> curve<\/figcaption><\/figure>/);
    expect(html).toMatch(/<p[^>]*>Text <img src="images\/b.png" alt="inline"> here.<\/p>/);
    expect(renderMarkdown("![](images/c.png)")).not.toContain("<figure");
    expect(renderMarkdown("- ![a](images/d.png)\n- b")).not.toContain("figcaption");
  });

  it("renders an answer block as a text field with its hint", () => {
    const html = renderMarkdown("How much?\n\n```answer\nA size in MB\n```\n\n```answer\n```");
    expect(html).toMatch(/<div class="galley-answer"[^>]*><textarea rows="3" placeholder="A size in MB"><\/textarea><\/div>/);
    expect(html).toContain('placeholder="Answer"');
  });

  it("keeps image sources without a resolver", () => {
    expect(renderMarkdown("![a](images/a.png)")).toContain('src="images/a.png"');
  });

  it("renders a heading with an anchor", () => {
    const html = renderMarkdown("# Hello World");
    expect(html).toContain("<h1");
    expect(html).toContain("Hello World");
    expect(html).toMatch(/id="hello-world"/);
  });

  it("renders GFM tables", () => {
    const md = `| a | b |\n|---|---|\n| 1 | 2 |\n`;
    const html = renderMarkdown(md);
    expect(html).toMatch(/<table[ >]/);
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders task lists with checkboxes", () => {
    const md = `- [x] done\n- [ ] todo\n`;
    const html = renderMarkdown(md);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
  });

  it("renders fenced code blocks with language class", () => {
    const md = "```ts\nconst x = 1;\n```\n";
    const html = renderMarkdown(md);
    expect(html).toMatch(/<pre[^>]*><code class="language-ts">/);
  });

  it("flags mermaid blocks as pending for client-side rendering", () => {
    const md = "```mermaid\ngraph TD;A-->B;\n```\n";
    const html = renderMarkdown(md);
    expect(html).toContain("mermaid-pending");
    expect(html).toContain("graph TD");
  });

  it("adds target=_blank to external links", () => {
    const html = renderMarkdown("[ext](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("does not add target=_blank to relative links", () => {
    const html = renderMarkdown("[rel](./a.md)");
    expect(html).not.toContain('target="_blank"');
  });

  it("sanitizes script tags", () => {
    const html = renderMarkdown("<script>alert(1)</script>\n\nokay");
    expect(html).not.toContain("<script");
    expect(html).toContain("okay");
  });

  it("renders strikethrough", () => {
    const html = renderMarkdown("~~gone~~");
    expect(html).toContain("<s>gone</s>");
  });

  it("renders blockquotes", () => {
    const html = renderMarkdown("> a quote");
    expect(html).toMatch(/<blockquote[ >]/);
  });

  it("strips YAML front matter at the top of the document", () => {
    const md = `---\ntitle: Hello\nauthor: someone\ndraft: false\n---\n\n# Hello\n\nFirst paragraph.\n`;
    const html = renderMarkdown(md);
    expect(html).not.toContain("title: Hello");
    expect(html).not.toContain("author: someone");
    expect(html).not.toContain("draft: false");
    expect(html).toContain("Hello");
    expect(html).toContain("First paragraph.");
  });

  it("does not strip a thematic break that is not front matter", () => {
    const md = `# Title\n\nBefore.\n\n---\n\nAfter.\n`;
    const html = renderMarkdown(md);
    expect(html).toContain("<hr");
    expect(html).toContain("Before.");
    expect(html).toContain("After.");
  });

  it("does not collapse a YAML block in the body into a setext heading", () => {
    // Front matter only applies at the very top. A `---`-bracketed block
    // mid-document remains regular CommonMark (thematic break + paragraph +
    // setext heading), which is the long-standing behaviour we are not changing.
    const md = `# Title\n\nIntro.\n\n---\nfoo: bar\n---\n`;
    const html = renderMarkdown(md);
    // The mid-document block must NOT be silently swallowed.
    expect(html).toContain("foo: bar");
  });
});
