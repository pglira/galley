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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Settings,
  Minus,
  Plus,
  ClipboardCopy,
  Check,
  ChevronDown,
  FileDown,
  RotateCw,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { useTheme, PAPER_PRESETS } from "@/lib/theme";
import { DOC_FONTS } from "@/lib/fonts";
import {
  usePreferences,
  ZOOM_MIN,
  ZOOM_MAX,
  PAPER_WIDTH_MIN,
  PAPER_WIDTH_MAX,
  PAPER_WIDTH_DEFAULT,
} from "@/lib/preferences";

// The title bar of a group of settings.
const GROUP_TITLE = "border-b border-border bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground";

interface Props {
  title: string;
  // Names of the snapshots that the diff can use as reference.
  references: string[];
  diffOn: boolean;
  onDiffOn: (on: boolean) => void;
  reference: string | null;
  onReference: (name: string) => void;
  // The side-by-side view of the diff of a PDF document, or null for no such diff.
  sideBySide: { on: boolean; onChange: (on: boolean) => void } | null;
  canCopyPrompt: boolean;
  // True for a short time after the prompt was copied.
  copied: boolean;
  onCopyPrompt: () => void;
  onFind: () => void;
  // Null if no snapshot is selected.
  onReload: (() => void) | null;
  // Null if no document shows.
  onExportPdf: (() => void) | null;
  // The visibility of the document tree (left) and of the annotations panel (right).
  sidebars: { left: boolean; right: boolean };
  onSidebars: (sidebars: { left: boolean; right: boolean }) => void;
}

