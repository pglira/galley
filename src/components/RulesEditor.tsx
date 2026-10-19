import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { tauri } from "@/lib/tauri";

interface Props {
  open: boolean;
  onClose: () => void;
  // Called after a save.
  onSaved: () => void;
  onError: (message: string) => void;
}

// A dialog to edit `GALLEY.md` of the open galley directory. Escape and a
// click outside close the dialog only if the text has no unsaved changes.
export function RulesEditor({ open, onClose, onSaved, onError }: Props) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const dirty = saved != null && text !== saved;

  // Load the file each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSaved(null);
    tauri
      .readRules()
      .then((t) => {
        if (cancelled) return;
        setText(t);
        setSaved(t);
      })
      .catch((e) => {
        if (cancelled) return;
        onError(String(e));
        onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    try {
      await tauri.writeRules(text);
      onSaved();
      onClose();
    } catch (e) {
      onError(String(e));
    }
  };

  const revertToDefault = async () => {
    try {
      setText(await tauri.rulesTemplate());
    } catch (e) {
      onError(String(e));
    }
  };

  const guard = (e: Event) => {
    if (dirty) e.preventDefault();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="flex h-[85vh] flex-col gap-4 sm:max-w-3xl"
        showCloseButton={false}
        onEscapeKeyDown={guard}
        onInteractOutside={guard}
      >
        <DialogHeader>
          <DialogTitle>GALLEY.md</DialogTitle>
          <DialogDescription>The rules for the agent in this galley directory.</DialogDescription>
        </DialogHeader>
        <textarea
          className="min-h-0 flex-1 resize-none rounded border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus:border-ring"
          spellCheck={false}
          disabled={saved == null}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
          }}
        />
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={revertToDefault}
            title="Replace the text with the default GALLEY.md of this Galley version. Save to keep it."
          >
            Revert to default
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {dirty ? "Discard" : "Cancel"}
            </Button>
            <Button onClick={save} disabled={!dirty} title="Save (Ctrl Enter)">
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
