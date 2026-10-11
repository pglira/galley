import { useState } from "react";
import { ChevronDown, ChevronRight, Ellipsis, FolderOpen, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { Galley, Report } from "@/lib/tauri";

export interface Selection {
  report: string;
  snapshot: string;
}

interface Props {
  galley: Galley | null;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  onOpenDir: () => void;
  onInitRules: () => void;
  onDeleteReport: (report: Report) => void;
  onDeleteSnapshots: (report: Report, names: string[]) => void;
  // The search input, below the header.
  search?: React.ReactNode;
  // Search results, which replace the tree when set.
  results?: React.ReactNode;
}

// Splits `2026-10-09_1430_cache-design` into a title and a date.
export function reportLabel(name: string): { title: string; date: string } {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})_(.+)$/);
  if (!m) return { title: name, date: "" };
  return { title: m[4].replace(/[-_]/g, " "), date: `${m[1]} ${m[2]}:${m[3]}` };
}

interface Confirm {
  title: string;
  text: string;
  run: () => void;
}

export function ReportTree({
  galley,
  selection,
  onSelect,
  onOpenDir,
  onInitRules,
  onDeleteReport,
  onDeleteSnapshots,
  search,
  results,
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const askDeleteReport = (report: Report) =>
    setConfirm({
      title: "Delete report?",
      text: `This deletes the directory "${report.name}" with its ${report.snapshots.length} snapshot(s), their images and annotations. You cannot undo this.`,
      run: () => onDeleteReport(report),
    });

  // Deletes the snapshots `names` of `report`. A report without snapshots
  // after the deletion is deleted completely.
  const askDeleteSnapshots = (report: Report, names: string[], title: string) => {
    if (names.length === report.snapshots.length) return askDeleteReport(report);
    const list = names.join(", ");
    setConfirm({
      title,
      text: `This deletes snapshot(s) ${list} of "${report.name}", including their images and annotations. You cannot undo this.`,
      run: () => onDeleteSnapshots(report, names),
    });
  };

  const dirName = galley?.path.split(/[\\/]/).pop() ?? "";

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="truncate text-xs font-semibold tracking-wide uppercase" title={galley?.path}>
          {dirName || "Galley"}
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onOpenDir} title="Open a galley directory">
          <FolderOpen />
        </Button>
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
          <p className="px-3 py-2 text-xs text-muted-foreground">Open a galley directory to see its reports.</p>
        )}
        {!results && galley && galley.reports.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No reports yet.</p>
        )}
        {!results && galley?.reports.map((report) => {
          const label = reportLabel(report.name);
          const isSelected = selection?.report === report.name;
          const isOpen = !(collapsed[report.name] ?? !isSelected);
          return (
            <div key={report.name}>
              <div
                className={cn(
                  "group flex cursor-pointer items-center gap-1 px-2 py-1 hover:bg-sidebar-accent",
                  isSelected && "font-medium"
                )}
                onClick={() => setCollapsed((c) => ({ ...c, [report.name]: isOpen }))}
                title={report.name}
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
                  title="Delete report"
                  onClick={(e) => {
                    e.stopPropagation();
                    askDeleteReport(report);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
              {isOpen &&
                [...report.snapshots].reverse().map((snap) => {
                  const active = isSelected && selection?.snapshot === snap.name;
                  return (
                    <div
                      key={snap.name}
                      className={cn(
                        "group flex cursor-pointer items-center gap-2 py-0.5 pr-2 pl-8 text-sm hover:bg-sidebar-accent",
                        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      )}
                      onClick={() => onSelect({ report: report.name, snapshot: snap.name })}
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
                            onSelect={() => askDeleteSnapshots(report, [snap.name], "Delete snapshot?")}
                          >
                            <Trash2 />
                            Delete snapshot {snap.name}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={report.snapshots.length < 2}
                            onSelect={() =>
                              askDeleteSnapshots(
                                report,
                                report.snapshots.map((s) => s.name).filter((n) => n !== snap.name),
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
