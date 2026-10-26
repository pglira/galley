import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { MessageSquarePlus } from "lucide-react";
import { ThemeProvider } from "@/lib/theme";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { ResizeHandle } from "@/components/ResizeHandle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DocumentTree, documentLabel, type Selection } from "@/components/DocumentTree";
import { Toolbar } from "@/components/Toolbar";
import { PdfViewer } from "@/components/PdfViewer";
import { Viewer, findAnswer, findChoice, type Choice, type Content, type DocImage, type RegionSelection, type TextSelection, type ViewerHandle } from "@/components/Viewer";
import { DocSearch } from "@/components/DocSearch";
import { AnnotationsPanel, type Draft } from "@/components/AnnotationsPanel";
import { ImageViewer } from "@/components/ImageViewer";
import { StartScreen } from "@/components/StartScreen";
import { RulesEditor } from "@/components/RulesEditor";
import { PdfExportDialog } from "@/components/PdfExportDialog";
import type { PdfOptions } from "@/lib/pdfOptions";
import { SearchBox, SearchResults } from "@/components/SearchPanel";
import { TableOfContents } from "@/components/TableOfContents";
import { TabBar } from "@/components/TabBar";
import { tauri, assetUrl, type Galley, type Document, type SearchHit, type Snapshot } from "@/lib/tauri";
import { parseAnnotations, serializeAnnotations, type Annotation } from "@/lib/annotations";
import { buildPrompt, copyText } from "@/lib/prompt";
import { renderMarkdown } from "@/lib/markdown";
import { dirLabels, isRelativePath, resolveRelative } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { nextPaint, regionImageName } from "@/lib/region";

const POLL_MS = 2000;

function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return `${dir}${sep}${name}`;
}

const isPdf = (s: Snapshot) => s.document.endsWith(".pdf");

// Loads the document of a snapshot: the text of a Markdown document, or the
// bytes of a PDF document.
async function loadContent(root: string, snapshot: Snapshot, version: number): Promise<Content> {
  const filePath = joinPath(snapshot.path, snapshot.document);
  if (isPdf(snapshot)) return { source: "", pdf: await tauri.readBinary(root, filePath), filePath, version };
  return { source: await tauri.readFile(root, filePath), filePath, version };
}

// Absolute paths of the local images of the content of a snapshot.
function imagePaths(content: Content): string[] {
  const out: string[] = [];
  renderMarkdown(content.source, (src) => {
    if (isRelativePath(src)) out.push(resolveRelative(content.filePath, src));
    return src;
  });
  return out;
}

interface GalleyViewProps {
  // The galley as `open_dir` returns it. Its `path` identifies the galley.
  initial: Galley;
  // The name of the galley, as its tab shows it.
  name: string;
  // Only the galley of the shown tab polls its directory and handles keys.
  shown: boolean;
  onOpenDir: () => void;
}

