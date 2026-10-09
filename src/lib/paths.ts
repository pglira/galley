// Path helpers for local files referenced from a Markdown document.

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// True for paths relative to the document, false for URLs (http:, data:, ...),
// absolute paths and in-page anchors.
export function isRelativePath(src: string): boolean {
  return !SCHEME.test(src) && !src.startsWith("/") && !src.startsWith("\\") && !src.startsWith("#");
}

// Resolves `rel` against the directory of the file `filePath`. Handles `.` and
// `..` segments, and keeps the separator style of `filePath`.
export function resolveRelative(filePath: string, rel: string): string {
  const sep = filePath.includes("\\") && !filePath.includes("/") ? "\\" : "/";
  const parts = filePath.split(/[\\/]/);
  parts.pop();
  for (const seg of decodeURI(rel).split(/[\\/]/)) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join(sep);
}
