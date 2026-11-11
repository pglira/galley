import * as React from "react";
import { gutterMarks, gutterSpans, type GutterMark } from "@/lib/diffGutter";

interface Props {
  // The element that scrolls the document.
  scrollerRef: React.RefObject<HTMLElement | null>;
  // The element that holds the marks of the diff.
  rootRef: React.RefObject<HTMLElement | null>;
  // A value that changes when the marks of the diff change.
  nonce: unknown;
}

// A strip beside the scroller with a mark for each change of the diff: green
// for inserted text, red for removed text. The strip shows the full document,
// like the scrollbar. A click scrolls the clicked place to the center.
export function DiffGutter({ scrollerRef, rootRef, nonce }: Props) {
  const stripRef = React.useRef<HTMLDivElement>(null);
  const [marks, setMarks] = React.useState<GutterMark[]>([]);

  React.useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const root = rootRef.current;
    const strip = stripRef.current;
    if (!scroller || !root || !strip) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      setMarks(gutterMarks(gutterSpans(scroller, root), scroller.scrollHeight, strip.clientHeight));
    };
    update();
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    observer.observe(root);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scrollerRef, rootRef, nonce]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientY - r.top) / r.height;
    scroller.scrollTop = fraction * scroller.scrollHeight - scroller.clientHeight / 2;
  };

  return (
    <div
      ref={stripRef}
      className="diff-gutter"
      title={marks.length ? "Changes of the diff: click to scroll there" : "No changes"}
      onClick={onClick}
    >
      {marks.map((m, i) => (
        <div
          key={i}
          className={`diff-gutter-mark diff-gutter-${m.kind}`}
          style={{ top: `${m.top}%`, height: `${m.height}%` }}
        />
      ))}
    </div>
  );
}
