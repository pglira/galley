import { FolderOpen, FolderPlus, History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dirLabels } from "@/lib/paths";

interface Props {
  recent: string[];
  // The names that the user gives to tabs, by galley path.
  names: Record<string, string>;
  onOpen: () => void;
  onCreate: () => void;
  onOpenRecent: (path: string) => void;
  // Removes a directory from the recent list. The directory itself stays.
  onRemoveRecent: (path: string) => void;
}

export function StartScreen({ recent, names, onOpen, onCreate, onOpenRecent, onRemoveRecent }: Props) {
  const labels = dirLabels(recent);
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Galley</h1>
          <p className="text-sm text-muted-foreground">Review Markdown documents from AI agents.</p>
        </div>
        <div className="grid gap-2">
          <Button variant="outline" className="justify-start" onClick={onOpen}>
            <FolderOpen />
            Open a galley directory
          </Button>
          <Button variant="outline" className="justify-start" onClick={onCreate}>
            <FolderPlus />
            Create a new galley directory
          </Button>
        </div>
        {recent.length > 0 && (
          <div>
            <h2 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <History className="size-3.5" />
              Recent
            </h2>
            <ul>
              {recent.map((d, i) => (
                <li key={d} className="group flex items-center hover:bg-muted">
                  <button
                    className="min-w-0 flex-1 truncate px-2 py-1 text-left text-sm"
                    title={d}
                    onClick={() => onOpenRecent(d)}
                  >
                    <span className="font-medium">{names[d] ?? labels[i]}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{d}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    title="Remove from the list"
                    onClick={() => onRemoveRecent(d)}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
