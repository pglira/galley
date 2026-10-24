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

// Labels for the directories `dirs`: the last name of each directory. Labels
// that are equal get parent directories until they differ, for example
// `alpha/.galley` and `beta/.galley`.
export function dirLabels(dirs: string[]): string[] {
  const parts = dirs.map((d) => d.split(/[\\/]/).filter((p) => p !== ""));
  const depth = dirs.map(() => 1);
  const label = (i: number) => parts[i].slice(-depth[i]).join("/") || dirs[i];
  for (;;) {
    const groups = new Map<string, number[]>();
    dirs.forEach((_, i) => groups.set(label(i), [...(groups.get(label(i)) ?? []), i]));
    let changed = false;
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      for (const i of group) {
        if (depth[i] < parts[i].length) {
          depth[i]++;
          changed = true;
        }
      }
    }
    if (!changed) return dirs.map((_, i) => label(i));
  }
}
