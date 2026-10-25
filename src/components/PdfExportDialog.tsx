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
import { cn } from "@/lib/utils";
import {
  PAPER_SIZES,
  PDF_DEFAULTS,
  PDF_MARGINS,
  PDF_SCALE_MAX,
  PDF_SCALE_MIN,
  PDF_SCALE_STEP,
  type PdfOptions,
} from "@/lib/pdfOptions";

interface Props {
  open: boolean;
  // The options that the dialog shows when it opens.
  options: PdfOptions;
  onClose: () => void;
  onExport: (options: PdfOptions) => void;
}

// A row of buttons of which one is selected.
function Choice<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex flex-wrap" role="radiogroup" aria-label={label}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={value === item.id}
            className={cn(
              "-ml-px h-7 border px-2.5 text-xs first:ml-0 hover:bg-muted",
              value === item.id && "relative z-10 border-primary bg-primary text-primary-foreground hover:bg-primary"
            )}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const ORIENTATIONS = [
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
] as const;

// A dialog with the options of the PDF export: paper size, orientation,
// margins and scale of the content.
export function PdfExportDialog({ open, options, onClose, onExport }: Props) {
  const [o, setO] = useState<PdfOptions>(options);

  useEffect(() => {
    if (open) setO(options);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: Partial<PdfOptions>) => setO((prev) => ({ ...prev, ...patch }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent showCloseButton={false} className="gap-5">
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
          <DialogDescription>The page setup and the scale of the document in the PDF.</DialogDescription>
        </DialogHeader>
        <form
          id="pdf-export"
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onExport(o);
          }}
        >
          <Choice label="Paper" items={PAPER_SIZES} value={o.paper} onChange={(paper) => set({ paper })} />
          <Choice
            label="Orientation"
            items={ORIENTATIONS}
            value={o.landscape ? "landscape" : "portrait"}
            onChange={(id) => set({ landscape: id === "landscape" })}
          />
          <Choice label="Margins" items={PDF_MARGINS} value={o.margins} onChange={(margins) => set({ margins })} />
          <div className="grid grid-cols-[6rem_1fr] items-center gap-3">
            <span className="text-muted-foreground">Scale</span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={PDF_SCALE_MIN}
                max={PDF_SCALE_MAX}
                step={PDF_SCALE_STEP}
                value={o.scale}
                onChange={(e) => set({ scale: Number(e.target.value) })}
                onDoubleClick={() => set({ scale: PDF_DEFAULTS.scale })}
                className="flex-1"
                aria-label="Scale"
                title="Double-click for 100 %"
              />
              <span className="w-12 text-right text-xs tabular-nums">{o.scale} %</span>
            </div>
          </div>
        </form>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => setO(PDF_DEFAULTS)}>
            Defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="pdf-export" autoFocus>
              Export
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
