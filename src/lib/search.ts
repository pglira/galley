// A short part of a line around the first match of a query, for the list of
// search hits. `before` and `after` start or end with "…" if text is cut.
export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export function snippet(text: string, query: string, radius = 60): Snippet {
  const line = text.trim();
  const q = query.trim();
  const at = q ? line.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return { before: "", match: "", after: cut(line, radius * 2) };
  const start = Math.max(0, at - radius);
  const end = Math.min(line.length, at + q.length + radius);
  return {
    before: (start > 0 ? "…" : "") + line.slice(start, at),
    match: line.slice(at, at + q.length),
    after: line.slice(at + q.length, end) + (end < line.length ? "…" : ""),
  };
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
