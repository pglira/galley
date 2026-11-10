import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CHAT_MODELS } from "@/lib/chat";

interface Props {
  open: boolean;
  onClose: () => void;
  // The model of the agent; empty for the default model of `claude`.
  model: string;
  onModel: (model: string) => void;
  // Starts the agent with the initial prompt of the new document.
  onStart: (prompt: string) => void;
}

// A dialog for the initial prompt of a new document. Escape and a click
// outside close the dialog only if the prompt is empty.
export function NewDocumentDialog({ open, onClose, model, onModel, onStart }: Props) {
  const [text, setText] = useState("");

  // Each new document starts with an empty prompt.
  useEffect(() => {
    if (open) setText("");
  }, [open]);

  const start = () => {
    const t = text.trim();
    if (!t) return;
    onStart(t);
    onClose();
  };

  const modelLabel = CHAT_MODELS.find((m) => m.id === model)?.label ?? model;

  const guard = (e: Event) => {
    if (text.trim()) e.preventDefault();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex flex-col gap-4 sm:max-w-2xl"
        showCloseButton={false}
        onEscapeKeyDown={guard}
        onInteractOutside={guard}
      >
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>
            Claude Code writes a new document for this task, as GALLEY.md describes. Review it with annotations and
            Send prompt.
          </DialogDescription>
        </DialogHeader>
        <textarea
          autoFocus
          className="block min-h-48 w-full resize-y border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary"
          placeholder="The task for the agent"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              start();
            }
          }}
        />
        <DialogFooter className="sm:justify-between">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="font-normal" title="Model of the agent">
                {modelLabel}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-auto min-w-36">
              <DropdownMenuRadioGroup value={model} onValueChange={onModel}>
                {CHAT_MODELS.map((m) => (
                  <DropdownMenuRadioItem key={m.id} value={m.id}>
                    {m.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!text.trim()} onClick={start} title="Start the agent (Ctrl Enter)">
              Start
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
