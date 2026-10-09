import { highlightCode } from "@/lib/highlight";
import { renderMermaidBlocks } from "@/lib/mermaid";
import { attachCopyButtons } from "@/components/CodeCopyOverlay";
import type { Tone } from "@/lib/theme";

// Highlights the code blocks, adds copy buttons and renders the mermaid
// diagrams of rendered report HTML in `root`, with the colors of `tone`.
// Returns false if `cancelled()` becomes true before the end.
export async function enhance(root: HTMLElement, tone: Tone, cancelled: () => boolean = () => false): Promise<boolean> {
  const codeBlocks = root.querySelectorAll<HTMLElement>("pre > code[class*='language-']");
  for (const code of Array.from(codeBlocks)) {
    const match = code.className.match(/language-([\w+-]+)/);
    const text = code.textContent || "";
    try {
      const highlighted = await highlightCode(text, match?.[1], tone);
      if (cancelled()) return false;
      const pre = code.parentElement;
      if (!pre || !pre.isConnected) continue;
      const tpl = document.createElement("template");
      tpl.innerHTML = highlighted.trim();
      const replacement = tpl.content.firstElementChild;
      if (replacement) {
        // Keep the source map and the diff classes of the block.
        const sourceMap = pre.getAttribute("data-source-map");
        if (sourceMap) replacement.setAttribute("data-source-map", sourceMap);
        for (const cls of Array.from(pre.classList)) {
          if (cls.startsWith("diff-")) replacement.classList.add(cls);
        }
        pre.replaceWith(replacement);
      }
    } catch {
      // leave plain on failure
    }
  }
  if (cancelled()) return false;
  attachCopyButtons(root);
  await renderMermaidBlocks(root, tone);
  return !cancelled();
}
