import { FolderOpen, FolderPlus, History } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  recent: string[];
  onOpen: () => void;
  onCreate: () => void;
  onOpenRecent: (path: string) => void;
}

export function StartScreen({ recent, onOpen, onCreate, onOpenRecent }: Props) {
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
              {recent.map((d) => (
                <li key={d}>
                  <button
                    className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-muted"
                    title={d}
                    onClick={() => onOpenRecent(d)}
                  >
                    <span className="font-medium">{d.split(/[\\/]/).pop()}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{d}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