export function Toolbar({
  title,
  references,
  diffOn,
  onDiffOn,
  reference,
  onReference,
  sideBySide,
  canCopyPrompt,
  copied,
  onCopyPrompt,
  onFind,
  onReload,
  onExportPdf,
  sidebars,
  onSidebars,
}: Props) {
  const { paper, setPaper } = useTheme();
  const {
    copyAsMarkdown,
    setCopyAsMarkdown,
    docFont,
    setDocFont,
    zoom,
    zoomIn,
    zoomOut,
    zoomReset,
    paperWidth,
    setPaperWidth,
  } = usePreferences();
  const noReference = references.length === 0;

  return (
    <header className="flex h-9 shrink-0 items-center justify-between gap-3 border-b bg-card/40 px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => onSidebars({ ...sidebars, left: !sidebars.left })}
              variant="ghost"
              size="icon-xs"
              className={cn(!sidebars.left && "text-muted-foreground")}
              aria-label={sidebars.left ? "Hide document list" : "Show document list"}
              aria-pressed={sidebars.left}
            >
              <PanelLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebars.left ? "Hide" : "Show"} document list (Ctrl B: both sidebars)</TooltipContent>
        </Tooltip>
        <div className="truncate text-xs text-muted-foreground">{title}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <label
          className={cn("flex items-center gap-2 text-[13px]", noReference && "opacity-50")}
          title={noReference ? "This document has only one snapshot" : "Show the changes since a reference snapshot"}
        >
          <input
            type="checkbox"
            className="checkbox"
            checked={diffOn && !noReference}
            disabled={noReference}
            onChange={(e) => onDiffOn(e.target.checked)}
          />
          Diff against
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={noReference}>
            <Button variant="outline" size="xs" className="ml-1 text-[13px] font-normal">
              {reference ? `Snapshot ${reference}` : "No snapshot"}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-36">
            <DropdownMenuRadioGroup
              value={reference ?? ""}
              onValueChange={(r) => {
                onReference(r);
                onDiffOn(true);
              }}
            >
              {references.map((r) => (
                <DropdownMenuRadioItem key={r} value={r}>
                  Snapshot {r}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {sideBySide && (
          <label
            className="ml-2 flex items-center gap-2 text-[13px]"
            title="Show the pages of the reference snapshot next to the pages"
          >
            <input
              type="checkbox"
              className="checkbox"
              checked={sideBySide.on}
              onChange={(e) => sideBySide.onChange(e.target.checked)}
            />
            Side by side
          </label>
        )}
        <div className="mx-2 h-4 w-px bg-border" />
        <Button
          variant={canCopyPrompt ? "default" : "outline"}
          size="xs"
          className="text-[13px]"
          disabled={!canCopyPrompt}
          title={
            canCopyPrompt
              ? "Copy a prompt for the agent to the clipboard (Ctrl Shift C)"
              : "Add annotations to this snapshot first"
          }
          onClick={onCopyPrompt}
        >
          {copied ? <Check /> : <ClipboardCopy />}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => onReload?.()}
              disabled={!onReload}
              variant="ghost"
              size="icon-xs"
              aria-label="Reload snapshot"
            >
              <RotateCw />
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
              size="icon-xs"
              aria-label="Export PDF"
            >
              <FileDown />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export PDF (Ctrl P)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={onFind} variant="ghost" size="icon-xs" aria-label="Find in document">
              <Search />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Find in document (Ctrl F)</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Settings">
                  <Settings />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-72">
            <div className="m-1 border border-border">
              <div className={GROUP_TITLE}>All documents</div>
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
                  className="min-w-[3rem] px-1 text-center text-xs text-foreground hover:bg-accent"
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
              <DropdownMenuSeparator className="mx-0" />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Page width</DropdownMenuLabel>
              <div className="flex items-center gap-2 px-2 pb-1.5">
                <input
                  type="range"
                  min={PAPER_WIDTH_MIN}
                  max={PAPER_WIDTH_MAX}
                  step={20}
                  value={paperWidth}
                  onChange={(e) => setPaperWidth(Number(e.target.value))}
                  className="flex-1"
                  aria-label="Page width"
                />
                <button
                  onClick={() => setPaperWidth(PAPER_WIDTH_DEFAULT)}
                  className="min-w-[3.5rem] px-1 text-center text-xs text-foreground hover:bg-accent"
                  title={`Reset to ${PAPER_WIDTH_DEFAULT} px`}
                >
                  {paperWidth} px
                </button>
              </div>
            </div>
            <div className="m-1 mt-2 border border-border">
              <div className={GROUP_TITLE} title="PDF documents keep their own font and page color">Markdown documents only</div>
              <DropdownMenuCheckboxItem
                checked={copyAsMarkdown}
                onCheckedChange={setCopyAsMarkdown}
              >
                Copy as Markdown
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator className="mx-0" />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Paper</DropdownMenuLabel>
              <div className="flex items-center gap-1.5 px-2 pb-2">
                {PAPER_PRESETS.map((p) => (
                  <button
                    key={p.color}
                    title={p.name}
                    onClick={() => setPaper(p.color)}
                    className={cn(
                      "size-6 shrink-0 border border-white/20",
                      paper.toLowerCase() === p.color && "ring-2 ring-primary ring-offset-1 ring-offset-popover"
                    )}
                    style={{ background: p.color }}
                  />
                ))}
                <label
                  title="Custom color"
                  className="relative size-6 shrink-0 cursor-pointer overflow-hidden border border-white/20"
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
              <DropdownMenuSeparator className="mx-0" />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Document font</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={docFont} onValueChange={setDocFont}>
                {DOC_FONTS.map((f) => (
                  <DropdownMenuRadioItem
                    key={f.id}
                    value={f.id}
                    style={{ fontFamily: f.family }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {f.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => onSidebars({ ...sidebars, right: !sidebars.right })}
              variant="ghost"
              size="icon-xs"
              className={cn(!sidebars.right && "text-muted-foreground")}
              aria-label={sidebars.right ? "Hide annotations" : "Show annotations"}
              aria-pressed={sidebars.right}
            >
              <PanelRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebars.right ? "Hide" : "Show"} annotations (Ctrl B: both sidebars)</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