// The tree, the document and the annotations of one galley directory.
function GalleyView({ initial, name, shown, onOpenDir }: GalleyViewProps) {
  const root = initial.path;
  const [galley, setGalley] = useState<Galley>(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [diffOn, setDiffOn] = useState(false);
  // The diff of PDF documents shows the reference pages next to the pages.
  const [sideBySide, setSideBySide] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [compareContent, setCompareContent] = useState<Content | null>(null);
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
  const [gallery, setGallery] = useState<{ images: DocImage[]; index: number } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<ViewerHandle>(null);
  const exportPdfRef = useRef<(() => void) | null>(null);
  const copyPromptRef = useRef<(() => void) | null>(null);
  const annotateRef = useRef<(() => void) | null>(null);
  const addGeneralRef = useRef<(() => void) | null>(null);
  const galleyJson = useRef(JSON.stringify(initial));
  const { sidebarLeftWidth, sidebarRightWidth, setSidebarWidth, resetSidebarWidth, pdf, setPdf } =
    usePreferences();

  const doc: Document | null = galley?.documents.find((r) => r.name === selection?.document) ?? null;
  const snapshot = doc?.snapshots.find((s) => s.name === selection?.snapshot) ?? null;
  // The diff compares documents of the same kind: Markdown or PDF.
  const references = useMemo(
    () =>
      snapshot
        ? (doc?.snapshots ?? []).filter((s) => s.name !== snapshot.name && isPdf(s) === isPdf(snapshot)).map((s) => s.name)
        : [],
    [doc, snapshot]
  );

  const applyGalley = useCallback((g: Galley) => {
    const json = JSON.stringify(g);
    if (json === galleyJson.current) return;
    galleyJson.current = json;
    setGalley(g);
  }, []);

  // Poll the directory while the tab shows, and scan it at once when the tab
  // shows again. Polling works on all file systems, also on network mounts
  // and container volumes that do not report file events.
  useEffect(() => {
    if (!shown) return;
    const scan = () => tauri.scanDir(root).then(applyGalley).catch(() => {});
    scan();
    const id = setInterval(scan, POLL_MS);
    return () => clearInterval(id);
  }, [shown, root, applyGalley]);

  // Keep the selection valid: default to the last snapshot of the newest document.
  useEffect(() => {
    const r = galley.documents.find((x) => x.name === selection?.document) ?? galley.documents[0];
    if (!r) {
      if (selection) setSelection(null);
      return;
    }
    const s = r.snapshots.find((x) => x.name === selection?.snapshot) ?? r.snapshots[r.snapshots.length - 1];
    if (r.name !== selection?.document || s.name !== selection?.snapshot) {
      setSelection({ document: r.name, snapshot: s.name });
    }
  }, [galley, selection]);

  // Load the content of the selected snapshot, and reload it when it changes.
  useEffect(() => {
    if (!snapshot) {
      setContent(null);
      return;
    }
    // Ignore responses that arrive after the selection changes.
    let cancelled = false;
    loadContent(root, snapshot, reloadNonce)
      .then((c) => !cancelled && setContent(c))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [snapshot?.path, snapshot?.document, snapshot?.document_modified, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
      .readAnnotations(root, snapshot.path)
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
    if (!doc || !snapshot) return;
    const idx = doc.snapshots.findIndex((s) => s.name === snapshot.name);
    const prev = [doc.snapshots[idx - 1], doc.snapshots[idx + 1]].find((s) => s && isPdf(s) === isPdf(snapshot));
    setReference(prev?.name ?? null);
  }, [doc?.name, snapshot?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the content of the reference snapshot of the diff.
  const refSnapshot = doc?.snapshots.find((s) => s.name === reference) ?? null;
  useEffect(() => {
    if (!diffOn || !refSnapshot) {
      setCompareContent(null);
      return;
    }
    let cancelled = false;
    loadContent(root, refSnapshot, reloadNonce)
      .then((c) => !cancelled && setCompareContent(c))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [diffOn, refSnapshot?.path, refSnapshot?.document_modified, reloadNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hash the images of both documents, so the diff detects changed images.
  useEffect(() => {
    if (!content || !compareContent) return;
    const urls = [content, compareContent].flatMap((d) => imagePaths(d).map((p) => ({ p, url: assetUrl(p, d.version) })));
    if (urls.length === 0) return;
    let cancelled = false;
    tauri
      .hashFiles(root, urls.map((u) => u.p))
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
  }, [content, compareContent]);

  const saveAnnotations = useCallback(
    async (list: Annotation[]) => {
      if (!snapshot) return;
      setAnnotations(list);
      try {
        await tauri.writeAnnotations(root, snapshot.path, serializeAnnotations(list));
      } catch (e) {
        setError(String(e));
      }
    },
    [root, snapshot]
  );

  const onSaveDraft = async (d: Draft) => {
    // A new region writes its screenshot first, so that the annotation never
    // refers to a missing file.
    if (d.png && d.region && snapshot) {
      try {
        await tauri.writeRegionImage(root, snapshot.path, d.region.replace(/^.*\//, ""), d.png);
      } catch (e) {
        setError(String(e));
        return;
      }
    }
    const entry: Annotation = { quote: d.quote, comment: d.comment.trim() };
    if (d.context) entry.context = d.context;
    if (d.page) entry.page = d.page;
    if (d.region) entry.region = d.region;
    if (d.image) entry.image = d.image;
    if (d.checked !== undefined) entry.checked = d.checked;
    if (d.answer) entry.answer = true;
    const list = d.index == null ? [...annotations, entry] : annotations.map((a, i) => (i === d.index ? entry : a));
    saveAnnotations(list);
    setActive(d.index ?? list.length - 1);
    setDraft(null);
  };

  const onDelete = (index: number) => {
    saveAnnotations(annotations.filter((_, i) => i !== index));
    setActive(null);
  };

  // A click on a checkbox inverts its shown state. A checkbox annotation
  // without a comment that comes back to the state in the document is removed.
  const onCheck = (choice: Choice) => {
    if (!snapshot) return;
    const i = findChoice(annotations, choice);
    const checked = !(i >= 0 ? annotations[i].checked : choice.checked);
    if (i >= 0 && checked === choice.checked && !annotations[i].comment) {
      saveAnnotations(annotations.filter((_, j) => j !== i));
      setActive(null);
      return;
    }
    const entry: Annotation = { quote: choice.text, checked, comment: i >= 0 ? annotations[i].comment : "" };
    if (choice.question) entry.context = choice.question;
    const list = i >= 0 ? annotations.map((a, j) => (j === i ? entry : a)) : [...annotations, entry];
    saveAnnotations(list);
    setActive(i >= 0 ? i : list.length - 1);
  };

  // The text of a text field is the answer to its question. An empty text
  // removes the answer.
  const onAnswer = (question: string, text: string) => {
    if (!snapshot) return;
    const i = findAnswer(annotations, question);
    const comment = text.trim();
    if (i >= 0 && annotations[i].comment === comment) return;
    if (!comment) {
      if (i >= 0) saveAnnotations(annotations.filter((_, j) => j !== i));
      setActive(null);
      return;
    }
    const entry: Annotation = { quote: question, answer: true, comment };
    const list = i >= 0 ? annotations.map((a, j) => (j === i ? entry : a)) : [...annotations, entry];
    saveAnnotations(list);
    setActive(i >= 0 ? i : list.length - 1);
  };

  // Takes a screenshot of a region without the marks of the annotations and
  // opens a draft for it.
  const onRegion = async (sel: RegionSelection) => {
    if (!snapshot) return;
    setTextSel(null);
    document.body.classList.add("galley-capture");
    try {
      await nextPaint();
      const { x, y, width, height } = sel.rect;
      const png = await tauri.captureRegion({ x, y, width, height });
      setDraft({
        index: null,
        quote: "",
        region: `annotations/${regionImageName()}`,
        png,
        ...(sel.page && { page: sel.page }),
        ...(sel.context && { context: sel.context }),
        comment: "",
      });
    } catch (e) {
      setError(`Screenshot failed: ${e}`);
    } finally {
      document.body.classList.remove("galley-capture");
    }
  };

  const activate = (index: number) => {
    setActive(index);
    const image = annotations[index]?.image;
    const region = annotations[index]?.region;
    const page = annotations[index]?.page;
    const target = region
      ? page
        ? articleRef.current?.querySelector(`.pdf-page[data-page="${page}"]`)
        : null
      : annotations[index]?.checked !== undefined
      ? articleRef.current?.querySelector(`li.galley-choice-item[data-annotation="${index}"]`)
      : annotations[index]?.answer
      ? articleRef.current?.querySelector(`.galley-answer[data-annotation="${index}"]`)
      : image
      ? Array.from(articleRef.current?.querySelectorAll("img.galley-annotated-image") ?? []).find(
          (el) => el.getAttribute("data-src") === image
        )
      : articleRef.current?.querySelector(`mark.galley-annotation[data-annotation="${index}"]`);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // The annotations of the image that the image viewer shows.
  const shownImage = gallery ? gallery.images[gallery.index] : null;
  const imageComments = shownImage
    ? annotations.filter((a) => a.image && a.image === shownImage.path).map((a) => a.comment)
    : [];
  const commentOnImage =
    snapshot && shownImage && shownImage.path && !shownImage.removed
      ? (comment: string) => {
          const list = [...annotations, { quote: "", image: shownImage.path, comment }];
          saveAnnotations(list);
          setActive(list.length - 1);
        }
      : null;

  // The URL of an image path of the shown document.
  const imageUrl = (path: string) =>
    content && isRelativePath(path) ? assetUrl(resolveRelative(content.filePath, path), content.version) : path;

  const onDeleteDocument = async (r: Document) => {
    try {
      await tauri.deleteDocument(root, r.path);
      applyGalley(await tauri.scanDir(root));
    } catch (e) {
      setError(String(e));
    }
  };

  const onDeleteSnapshots = async (r: Document, names: string[]) => {
    try {
      await tauri.deleteSnapshots(root, r.path, names);
      applyGalley(await tauri.scanDir(root));
    } catch (e) {
      setError(String(e));
    }
  };

  // Shows a search hit: selects its snapshot and, for a hit in the document,
  // finds the query in the document.
  const onOpenHit = (hit: SearchHit) => {
    setSelection({ document: hit.document, snapshot: hit.snapshot });
    if (hit.file === "document.md") {
      setFindQuery(allQuery.trim());
      setFindLine(hit.line - 1);
      setSearchOpen(true);
    }
  };

  // Loads the directory, the selected snapshot, its annotations, its images
  // and the reference of the diff again.
  const reload = useCallback(() => {
    setReloadNonce((n) => n + 1);
    tauri.scanDir(root).then(applyGalley).catch((e) => setError(String(e)));
  }, [root, applyGalley]);

  const onInitRules = async () => {
    try {
      await tauri.initRules(root);
      applyGalley(await tauri.scanDir(root));
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

  // Keyboard shortcuts of the galley in the shown tab.
  useEffect(() => {
    if (!shown) return;
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
      } else if (meta && e.shiftKey && k === "m") {
        e.preventDefault();
        addGeneralRef.current?.();
      } else if (meta && k === "m") {
        e.preventDefault();
        annotateRef.current?.();
      } else if (meta && e.shiftKey && k === "c") {
        e.preventDefault();
        copyPromptRef.current?.();
      } else if (meta && k === "p") {
        e.preventDefault();
        exportPdfRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, reload]);

  const compare = diffOn && compareContent && !!content?.pdf === !!compareContent.pdf ? compareContent : null;
  const title = doc && snapshot
    ? `${documentLabel(doc.name).title} · Snapshot ${snapshot.name}${compare ? ` · changes since snapshot ${reference}` : ""}`
    : galley.path;

  // The PDF title is also the default file name, for example
  // "2026-10-09_1430_cache-design_04" or "..._04_changes-since-03".
  const runExportPdf = (options: PdfOptions) => {
    setPdfOpen(false);
    setPdf(options);
    if (!doc || !snapshot) return;
    const name = `${doc.name}_${snapshot.name}${compare ? `_changes-since-${reference}` : ""}`;
    viewerRef.current
      ?.exportPdf(name, options)
      .then((path) => path && setNotice(`Saved ${path}`))
      .catch((e) => setError(String(e)));
  };
  // Opens the options of the PDF export; the export starts from there.
  // A PDF document is a PDF file already.
  const exportPdf = doc && snapshot && content && !content.pdf ? () => setPdfOpen(true) : null;
  exportPdfRef.current = exportPdf;

  const [copied, setCopied] = useState(false);
  // Copy the prompt for the agent. Does nothing if the snapshot has no annotations.
  const copyPrompt = useCallback(async () => {
    if (!doc || !snapshot || annotations.length === 0) return;
    await copyText(buildPrompt(doc.name, snapshot.name, doc.snapshots.map((s) => s.name)));
    setCopied(true);
  }, [doc, snapshot, annotations.length]);
  copyPromptRef.current = copyPrompt;

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  // Opens a draft for the selected text.
  const annotateSelection = () => {
    if (!textSel || textSel.removed) return;
    setDraft({ index: null, quote: textSel.quote, context: textSel.context, page: textSel.page, comment: "" });
    setTextSel(null);
    window.getSelection()?.removeAllRanges();
  };
  annotateRef.current = annotateSelection;

  // Opens a draft for a general comment.
  addGeneralRef.current = () => {
    if (snapshot) setDraft({ index: null, quote: "", comment: "" });
  };

  return (
    <div className="flex h-full">
      <div className="flex h-full min-h-0 shrink-0" style={{ width: sidebarLeftWidth }}>
        <DocumentTree
          galley={galley}
          name={name}
          selection={selection}
          onSelect={setSelection}
          onOpenDir={onOpenDir}
          onInitRules={onInitRules}
          onEditRules={() => setRulesOpen(true)}
          onDeleteDocument={onDeleteDocument}
          onDeleteSnapshots={onDeleteSnapshots}
          search={<SearchBox query={allQuery} onQueryChange={setAllQuery} inputRef={allInputRef} />}
          results={
            allQuery.trim() ? <SearchResults query={allQuery} galley={galley} onOpenHit={onOpenHit} /> : null
          }
          contents={content ? <TableOfContents articleRef={articleRef} contentNonce={contentNonce} /> : null}
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
          sideBySide={content?.pdf && compare ? { on: sideBySide, onChange: setSideBySide } : null}
          canCopyPrompt={annotations.length > 0}
          copied={copied}
          onCopyPrompt={copyPrompt}
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
            {content?.pdf ? (
              <PdfViewer
                content={content}
                compare={compare}
                sideBySide={sideBySide && compare != null}
                annotations={annotations}
                activeAnnotation={active}
                onSelection={setTextSel}
                onAnnotationClick={activate}
                onRegion={onRegion}
                keyNavigation={shown && !gallery && !rulesOpen}
                articleRef={articleRef}
                onRendered={() => setContentNonce((n) => n + 1)}
                onError={setError}
              />
            ) : content ? (
              <Viewer
                content={content}
                compare={compare}
                imageHashes={imageHashes}
                annotations={annotations}
                activeAnnotation={active}
                onSelection={setTextSel}
                onAnnotationClick={activate}
                onImageClick={(images, index) => setGallery({ images, index })}
                onCheck={onCheck}
                onAnswer={onAnswer}
                onRegion={onRegion}
                keyNavigation={shown && !gallery && !rulesOpen}
                articleRef={articleRef}
                handleRef={viewerRef}
                onRendered={() => setContentNonce((n) => n + 1)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                No document selected.
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
              skip={content?.pdf ? ".pdf-old-page" : undefined}
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
              imageUrl={imageUrl}
            />
          </aside>
        </div>
      </div>
      {textSel?.removed && (
        <div
          className="fixed z-50 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ top: textSel.rect.bottom + 6, left: textSel.rect.left }}
        >
          Removed text is not in this snapshot. Annotate the new text or add a general comment.
        </div>
      )}
      {textSel && !textSel.removed && (
        <Button
          size="xs"
          className="fixed z-50 shadow-md"
          style={{ top: textSel.rect.bottom + 6, left: textSel.rect.left }}
          onMouseDown={(e) => e.preventDefault()}
          title="Annotate (Ctrl M)"
          onClick={annotateSelection}
        >
          <MessageSquarePlus />
          Annotate
        </Button>
      )}
      {gallery && (
        <ImageViewer
          images={gallery.images}
          index={gallery.index}
          onIndex={(index) => setGallery({ ...gallery, index })}
          comments={imageComments}
          onComment={commentOnImage}
          onClose={() => setGallery(null)}
        />
      )}
      <RulesEditor
        root={root}
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        onSaved={() => setNotice("Saved GALLEY.md")}
        onError={setError}
      />
      <PdfExportDialog open={pdfOpen} options={pdf} onClose={() => setPdfOpen(false)} onExport={runExportPdf} />
    </div>
  );
}

interface Tab {
  id: number;
  // The galley as `open_dir` returns it, or null for the start screen.
  galley: Galley | null;
}

interface Tabs {
  list: Tab[];
  active: number;
}

let nextTabId = 1;
const makeTab = (galley: Galley | null = null): Tab => ({ id: nextTabId++, galley });

// True if a dialog shows, for example the editor of GALLEY.md or the image
// viewer. The tab does not change while a dialog shows.
const dialogShows = () => document.querySelector('[role="dialog"]') != null;

// The window: one tab for each open galley directory. A tab without a galley
// shows the start screen.
function AppShell() {
  const [tabs, setTabs] = useState<Tabs>(() => {
    const t = makeTab();
    return { list: [t], active: t.id };
  });
  const [recent, setRecent] = useState<string[]>([]);
  // The names that the user gives to tabs, by galley path.
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const { zoomIn, zoomOut, zoomReset } = usePreferences();

  // Opens a galley directory in the shown tab if that tab has the start
  // screen, else in a new tab. A galley that is open already only shows its
  // tab.
  const openDir = useCallback(async (path: string) => {
    try {
      const g = await tauri.openDir(path);
      setTabs(({ list, active }) => {
        const current = list.find((t) => t.id === active);
        const empty = current && !current.galley ? current : null;
        const open = list.find((t) => t.galley?.path === g.path);
        if (open) return { list: list.filter((t) => t !== empty), active: open.id };
        if (empty) return { list: list.map((t) => (t === empty ? { ...t, galley: g } : t)), active };
        const t = makeTab(g);
        return { list: [...list, t], active: t.id };
      });
      setError(null);
      tauri.getRecentDirs().then(setRecent).catch(() => {});
    } catch (e) {
      setError(String(e));
    }
  }, []);

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

  // Open the directory from the command line. Without a directory, the start
  // screen shows.
  useEffect(() => {
    tauri.getInitialDir().then((d) => {
      if (d) openDir(d);
    });
    tauri.getRecentDirs().then(setRecent).catch(() => {});
    tauri.getTabNames().then(setNames).catch(() => {});
  }, [openDir]);

  const renameTab = (path: string, name: string) =>
    tauri
      .setTabName(path, name)
      .then(setNames)
      .catch((e) => setError(String(e)));

  // Shows the tab with the start screen, and adds it if necessary.
  const newTab = useCallback(() => {
    setTabs(({ list }) => {
      const empty = list.find((t) => !t.galley);
      if (empty) return { list, active: empty.id };
      const t = makeTab();
      return { list: [...list, t], active: t.id };
    });
  }, []);

  // Closes a tab and its galley. The tab to the right shows next. Without
  // tabs, a tab with the start screen shows.
  const closeTab = useCallback(
    (id: number) => {
      const tab = tabs.list.find((t) => t.id === id);
      if (!tab) return;
      if (tab.galley) tauri.closeDir(tab.galley.path).catch(() => {});
      setTabs(({ list, active }) => {
        const i = list.findIndex((t) => t.id === id);
        if (i < 0) return { list, active };
        const rest = list.filter((t) => t.id !== id);
        if (rest.length === 0) {
          const t = makeTab();
          return { list: [t], active: t.id };
        }
        return { list: rest, active: id === active ? rest[Math.min(i, rest.length - 1)].id : active };
      });
    },
    [tabs]
  );

  // Shows the next tab (`step` 1) or the previous tab (`step` -1).
  const cycleTab = useCallback((step: number) => {
    setTabs(({ list, active }) => {
      const i = list.findIndex((t) => t.id === active);
      return { list, active: list[(i + step + list.length) % list.length].id };
    });
  }, []);

  // Keyboard shortcuts of the window. GalleyView has the shortcuts of a galley.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (meta && k === "o") {
        e.preventDefault();
        pickDir();
      } else if (meta && k === "t") {
        e.preventDefault();
        if (!dialogShows()) newTab();
      } else if (meta && k === "w") {
        e.preventDefault();
        if (!dialogShows()) closeTab(tabs.active);
      } else if (meta && (e.key === "Tab" || e.key === "PageDown" || e.key === "PageUp")) {
        e.preventDefault();
        if (!dialogShows()) cycleTab(e.key === "PageUp" || (e.key === "Tab" && e.shiftKey) ? -1 : 1);
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
  }, [pickDir, newTab, closeTab, cycleTab, tabs.active, zoomIn, zoomOut, zoomReset]);

  // The tab bar shows when a galley is open or when there are two tabs.
  const showBar = tabs.list.length > 1 || tabs.list.some((t) => t.galley);

  // A tab shows the name that the user gives it, else the directory name.
  // Equal directory names get their parent directories.
  const paths = tabs.list.flatMap((t) => (t.galley ? [t.galley.path] : []));
  const autoLabels = dirLabels(paths);
  const label = (t: Tab) =>
    t.galley ? (names[t.galley.path] ?? autoLabels[paths.indexOf(t.galley.path)]) : "New tab";

  return (
    <div className="flex h-full flex-col">
      {showBar && (
        <TabBar
          tabs={tabs.list.map((t) => ({ id: t.id, label: label(t), path: t.galley?.path ?? null }))}
          active={tabs.active}
          onActivate={(id) => setTabs(({ list }) => ({ list, active: id }))}
          onClose={closeTab}
          onNew={newTab}
          onRename={renameTab}
        />
      )}
      {error && (
        <div className="flex items-center justify-between border-b bg-destructive/10 px-3 py-1 text-xs text-destructive">
          <span className="truncate">{error}</span>
          <button className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {/* All tabs stay in the document, so that each keeps its scroll
          positions and drafts. Only the active tab is visible. */}
      <div className="relative min-h-0 flex-1">
        {tabs.list.map((t) => (
          <div key={t.id} className={cn("absolute inset-0", t.id !== tabs.active && "invisible")}>
            {t.galley ? (
              <GalleyView initial={t.galley} name={label(t)} shown={t.id === tabs.active} onOpenDir={pickDir} />
            ) : (
              <StartScreen
                recent={recent}
                names={names}
                onOpen={pickDir}
                onCreate={createDir}
                onOpenRecent={openDir}
                onRemoveRecent={(path) =>
                  tauri
                    .removeRecentDir(path)
                    .then(setRecent)
                    .catch((e) => setError(String(e)))
                }
              />
            )}
          </div>
        ))}
      </div>
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
