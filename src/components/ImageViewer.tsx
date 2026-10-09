import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  src: string;
  alt: string;
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

// A full-window overlay for one image. Wheel zooms around the cursor, drag
// pans, double click toggles between fit and 100 %, Escape closes.
export function ImageViewer({ src, alt, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

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
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomAt(STEP);
      else if (e.key === "-") zoomAt(1 / STEP);
      else if (e.key === "0") setView(fitView());
      else if (e.key === "1") actualSize();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, zoomAt, fitView, actualSize]);

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
          <Button variant="ghost" size="icon-sm" title="Zoom out (-)" onClick={() => zoomAt(1 / STEP)}>
            <Minus />
          </Button>
          <button
            className="min-w-14 rounded px-1 text-center text-xs hover:bg-white/10"
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
          <Button variant="ghost" size="icon-sm" title="Close (Esc)" onClick={onClose}>
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
    </div>
  );
}
