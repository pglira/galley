import * as React from "react";
import { cn } from "@/lib/utils";

// The side of the handle on the resized element: "left" resizes the previous
// sibling, "right" the next sibling, and "top" the height of the next sibling.
interface Props {
  side: "left" | "right" | "top";
  onResize: (size: number) => void;
  onReset: () => void;
  className?: string;
}

export function ResizeHandle({ side, onResize, onReset, className }: Props) {
  const [dragging, setDragging] = React.useState(false);
  const vertical = side === "top";
  const startPos = React.useRef(0);
  const startSize = React.useRef(0);

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const handle = e.currentTarget as HTMLElement;
      const sibling =
        side === "left"
          ? (handle.previousElementSibling as HTMLElement)
          : (handle.nextElementSibling as HTMLElement);
      if (!sibling) return;

      const rect = sibling.getBoundingClientRect();
      startPos.current = vertical ? e.clientY : e.clientX;
      startSize.current = vertical ? rect.height : rect.width;
      setDragging(true);
      handle.setPointerCapture(e.pointerId);
    },
    [side, vertical],
  );

  const onPointerMove = React.useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const delta = (vertical ? e.clientY : e.clientX) - startPos.current;
      onResize(side === "left" ? startSize.current + delta : startSize.current - delta);
    },
    [dragging, side, vertical, onResize],
  );

  const onPointerUp = React.useCallback(() => {
    setDragging(false);
  }, []);

  return (
    <div
      className={cn(
        "relative z-10 shrink-0",
        vertical ? "h-0" : "w-0",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onReset}
    >
      {/* Wider invisible hit area + visible highlight on hover/drag */}
      <div
        className={cn(
          "absolute",
          vertical ? "inset-x-0 h-1.5 cursor-row-resize" : "inset-y-0 w-1.5 cursor-col-resize",
          dragging ? "bg-primary/40" : "bg-transparent hover:bg-primary/20",
        )}
        style={{
          [vertical ? "top" : "left"]: -3,
          transition: dragging ? "none" : "background-color 150ms",
        }}
      />
    </div>
  );
}
