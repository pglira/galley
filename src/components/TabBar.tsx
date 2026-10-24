import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TabInfo {
  id: number;
  label: string;
  // The path of the galley directory, or null for a tab with the start screen.
  path: string | null;
}

interface Props {
  tabs: TabInfo[];
  active: number;
  onActivate: (id: number) => void;
  onClose: (id: number) => void;
  onNew: () => void;
  // Gives a name to the tab of a galley. An empty name removes the name.
  onRename: (path: string, name: string) => void;
}

// The tabs of the open galley directories. A middle click closes a tab, a
// double click renames the tab of a galley.
export function TabBar({ tabs, active, onActivate, onClose, onNew, onRename }: Props) {
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <div className="flex h-8 shrink-0 items-stretch border-b bg-sidebar text-sidebar-foreground" role="tablist">
      <div className="flex min-w-0 items-stretch overflow-x-auto">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === active}
            title={t.path ? `${t.path}\nDouble-click to rename` : undefined}
            className={cn(
              "group flex max-w-56 min-w-0 shrink-0 cursor-default items-center gap-1 border-r border-b-2 pr-1 pl-3 text-xs select-none",
              t.id === active
                ? "border-b-primary bg-background text-foreground"
                : "border-b-transparent text-muted-foreground hover:bg-muted/50"
            )}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onClick={() => onActivate(t.id)}
            onDoubleClick={() => t.path && setEditing(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) onClose(t.id);
            }}
          >
            {editing === t.id && t.path ? (
              <RenameField
                label={t.label}
                onDone={(name) => {
                  setEditing(null);
                  if (name != null && name !== t.label && t.path) onRename(t.path, name);
                }}
              />
            ) : (
              <span className="min-w-0 truncate">{t.label}</span>
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "size-5 shrink-0",
                t.id === active ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              )}
              title="Close the tab (Ctrl W)"
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="icon-xs" className="mx-1 self-center" title="New tab (Ctrl T)" onClick={onNew}>
        <Plus />
      </Button>
    </div>
  );
}

// The text field to rename a tab. Enter and a click outside give the name,
// Escape gives `null`. `onDone` runs once.
function RenameField({ label, onDone }: { label: string; onDone: (name: string | null) => void }) {
  const [text, setText] = useState(label);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      className="w-32 min-w-0 rounded-sm border bg-background px-1 text-xs outline-none"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(text);
        else if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(text)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
