import { describe, it, expect } from "vitest";
import { diffHtml } from "./diff";

describe("diffHtml", () => {
  it("leaves equal documents unchanged", () => {
    const html = "<h1>T</h1><p>a b</p>";
    expect(diffHtml(html, html)).toBe(html);
  });

  it("shows a changed text as the old and the new block", () => {
    const out = diffHtml("<p>the fast cache of the store</p>", "<p>the slow cache of the store</p>");
    expect(out).toBe(
      '<p class="diff-removed diff-pair">the <del class="diff-del">slow</del> cache of the store</p>' +
        '<p class="diff-added diff-pair">the <ins class="diff-ins">fast</ins> cache of the store</p>'
    );
  });

  it("keeps inline formatting in a word diff", () => {
    const out = diffHtml("<p>a <strong>b</strong> c d e f</p>", "<p>a <strong>b</strong> c e f</p>");
    expect(out).toMatch(/<p class="diff-added diff-pair">a <strong>b<\/strong> c <ins class="diff-ins">d\s?<\/ins>\s?e f<\/p>/);
  });

  it("diffs the caption and the image of a figure", () => {
    const fig = (src: string, cap: string) =>
      `<figure><img src="${src}" alt="x"><figcaption>${cap}</figcaption></figure>`;
    const out = diffHtml(fig("b.png", "the route of the long experiment"), fig("a.png", "the route of the experiment"));
    expect(out).toContain('<img src="b.png" alt="x" class="diff-img-changed">');
    expect(out).toContain('<ins class="diff-ins">long </ins>');
  });

  it("joins changes that short equal text separates", () => {
    const out = diffHtml(
      "<p>keep this start. Both are optional now. keep this end</p>",
      "<p>keep this start. They replace the old one. keep this end</p>"
    );
    expect(out).toContain('<del class="diff-del">They replace the old one</del>');
    expect(out).toContain('<ins class="diff-ins">Both are optional now</ins>');
  });

  it("marks no words in a text that keeps less than half of its text", () => {
    const out = diffHtml("<p>one two three four</p>", "<p>one five six seven</p>");
    expect(out).toBe('<p class="diff-removed">one five six seven</p><p class="diff-added">one two three four</p>');
  });

  it("diffs table cells inline", () => {
    const out = diffHtml("<table><tr><td>a b c new</td></tr></table>", "<table><tr><td>a b c old</td></tr></table>");
    expect(out).toContain('<td>a b c <del class="diff-del">old</del><ins class="diff-ins">new</ins></td>');
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
    const out = diffHtml("<ul><li>a</li><li>b c d B</li></ul>", "<ul><li>a</li><li>b c d b</li></ul>");
    expect(out).toContain("<li>a</li>");
    expect(out).toContain('<li class="diff-added diff-pair">b c d <ins class="diff-ins">B</ins></li>');
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
