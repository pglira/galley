import * as React from "react";
import { cn } from "@/lib/utils";
import { currentHeading, tocEntries, tocHeadings, type TocEntry } from "@/lib/toc";

interface Props {
  articleRef: React.RefObject<HTMLElement | null>;
  // Changes after each render of the document.
  contentNonce: number;
}

// The nearest ancestor of an element that scrolls vertically.
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === "auto" || overflow === "scroll") return p;
  }
  return null;
}

// Distance in pixels from the end of the document below which the view is at the end.
const AT_BOTTOM = 2;

// The headings of the shown document. A click scrolls the heading to the top
// of the view. The heading at the top of the view is marked.
export function TableOfContents({ articleRef, contentNonce }: Props) {
  const [entries, setEntries] = React.useState<TocEntry[]>([]);
  const [current, setCurrent] = React.useState(-1);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const root = articleRef.current;
    setEntries(root ? tocEntries(root) : []);
    const scroller = scrollParent(root);
    if (!root || !scroller) {
      setCurrent(-1);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const view = scroller.getBoundingClientRect();
      const tops = tocHeadings(root).map((h) => h.getBoundingClientRect().top - view.top);
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - AT_BOTTOM;
      setCurrent(currentHeading(tops, scroller.clientHeight, atBottom && scroller.scrollTop > 0));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // `articleRef` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentNonce]);

  // Keep the current heading in view in the list.
  React.useEffect(() => {
    if (current < 0) return;
    listRef.current?.children[current]?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const goTo = (index: number) => {
    const root = articleRef.current;
    const scroller = scrollParent(root);
    const heading = root ? tocHeadings(root)[index] : null;
    if (!scroller || !heading) return;
    scroller.scrollTop += heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  };

  if (entries.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">The document has no headings.</p>;
  }
  const minLevel = Math.min(...entries.map((e) => e.level));
  return (
    <div ref={listRef} className="py-1">
      {entries.map((e, i) => (
        <div
          key={i}
          className={cn(
            "cursor-pointer truncate py-0.5 pr-2 text-sm hover:bg-sidebar-accent",
            i === current && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
            e.level > minLevel + 1 && i !== current && "text-muted-foreground"
          )}
          style={{ paddingLeft: `${0.75 + 0.75 * (e.level - minLevel)}rem` }}
          title={e.text}
          onClick={() => goTo(i)}
        >
          {e.text}
        </div>
      ))}
    </div>
  );
}
