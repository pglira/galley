import { useState } from "react";
import { ChevronDown, ChevronRight, Ellipsis, FolderOpen, MessageSquare, ScrollText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ResizeHandle } from "@/components/ResizeHandle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences";
import type { Galley, Document } from "@/lib/tauri";

export interface Selection {
  document: string;
  snapshot: string;
}

interface Props {
  galley: Galley | null;
  // The name of the galley, as its tab shows it.
  name: string;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onOpenDir: () => void;
  onInitRules: () => void;
  onEditRules: () => void;
  onDeleteDocument: (doc: Document) => void;
  onDeleteSnapshots: (doc: Document, names: string[]) => void;
  // The search input, below the header.
  search?: React.ReactNode;
  // Search results, which replace the tree when set.
  results?: React.ReactNode;
  // The table of contents of the shown document, below the tree.
  contents?: React.ReactNode;
}

// Splits `2026-10-09_1430_cache-design` into a title and a date.
export function documentLabel(name: string): { title: string; date: string } {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})_(.+)$/);
  if (!m) return { title: name, date: "" };
  return { title: m[4].replace(/[-_]/g, " "), date: `${m[1]} ${m[2]}:${m[3]}` };
}

interface Confirm {
  title: string;
  text: string;
  run: () => void;
}

export function DocumentTree({
  galley,
  name,
  selection,
  onSelect,
  onOpenDir,
  onInitRules,
  onEditRules,
  onDeleteDocument,
  onDeleteSnapshots,
  search,
  results,
  contents,
}: Props) {
  const { contentsHeight, setContentsHeight, resetContentsHeight } = usePreferences();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const askDeleteDocument = (doc: Document) =>
    setConfirm({
      title: "Delete document?",
      text: `This deletes the directory "${doc.name}" with its ${doc.snapshots.length} snapshot(s), their images and annotations. You cannot undo this.`,
      run: () => onDeleteDocument(doc),
    });

  // Deletes the snapshots `names` of `doc`. A document without snapshots
  // after the deletion is deleted completely.
  const askDeleteSnapshots = (doc: Document, names: string[], title: string) => {
    if (names.length === doc.snapshots.length) return askDeleteDocument(doc);
    const list = names.join(", ");
    setConfirm({
      title,
      text: `This deletes snapshot(s) ${list} of "${doc.name}", including their images and annotations. You cannot undo this.`,
      run: () => onDeleteSnapshots(doc, names),
    });
  };


  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="truncate text-xs font-semibold tracking-wide uppercase" title={galley?.path}>
          {name || "Galley"}
        </span>
        <div className="flex shrink-0 items-center">
          {galley?.has_rules && (
            <Button variant="ghost" size="icon-xs" onClick={onEditRules} title="Edit GALLEY.md">
              <ScrollText />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onOpenDir}
            title="Open a galley directory in a new tab (Ctrl O)"
          >
            <FolderOpen />
          </Button>
        </div>
      </div>

      {search}

      {galley && !galley.has_rules && (
        <div className="m-2 rounded-md border bg-muted/50 p-2 text-xs">
          <p className="mb-2">This directory has no GALLEY.md with the rules for the agent.</p>
          <Button size="xs" variant="outline" onClick={onInitRules}>
            Create GALLEY.md
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {results}
        {!results && !galley && (
          <p className="px-3 py-2 text-xs text-muted-foreground">Open a galley directory to see its documents.</p>
        )}
        {!results && galley && galley.documents.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No documents yet.</p>
        )}
        {!results && galley?.documents.map((doc) => {
          const label = documentLabel(doc.name);
          const isSelected = selection?.document === doc.name;
          const isOpen = !(collapsed[doc.name] ?? !isSelected);
          return (
            <div key={doc.name}>
              <div
                className={cn(
                  "group flex cursor-pointer items-center gap-1 px-2 py-1 hover:bg-sidebar-accent",
                  isSelected && "font-medium"
                )}
                onClick={() => setCollapsed((c) => ({ ...c, [doc.name]: isOpen }))}
                title={doc.name}
              >
                {isOpen ? (
                  <ChevronDown className="size-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{label.title}</div>
                  {label.date && <div className="text-[11px] text-muted-foreground">{label.date}</div>}
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 group-hover:opacity-100"
                  title="Delete document"
                  onClick={(e) => {
                    e.stopPropagation();
                    askDeleteDocument(doc);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
              {isOpen &&
                [...doc.snapshots].reverse().map((snap) => {
                  const active = isSelected && selection?.snapshot === snap.name;
                  return (
                    <div
                      key={snap.name}
                      className={cn(
                        "group flex cursor-pointer items-center gap-2 py-0.5 pr-2 pl-8 text-sm hover:bg-sidebar-accent",
                        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      )}
                      onClick={() => onSelect({ document: doc.name, snapshot: snap.name })}
                    >
                      <span className="flex-1">Snapshot {snap.name}</span>
                      {snap.annotations_modified != null && (
                        <MessageSquare className="size-3 text-primary" aria-label="Has annotations" />
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label="Snapshot actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-auto whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => askDeleteSnapshots(doc, [snap.name], "Delete snapshot?")}
                          >
                            <Trash2 />
                            Delete snapshot {snap.name}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={doc.snapshots.length < 2}
                            onSelect={() =>
                              askDeleteSnapshots(
                                doc,
                                doc.snapshots.map((s) => s.name).filter((n) => n !== snap.name),
                                "Delete all other snapshots?"
                              )
                            }
                          >
                            <Trash2 />
                            Delete all other snapshots
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {contents && (
        <>
          <ResizeHandle side="top" onResize={setContentsHeight} onReset={resetContentsHeight} />
          {/* The tree keeps at least 6rem of the height. */}
          <div
            className="flex min-h-0 shrink-0 flex-col border-t"
            style={{ height: contentsHeight, maxHeight: "calc(100% - 6rem)" }}
          >
            <div className="flex h-8 shrink-0 items-center px-3 text-xs font-semibold tracking-wide uppercase">
              Contents
            </div>
            <div className="min-h-0 flex-1 overflow-auto">{contents}</div>
          </div>
        </>
      )}

      <Dialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                confirm?.run();
                setConfirm(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
