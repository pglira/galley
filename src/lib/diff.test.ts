import { describe, it, expect } from "vitest";
import { diffHtml } from "./diff";

describe("diffHtml", () => {
  it("leaves equal documents unchanged", () => {
    const html = "<h1>T</h1><p>a b</p>";
    expect(diffHtml(html, html)).toBe(html);
  });

  it("marks inserted and deleted words", () => {
    const out = diffHtml("<p>the fast cache</p>", "<p>the slow cache</p>");
    expect(out).toContain('<del class="diff-del">slow</del>');
    expect(out).toContain('<ins class="diff-ins">fast</ins>');
    expect(out.indexOf("diff-del")).toBeLessThan(out.indexOf("diff-ins"));
  });

  it("keeps inline formatting in a word diff", () => {
    const out = diffHtml("<p>a <strong>b</strong> c d</p>", "<p>a <strong>b</strong> c</p>");
    expect(out).toContain("<strong>b</strong>");
    expect(out).toMatch(/<ins class="diff-ins">\s?d<\/ins>/);
  });

  it("marks added and removed blocks", () => {
    const out = diffHtml("<p>one</p><h2>new</h2>", "<p>one</p><pre><code>old</code></pre>");
    expect(out).toContain('<pre class="diff-removed">');
    expect(out).toContain('<h2 class="diff-added">');
  });

  it("puts a removed block at its position", () => {
    const out = diffHtml("<p>a</p><p>c</p>", "<p>a</p><p>b</p><p>c</p><p>d</p><p>e</p><p>f</p>");
    const order = ["<p>a</p>", ">b</", "<p>c</p>"].map((s) => out.indexOf(s));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it("compares list items one by one", () => {
    const out = diffHtml("<ul><li>a</li><li>B</li></ul>", "<ul><li>a</li><li>b</li></ul>");
    expect(out).toContain("<li>a</li>");
    expect(out).toContain('<ins class="diff-ins">B</ins>');
  });

  it("marks changed images by key", () => {
    const key = (img: Element) => img.getAttribute("data-hash") ?? "";
    const out = diffHtml(
      '<p><img src="x.png" data-hash="2"></p>',
      '<p><img src="x.png" data-hash="1"></p>',
      key
    );
    expect(out).toContain("diff-img-changed");
    expect(diffHtml('<p><img src="x.png" data-hash="1"></p>', '<p><img src="x.png" data-hash="1"></p>', key)).not.toContain(
      "diff-"
    );
  });

  it("compares code blocks as a whole", () => {
    const out = diffHtml('<pre><code class="language-py">x = compute(a)</code></pre>', '<pre><code class="language-py">x = old(a)</code></pre>');
    expect(out).toContain('<pre class="diff-removed"><code class="language-py">x = old(a)</code></pre>');
    expect(out).toContain('<pre class="diff-added"><code class="language-py">x = compute(a)</code></pre>');
    expect(out).not.toContain("diff-ins");
  });

  it("compares mermaid blocks as a whole", () => {
    const out = diffHtml(
      '<pre class="mermaid-pending"><code>graph TD; A-->C</code></pre>',
      '<pre class="mermaid-pending"><code>graph TD; A-->B</code></pre>'
    );
    expect(out).not.toContain("diff-ins");
    expect(out).toContain("diff-removed");
    expect(out).toContain("diff-added");
  });
});
