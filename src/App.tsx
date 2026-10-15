import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { MessageSquarePlus } from "lucide-react";
import { ThemeProvider } from "@/lib/theme";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { ResizeHandle } from "@/components/ResizeHandle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ReportTree, reportLabel, type Selection } from "@/components/ReportTree";
import { Toolbar } from "@/components/Toolbar";
import { Viewer, type Document, type TextSelection, type ViewerHandle } from "@/components/Viewer";
import { DocSearch } from "@/components/DocSearch";
import { AnnotationsPanel, type Draft } from "@/components/AnnotationsPanel";
import { ImageViewer } from "@/components/ImageViewer";
import { StartScreen } from "@/components/StartScreen";
import { SearchBox, SearchResults } from "@/components/SearchPanel";
import { tauri, onOpenDir, assetUrl, type Galley, type Report, type SearchHit } from "@/lib/tauri";
import { parseAnnotations, serializeAnnotations, type Annotation } from "@/lib/annotations";
import { buildPrompt, copyText } from "@/lib/prompt";
import { renderMarkdown } from "@/lib/markdown";
import { isRelativePath, resolveRelative } from "@/lib/paths";

const POLL_MS = 2000;

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return `${dir}${sep}${name}`;
}

// Absolute paths of the local images of a document.
function imagePaths(doc: Document): string[] {
  const out: string[] = [];
  renderMarkdown(doc.source, (src) => {
    if (isRelativePath(src)) out.push(resolveRelative(doc.filePath, src));
    return src;
  });
  return out;
}

