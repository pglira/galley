import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Search, Settings, Minus, Plus, ClipboardCopy, Check, FileDown, RotateCw } from "lucide-react";
import { useTheme, PAPER_PRESETS } from "@/lib/theme";
import {
  usePreferences,
  ZOOM_MIN,
  ZOOM_MAX,
  PAPER_WIDTH_MIN,
  PAPER_WIDTH_MAX,
  PAPER_WIDTH_DEFAULT,
} from "@/lib/preferences";

interface Props {
  title: string;
  // Names of the snapshots that the diff can use as reference.
  references: string[];
  diffOn: boolean;
  onDiffOn: (on: boolean) => void;
  reference: string | null;
  onReference: (name: string) => void;
  canCopyPrompt: boolean;
  onCopyPrompt: () => Promise<void>;
  onFind: () => void;
  // Null if no snapshot is selected.
  onReload: (() => void) | null;
  // Null if no report shows.
  onExportPdf: (() => void) | null;
}

export function Toolbar({
  title,
  references,
  diffOn,
  onDiffOn,
  reference,
  onReference,
  canCopyPrompt,
  onCopyPrompt,
  onFind,
  onReload,
  onExportPdf,
}: Props) {
  const { paper, setPaper } = useTheme();
  const { copyAsMarkdown, setCopyAsMarkdown, zoom, zoomIn, zoomOut, zoomReset, paperWidth, setPaperWidth } =
    usePreferences();
  const [copied, setCopied] = useState(false);
  const noReference = references.length === 0;

  return (
    <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b bg-card/40 px-3">
      <div className="truncate text-xs text-muted-foreground">{title}</div>
      <div className="flex shrink-0 items-center gap-1">
        <label
          className={cn("flex items-center gap-1.5 text-xs", noReference && "opacity-50")}
          title={noReference ? "This report has only one snapshot" : "Show the changes since a reference snapshot"}
        >
          <input
            type="checkbox"
            checked={diffOn && !noReference}
            disabled={noReference}
            onChange={(e) => onDiffOn(e.target.checked)}
          />
          Diff against
        </label>
        <select
          className="h-6 rounded border bg-background px-1 text-xs disabled:opacity-50"
          value={reference ?? ""}
          disabled={noReference}
          onChange={(e) => {
            onReference(e.target.value);
            onDiffOn(true);
          }}
        >
          {references.map((r) => (
            <option key={r} value={r}>
              Snapshot {r}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="xs"
          className="ml-2"
          disabled={!canCopyPrompt}
          title={
            canCopyPrompt
              ? "Copy a prompt for the agent to the clipboard"
              : "Add annotations to this snapshot first"
          }
          onClick={async () => {
            await onCopyPrompt();
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => onReload?.()}
              disabled={!onReload}
              variant="ghost"
              size="icon"
              className="ml-2 h-7 w-7"
              aria-label="Reload snapshot"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reload snapshot (F5)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => onExportPdf?.()}
              disabled={!onExportPdf}
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Export PDF"
            >
              <FileDown className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export PDF (Ctrl P)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onFind} variant="ghost" size="icon" className="h-7 w-7">
              <Search className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Find in document (Ctrl F)</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Settings className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={copyAsMarkdown}
              onCheckedChange={setCopyAsMarkdown}
            >
              Copy as Markdown
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Text size (Ctrl + / Ctrl - / Ctrl 0)</DropdownMenuLabel>
            <div className="flex items-center gap-1 px-2 pb-1.5">
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <button
                onClick={zoomReset}
                className="min-w-[3rem] rounded px-1 text-center text-xs text-foreground hover:bg-accent"
                title="Reset to 100%"
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Page width</DropdownMenuLabel>
            <div className="flex items-center gap-2 px-2 pb-1.5">
              <input
                type="range"
                min={PAPER_WIDTH_MIN}
                max={PAPER_WIDTH_MAX}
                step={20}
                value={paperWidth}
                onChange={(e) => setPaperWidth(Number(e.target.value))}
                className="flex-1 accent-primary"
                aria-label="Page width"
              />
              <button
                onClick={() => setPaperWidth(PAPER_WIDTH_DEFAULT)}
                className="min-w-[3.5rem] rounded px-1 text-center text-xs text-foreground hover:bg-accent"
                title={`Reset to ${PAPER_WIDTH_DEFAULT} px`}
              >
                {paperWidth} px
              </button>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Paper</DropdownMenuLabel>
            <div className="flex items-center gap-1.5 px-2 pb-2">
              {PAPER_PRESETS.map((p) => (
                <button
                  key={p.color}
                  title={p.name}
                  onClick={() => setPaper(p.color)}
                  className={cn(
                    "size-6 shrink-0 rounded-full border border-white/20",
                    paper.toLowerCase() === p.color && "ring-2 ring-primary ring-offset-1 ring-offset-popover"
                  )}
                  style={{ background: p.color }}
                />
              ))}
              <label
                title="Custom color"
                className="relative size-6 shrink-0 cursor-pointer overflow-hidden rounded-full border border-white/20"
                style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
              >
                <input
                  type="color"
                  value={paper}
                  onChange={(e) => setPaper(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
