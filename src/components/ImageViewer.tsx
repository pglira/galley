import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, MessageSquarePlus, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DocImage } from "@/components/Viewer";

interface Props {
  images: DocImage[];
  index: number;
  onIndex: (index: number) => void;
  // The comments of the annotations of the shown image.
  comments: string[];
  // Adds an annotation to the shown image. Null if the image cannot get one.
  onComment: ((comment: string) => void) | null;
  onClose: () => void;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 40;
const STEP = 1.25;

function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

// The box to write a comment on the shown image. Ctrl+Enter saves, Escape
// cancels.
function CommentBox({ onSave, onCancel }: { onSave: (comment: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const save = () => text.trim() && onSave(text.trim());
  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        ref={ref}
        className="min-h-20 w-full resize-y border border-white/20 bg-neutral-900 p-1.5 text-sm outline-none focus:border-white/50"
        placeholder="Comment on this image"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          else if (e.key === "Escape") onCancel();
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <div className="flex justify-end gap-1">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="xs" disabled={!text.trim()} onClick={save} title="Save (Ctrl+Enter)">
          Save
        </Button>
      </div>
    </div>
  );
}

// A full-window overlay for the images of a document. Wheel zooms around the
// cursor, drag pans, double click toggles between fit and 100 %. The arrow
// keys, "n" and "N" go to the next and the previous image. Escape and "q"
// close. "c" or Ctrl+M opens a box to comment on the image.
export function ImageViewer({ images, index, onIndex, comments, onComment, onClose }: Props) {
  const { src, alt } = images[index];
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [writing, setWriting] = useState(false);

  // Each image starts in the fit view, with the comment box closed.
  useEffect(() => {
    setNatural(null);
    setWriting(false);
  }, [index, src]);

  const step = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < images.length) onIndex(next);
    },
    [index, images.length, onIndex]
  );

  // The view that fits the image into the stage, centered. Small images keep 100 %.
  const fitView = useCallback((): View => {
    const stage = stageRef.current;
    if (!stage || !natural) return { scale: 1, x: 0, y: 0 };
    const pad = 48;
    const scale = Math.min(1, (stage.clientWidth - pad) / natural.w, (stage.clientHeight - pad) / natural.h);
    return {
      scale,
      x: (stage.clientWidth - natural.w * scale) / 2,
      y: (stage.clientHeight - natural.h * scale) / 2,
    };
  }, [natural]);

  useEffect(() => {
    if (natural) setView(fitView());
  }, [natural, fitView]);

  // Zooms by `factor` around the stage point (px, py).
  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const cx = px ?? stage.clientWidth / 2;
    const cy = py ?? stage.clientHeight / 2;
    setView((v) => {
      const scale = clampScale(v.scale * factor);
      const f = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });
  }, []);

  const actualSize = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !natural) return;
    setView({ scale: 1, x: (stage.clientWidth - natural.w) / 2, y: (stage.clientHeight - natural.h) / 2 });
  }, [natural]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The comment box handles its own keys.
      if (e.target instanceof HTMLTextAreaElement) return;
      const meta = e.metaKey || e.ctrlKey;
      // Letter keys without Ctrl, Alt or Meta.
      const letter = (k: string) => !meta && !e.altKey && e.key === k;
      if (meta && e.key.toLowerCase() === "m") {
        if (onComment) setWriting(true);
      } else if (e.key === "Escape" || letter("q")) onClose();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || letter("n")) step(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || letter("N")) step(-1);
      else if (letter("c")) {
        if (onComment) setWriting(true);
      } else if (e.key === "+" || e.key === "=") zoomAt(STEP);
      else if (e.key === "-") zoomAt(1 / STEP);
      else if (e.key === "0") setView(fitView());
      else if (e.key === "1") actualSize();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, zoomAt, fitView, actualSize, step, onComment]);

  // A non-passive listener, so that the wheel does not scroll the page.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white" role="dialog" aria-label={alt || "Image"}>
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 px-3">
        <span className="truncate text-xs text-white/70">{alt}</span>
        <div className="flex items-center gap-1">
          {images.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Previous image (Left, N)"
                disabled={index === 0}
                onClick={() => step(-1)}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-12 text-center text-xs text-white/70">
                {index + 1} / {images.length}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Next image (Right, n)"
                disabled={index === images.length - 1}
                onClick={() => step(1)}
              >
                <ChevronRight />
              </Button>
              <span className="mx-1 h-4 w-px bg-white/20" />
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            title="Comment on this image (c)"
            disabled={!onComment}
            onClick={() => setWriting(true)}
          >
            <MessageSquarePlus />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Zoom out (-)" onClick={() => zoomAt(1 / STEP)}>
            <Minus />
          </Button>
          <button
            className="min-w-14 px-1 text-center text-xs hover:bg-white/10"
            title="Actual size (1)"
            onClick={actualSize}
          >
            {Math.round(view.scale * 100)}%
          </button>
          <Button variant="ghost" size="icon-sm" title="Zoom in (+)" onClick={() => zoomAt(STEP)}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Fit (0)" onClick={() => setView(fitView())}>
            <Maximize />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Close (Esc, q)" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      <div
        ref={stageRef}
        className="relative min-h-0 flex-1 cursor-grab overflow-hidden select-none active:cursor-grabbing"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={(e) => {
          if (Math.abs(view.scale - fitView().scale) < 0.001) {
            const rect = e.currentTarget.getBoundingClientRect();
            zoomAt(1 / view.scale, e.clientX - rect.left, e.clientY - rect.top);
          } else {
            setView(fitView());
          }
        }}
      >
        <img
          key={index}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth || 800, h: e.currentTarget.naturalHeight || 600 })}
          className="absolute top-0 left-0 max-w-none origin-top-left"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            imageRendering: view.scale > 2 ? "pixelated" : "auto",
            visibility: natural ? "visible" : "hidden",
          }}
        />
      </div>
      {(writing || comments.length > 0) && (
        <div className="max-h-[40%] shrink-0 space-y-2 overflow-auto border-t border-white/10 px-3 py-2">
          {comments.map((c, i) => (
            <p key={i} className="border border-white/10 p-1.5 text-sm whitespace-pre-wrap">
              {c}
            </p>
          ))}
          {writing && onComment && (
            <CommentBox
              onSave={(c) => {
                onComment(c);
                setWriting(false);
              }}
              onCancel={() => setWriting(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