function AppShell() {
  const [galley, setGalley] = useState<Galley | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [diffOn, setDiffOn] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [compareDoc, setCompareDoc] = useState<Document | null>(null);
  const [imageHashes, setImageHashes] = useState<Record<string, string>>({});
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [textSel, setTextSel] = useState<TextSelection | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findLine, setFindLine] = useState<number | null>(null);
  const [allQuery, setAllQuery] = useState("");
  const allInputRef = useRef<HTMLInputElement>(null);
  const [contentNonce, setContentNonce] = useState(0);
  // Increments on each manual reload; the snapshot files load again.
  const [reloadNonce, setReloadNonce] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  const articleRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<ViewerHandle>(null);
  const exportPdfRef = useRef<(() => void) | null>(null);
  const galleyJson = useRef("");
  const { zoomIn, zoomOut, zoomReset, sidebarLeftWidth, sidebarRightWidth, setSidebarWidth, resetSidebarWidth } =
    usePreferences();

  const report: Report | null = galley?.reports.find((r) => r.name === selection?.report) ?? null;
  const snapshot = report?.snapshots.find((s) => s.name === selection?.snapshot) ?? null;
  const references = useMemo(
    () => (report?.snapshots ?? []).map((s) => s.name).filter((n) => n !== snapshot?.name),
    [report, snapshot?.name]
  );

  const applyGalley = useCallback((g: Galley) => {
    const json = JSON.stringify(g);
    if (json === galleyJson.current) return;
    galleyJson.current = json;
    setGalley(g);
  }, []);

  const openDir = useCallback(
    async (path: string) => {
      try {
        const g = await tauri.openDir(path);
        setSelection(null);
        applyGalley(g);
        setError(null);
      } catch (e) {
        setError(String(e));
      }
    },
    [applyGalley]
  );

  const pickDir = useCallback(async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") openDir(picked);
  }, [openDir]);

  // Asks for a directory for a new galley, creates it if necessary, writes
  // GALLEY.md into it and opens it. The folder picker has a button to create
  // a new folder.
  const createDir = useCallback(async () => {
    const picked = await openDialog({ title: "Create a galley directory", directory: true, multiple: false });
    if (typeof picked !== "string") return;
    try {
      await tauri.createDir(picked);
      openDir(picked);
    } catch (e) {
      setError(String(e));
    }
  }, [openDir]);

  // Open the directory from the command line, and directories from later
  // launches. Without a directory, the start screen shows.
  useEffect(() => {
    tauri.getInitialDir().then((d) => {
      if (d) openDir(d);
    });
    tauri.getRecentDirs().then(setRecent).catch(() => {});
    const off = onOpenDir(openDir);
    return () => {
      off.then((fn) => fn());
    };
  }, [openDir]);

  // Poll the directory. Polling works on all file systems, also on network
  // mounts and container volumes that do not report file events.
  useEffect(() => {
    if (!galley) return;
    const id = setInterval(() => {
      tauri.scanDir().then(applyGalley).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [galley != null, applyGalley]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selection valid: default to the last snapshot of the newest report.
  useEffect(() => {
    if (!galley) return;
    const r = galley.reports.find((x) => x.name === selection?.report) ?? galley.reports[0];
    if (!r) {
      if (selection) setSelection(null);
      return;
    }
    const s = r.snapshots.find((x) => x.name === selection?.snapshot) ?? r.snapshots[r.snapshots.length - 1];
    if (r.name !== selection?.report || s.name !== selection?.snapshot) {
      setSelection({ report: r.name, snapshot: s.name });
    }
  }, [galley, selection]);

  // Load the report of the selected snapshot, and reload it when it changes.
  useEffect(() => {
    if (!snapshot) {
      setDoc(null);
      return;
    }
    // Ignore responses that arrive after the selection changes.
    let cancelled = false;
    const filePath = joinPath(snapshot.path, "report.md");
    tauri
      .readFile(filePath)
      .then((source) => !cancelled && setDoc({ source, filePath, version: reloadNonce }))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [snapshot?.path, snapshot?.report_modified, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // The annotations of the previous snapshot never apply to a new selection.
  useEffect(() => {
    setAnnotations([]);
  }, [snapshot?.path]);

  // Load the annotations of the selected snapshot.
  useEffect(() => {
    if (!snapshot) {
      setAnnotations([]);
      return;
    }
    let cancelled = false;
    tauri
      .readAnnotations(snapshot.path)
      .then((text) => !cancelled && setAnnotations(parseAnnotations(text)))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [snapshot?.path, snapshot?.annotations_modified, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new snapshot starts with no draft, and diffs against its predecessor.
  useEffect(() => {
    setDraft(null);
    setActive(null);
    setTextSel(null);
    if (!report || !snapshot) return;
    const idx = report.snapshots.findIndex((s) => s.name === snapshot.name);
    const prev = report.snapshots[idx - 1] ?? report.snapshots[idx + 1];
    setReference(prev?.name ?? null);
  }, [report?.name, snapshot?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the reference document of the diff.
  const refSnapshot = report?.snapshots.find((s) => s.name === reference) ?? null;
  useEffect(() => {
    if (!diffOn || !refSnapshot) {
      setCompareDoc(null);
      return;
    }
    let cancelled = false;
    const filePath = joinPath(refSnapshot.path, "report.md");
    tauri
      .readFile(filePath)
      .then((source) => !cancelled && setCompareDoc({ source, filePath, version: reloadNonce }))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [diffOn, refSnapshot?.path, refSnapshot?.report_modified, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hash the images of both documents, so the diff detects changed images.
  useEffect(() => {
    if (!doc || !compareDoc) return;
    const urls = [doc, compareDoc].flatMap((d) => imagePaths(d).map((p) => ({ p, url: assetUrl(p, d.version) })));
    if (urls.length === 0) return;
    let cancelled = false;
    tauri
      .hashFiles(urls.map((u) => u.p))
      .then((hashes) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        urls.forEach((u, i) => {
          const h = hashes[i];
          if (h) map[u.url] = h;
        });
        setImageHashes(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [doc, compareDoc]);

  const saveAnnotations = useCallback(
    async (list: Annotation[]) => {
      if (!snapshot) return;
      setAnnotations(list);
      try {
        await tauri.writeAnnotations(snapshot.path, serializeAnnotations(list));
      } catch (e) {
        setError(String(e));
      }
    },
    [snapshot]
  );

  const onSaveDraft = (d: Draft) => {
    const entry: Annotation = { quote: d.quote, comment: d.comment.trim() };
    if (d.context) entry.context = d.context;
    const list = d.index == null ? [...annotations, entry] : annotations.map((a, i) => (i === d.index ? entry : a));
    saveAnnotations(list);
    setActive(d.index ?? list.length - 1);
    setDraft(null);
  };

  const onDelete = (index: number) => {
    saveAnnotations(annotations.filter((_, i) => i !== index));
    setActive(null);
  };

  const activate = (index: number) => {
    setActive(index);
    articleRef.current
      ?.querySelector(`mark.galley-annotation[data-annotation="${index}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const onDeleteReport = async (r: Report) => {
    try {
      await tauri.deleteReport(r.path);
      applyGalley(await tauri.scanDir());
    } catch (e) {
      setError(String(e));
    }
  };

  const onDeleteSnapshots = async (r: Report, names: string[]) => {
    try {
      await tauri.deleteSnapshots(r.path, names);
      applyGalley(await tauri.scanDir());
    } catch (e) {
      setError(String(e));
    }
  };

  // Shows a search hit: selects its snapshot and, for a hit in the report,
  // finds the query in the document.
  const onOpenHit = (hit: SearchHit) => {
    setSelection({ report: hit.report, snapshot: hit.snapshot });
    if (hit.file === "report.md") {
      setFindQuery(allQuery.trim());
      setFindLine(hit.line - 1);
      setSearchOpen(true);
    }
  };

  // Loads the directory, the selected snapshot, its annotations, its images
  // and the reference of the diff again.
  const reload = useCallback(() => {
    if (!galley) return;
    setReloadNonce((n) => n + 1);
    tauri.scanDir().then(applyGalley).catch((e) => setError(String(e)));
  }, [galley != null, applyGalley]); // eslint-disable-line react-hooks/exhaustive-deps

  const onInitRules = async () => {
    try {
      await tauri.initRules();
      applyGalley(await tauri.scanDir());
    } catch (e) {
      setError(String(e));
    }
  };

  // Hide the "Annotate" button when the document scrolls.
  useEffect(() => {
    if (!textSel) return;
    const hide = () => setTextSel(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [textSel]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === "F5") {
        e.preventDefault();
        reload();
      } else if (meta && e.shiftKey && k === "f") {
        e.preventDefault();
        allInputRef.current?.focus();
        allInputRef.current?.select();
      } else if (meta && k === "f") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (meta && k === "p") {
        e.preventDefault();
        exportPdfRef.current?.();
      } else if (meta && k === "o") {
        e.preventDefault();
        pickDir();
      } else if (meta && (e.key === "=" || e.key === "+" || e.code === "NumpadAdd")) {
        e.preventDefault();
        zoomIn();
      } else if (meta && (e.key === "-" || e.code === "NumpadSubtract")) {
        e.preventDefault();
        zoomOut();
      } else if (meta && (k === "0" || e.code === "Numpad0")) {
        e.preventDefault();
        zoomReset();
      }
    };
    // Ctrl + mouse wheel changes the text size, as in a browser.
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.deltaY === 0) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [pickDir, reload, zoomIn, zoomOut, zoomReset]);

  const compare = diffOn && compareDoc ? compareDoc : null;
  const title = report && snapshot
    ? `${reportLabel(report.name).title} · Snapshot ${snapshot.name}${compare ? ` · changes since snapshot ${reference}` : ""}`
    : (galley?.path ?? "No galley directory open");

  // The PDF title is also the default file name, for example
  // "2026-10-09_1430_cache-design_04" or "..._04_changes-since-03".
  const exportPdf =
    report && snapshot && doc
      ? () => {
          const name = `${report.name}_${snapshot.name}${compare ? `_changes-since-${reference}` : ""}`;
          viewerRef.current
            ?.exportPdf(name)
            .then((path) => path && setNotice(`Saved ${path}`))
            .catch((e) => setError(String(e)));
        }
      : null;
  exportPdfRef.current = exportPdf;

  if (!galley) {
    return (
      <>
        <StartScreen recent={recent} onOpen={pickDir} onCreate={createDir} onOpenRecent={openDir} />
        {error && (
          <div className="fixed inset-x-0 bottom-0 bg-destructive/10 px-3 py-1 text-xs text-destructive">{error}</div>
        )}
      </>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex h-full min-h-0 shrink-0" style={{ width: sidebarLeftWidth }}>
        <ReportTree
          galley={galley}
          selection={selection}
          onSelect={setSelection}
          onOpenDir={pickDir}
          onInitRules={onInitRules}
          onDeleteReport={onDeleteReport}
          onDeleteSnapshots={onDeleteSnapshots}
          search={<SearchBox query={allQuery} onQueryChange={setAllQuery} inputRef={allInputRef} />}
          results={
            allQuery.trim() ? <SearchResults query={allQuery} galley={galley} onOpenHit={onOpenHit} /> : null
          }
        />
      </div>
      <ResizeHandle
        side="left"
        onResize={(w) => setSidebarWidth("left", w)}
        onReset={() => resetSidebarWidth("left")}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          title={title}
          references={references}
          diffOn={diffOn}
          onDiffOn={setDiffOn}
          reference={reference}
          onReference={setReference}
          canCopyPrompt={annotations.length > 0}
          onCopyPrompt={async () => {
            if (report && snapshot) {
              await copyText(buildPrompt(report.name, snapshot.name, report.snapshots.map((s) => s.name)));
            }
          }}
          onFind={() => setSearchOpen(true)}
          onReload={snapshot ? reload : null}
          onExportPdf={exportPdf}
        />
        {error && (
          <div className="flex items-center justify-between border-b bg-destructive/10 px-3 py-1 text-xs text-destructive">
            <span className="truncate">{error}</span>
            <button className="ml-2 underline" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1 text-xs">
            <span className="truncate">{notice}</span>
            <button className="ml-2 underline" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1">
          <main className="relative flex min-w-0 flex-1">
            {doc ? (
              <Viewer
                doc={doc}
                compare={compare}
                imageHashes={imageHashes}
                annotations={annotations}
                activeAnnotation={active}
                onSelection={setTextSel}
                onAnnotationClick={activate}
                onImageClick={(src, alt) => setImage({ src, alt })}
                articleRef={articleRef}
                handleRef={viewerRef}
                onRendered={() => setContentNonce((n) => n + 1)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {galley ? "No report selected." : "Open a galley directory (Ctrl+O)."}
              </div>
            )}
            <DocSearch
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              query={findQuery}
              onQueryChange={(q) => {
                setFindQuery(q);
                setFindLine(null);
              }}
              targetLine={findLine}
              containerRef={articleRef}
              contentNonce={contentNonce}
            />
          </main>
          <ResizeHandle
            side="right"
            onResize={(w) => setSidebarWidth("right", w)}
            onReset={() => resetSidebarWidth("right")}
          />
          <aside className="shrink-0 border-l bg-card/30" style={{ width: sidebarRightWidth }}>
            <AnnotationsPanel
              enabled={snapshot != null}
              annotations={annotations}
              active={active}
              onActivate={activate}
              draft={draft}
              onDraft={setDraft}
              onSave={onSaveDraft}
              onDelete={onDelete}
            />
          </aside>
        </div>
      </div>
      {textSel && (
        <Button
          size="xs"
          className="fixed z-50 shadow-md"
          style={{ top: textSel.rect.bottom + 6, left: textSel.rect.left }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setDraft({ index: null, quote: textSel.quote, context: textSel.context, comment: "" });
            setTextSel(null);
            window.getSelection()?.removeAllRanges();
          }}
        >
          <MessageSquarePlus />
          Annotate
        </Button>
      )}
      {image && <ImageViewer src={image.src} alt={image.alt} onClose={() => setImage(null)} />}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <PreferencesProvider>
        <TooltipProvider delayDuration={300}>
          <AppShell />
        </TooltipProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
