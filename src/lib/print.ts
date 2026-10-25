import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { downloadDir, join } from "@tauri-apps/api/path";
import { enhance } from "@/lib/enhance";
import { tauri } from "@/lib/tauri";
import { type PdfOptions, pageRule, pdfMargins } from "@/lib/pdfOptions";

const PRINT_ID = "print-root";

// WebKitGTK can save a PDF without a print dialog. Other webviews print
// through the print dialog of the system, which can also save a PDF.
const DIRECT_PDF = /Linux/.test(navigator.userAgent);

// Puts document HTML into an element that only the print media shows (see
// `#print-root` in markdown.css). The document renders on white paper with the
// light colors. `title` is the document title until `cleanup` runs. The
// options set the CSS page rule and the zoom of the content.
async function preparePrint(html: string, title: string, options: PdfOptions): Promise<() => void> {
  document.getElementById(PRINT_ID)?.remove();
  const root = document.createElement("div");
  root.id = PRINT_ID;
  root.className = "paper paper-light";
  root.style.setProperty("--paper", "#ffffff");
  root.style.setProperty("zoom", String(options.scale / 100));
  const page = document.createElement("style");
  page.textContent = `@media print { ${pageRule(options)} }`;
  root.appendChild(page);
  const article = document.createElement("article");
  article.className = "markdown-body";
  article.innerHTML = html;
  root.appendChild(article);
  document.body.appendChild(root);

  await enhance(article, "light");
  await Promise.all(Array.from(article.querySelectorAll("img")).map((img) => img.decode().catch(() => {})));

  const previousTitle = document.title;
  document.title = title;
  return () => {
    document.title = previousTitle;
    root.remove();
  };
}

// Exports document HTML as a PDF with `options`. `name` is the default file
// name without the extension. Returns the path of the saved file, or null if
// the user cancels or the print dialog handles the file.
export async function exportPdf(html: string, name: string, options: PdfOptions): Promise<string | null> {
  if (!DIRECT_PDF) {
    const cleanup = await preparePrint(html, name, options);
    const done = () => {
      window.removeEventListener("afterprint", done);
      cleanup();
    };
    window.addEventListener("afterprint", done);
    window.print();
    return null;
  }

  const defaultPath = await downloadDir()
    .then((dir) => join(dir, `${name}.pdf`))
    .catch(() => `${name}.pdf`);
  const path = await saveDialog({
    title: "Export PDF",
    defaultPath,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!path) return null;
  const cleanup = await preparePrint(html, name, options);
  const margins = pdfMargins(options);
  try {
    await tauri.exportPdf(path, {
      paper: options.paper,
      landscape: options.landscape,
      margin_vertical: margins.vertical,
      margin_horizontal: margins.horizontal,
    });
  } finally {
    cleanup();
  }
  return path;
}
