import { useEffect, useState } from "react";
import { MessageSquare, Search, X } from "lucide-react";
import { tauri, type Galley, type SearchHit, type SearchResult } from "@/lib/tauri";
import { snippet } from "@/lib/search";
import { reportLabel } from "@/components/ReportTree";

const DEBOUNCE_MS = 200;

interface BoxProps {
  query: string;
  onQueryChange: (q: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

// The input for the search in all reports.
export function SearchBox({ query, onQueryChange, inputRef }: BoxProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-b px-3">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onQueryChange("");
            e.currentTarget.blur();
          }
        }}
        placeholder="Search all reports (Ctrl Shift F)"
        className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {query && (
        <button className="text-muted-foreground hover:text-foreground" title="Clear" onClick={() => onQueryChange("")}>
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

interface ResultsProps {
  query: string;
  // Searches again when the directory changes.
  galley: Galley | null;
  onOpenHit: (hit: SearchHit) => void;
}

// The hits of the search, grouped by snapshot.
export function SearchResults({ query, galley, onOpenHit }: ResultsProps) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      tauri
        .search(query)
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setError(null);
        })
        .catch((e) => !cancelled && setError(String(e)));
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, galley]);

  if (error) return <p className="px-3 py-2 text-xs text-destructive">{error}</p>;
  if (!result) return <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>;
  if (result.hits.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>;

  const groups: { key: string; hits: SearchHit[] }[] = [];
  for (const hit of result.hits) {
    const key = `${hit.report}/${hit.snapshot}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.hits.push(hit);
    else groups.push({ key, hits: [hit] });
  }

  return (
    <div className="pb-2">
      <p className="px-3 py-1 text-[11px] text-muted-foreground">
        {result.truncated ? `First ${result.hits.length} matches` : `${result.hits.length} matches`}
      </p>
      {groups.map((g) => {
        const { report, snapshot } = g.hits[0];
        return (
          <div key={g.key} className="mb-1">
            <div className="truncate px-3 pt-1 text-xs font-medium" title={report}>
              {reportLabel(report).title} · Snapshot {snapshot}
            </div>
            {g.hits.map((hit) => {
              const s = snippet(hit.text, query);
              return (
                <button
                  key={`${hit.file}:${hit.line}`}
                  className="flex w-full items-start gap-1.5 px-3 py-0.5 text-left text-xs hover:bg-sidebar-accent"
                  title={`${hit.file}, line ${hit.line}`}
                  onClick={() => onOpenHit(hit)}
                >
                  {hit.file === "annotations.md" ? (
                    <MessageSquare className="mt-0.5 size-3 shrink-0 text-primary" aria-label="Annotation" />
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 break-words text-muted-foreground">
                    {s.before}
                    <mark className="rounded-sm bg-primary/30 text-foreground">{s.match}</mark>
                    {s.after}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
