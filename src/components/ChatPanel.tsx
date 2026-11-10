import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { renderMarkdown } from "@/lib/markdown";
import { openUrl } from "@/lib/tauri";
import { CHAT_MODELS, formatTokens, type Chat, type ChatItem } from "@/lib/chat";
import { cn } from "@/lib/utils";

interface Props {
  // The title of the chat: the document, or "New task".
  title: string;
  // True for the chat of a new task.
  newTask: boolean;
  chat: Chat | undefined;
  // False if Galley does not find `claude`.
  available: boolean;
  model: string;
  onModel: (model: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  // Starts a new session for the document.
  onNewSession: () => void;
  // Shows the chat of a new task.
  onNewTask: () => void;
}

// Text of the assistant as Markdown. Web links open in the browser.
const AssistantText = memo(function AssistantText({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div
      className="chat-markdown"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href") ?? "";
        if (a) e.preventDefault();
        if (/^https?:\/\//i.test(href)) openUrl(href).catch(() => {});
      }}
    />
  );
});

// One line for a tool call. A click shows its result.
function ToolLine({ item }: { item: Extract<ChatItem, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const running = item.result === undefined;
  return (
    <div className="text-xs">
      <button
        className="flex w-full min-w-0 items-center gap-1.5 py-0.5 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        disabled={running}
        title={item.summary}
      >
        {running ? (
          <Loader2 className="size-3 shrink-0 animate-spin" />
        ) : open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <span className={cn("shrink-0 font-medium", item.isError && "text-destructive")}>{item.name}</span>
        <span className="min-w-0 truncate font-mono">{item.summary}</span>
      </button>
      {open && !running && (
        <pre className="mt-0.5 mb-1 max-h-60 overflow-auto border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
          {item.result || "(no output)"}
        </pre>
      )}
    </div>
  );
}

function Item({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "user":
      return <div className="border-l-2 border-primary bg-muted/50 px-2 py-1.5 text-[13px] whitespace-pre-wrap">{item.text}</div>;
    case "text":
      return <AssistantText text={item.text} />;
    case "tool":
      return <ToolLine item={item} />;
    case "turn":
      return (
        <div className="flex flex-col gap-1">
          {item.error && <div className="text-xs whitespace-pre-wrap text-destructive">{item.error}</div>}
          <div
            className="text-right text-[11px] text-muted-foreground"
            title="Input tokens (with cached tokens) and output tokens of the turn"
          >
            {formatTokens(item.inputTokens)} in · {formatTokens(item.outputTokens)} out
          </div>
        </div>
      );
    case "error":
      return (
        <div className="flex gap-1.5 border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="min-w-0 font-mono whitespace-pre-wrap">{item.text}</span>
        </div>
      );
  }
}

// The output of `claude` for the shown document, read only, or the chat of a
// new task, which has a text field for the task.
export function ChatPanel({
  title,
  newTask,
  chat,
  available,
  model,
  onModel,
  onSend,
  onStop,
  onNewSession,
  onNewTask,
}: Props) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const busy = chat?.busy ?? false;
  const items = chat?.items ?? [];

  // Keep the newest message in view, unless the user scrolls up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [items, busy]);

  // A new chat starts at its end.
  useEffect(() => {
    stickRef.current = true;
  }, [chat?.session, title]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy || !available) return;
    onSend(t);
    setText("");
    stickRef.current = true;
  };

  const modelLabel = CHAT_MODELS.find((m) => m.id === model)?.label ?? model;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <span className="min-w-0 flex-1 truncate text-xs" title={title}>
          <span className="font-semibold tracking-wide uppercase">Agent</span>
          <span className="text-muted-foreground"> · {title}</span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="text-xs font-normal" title="Model of the chat">
              {modelLabel}
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-36">
            <DropdownMenuRadioGroup value={model} onValueChange={onModel}>
              {CHAT_MODELS.map((m) => (
                <DropdownMenuRadioItem key={m.id} value={m.id}>
                  {m.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!chat || busy}
          onClick={onNewSession}
          title="New session: the next prompt starts a new conversation"
        >
          <RotateCcw />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={newTask}
          onClick={onNewTask}
          title="New task: the agent makes a new document"
        >
          <Plus />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto px-3 py-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {!available ? (
          <p className="text-xs text-muted-foreground">
            Galley does not find the <code className="font-mono">claude</code> command. Install Claude Code, or set{" "}
            <code className="font-mono">claude_path</code> in the settings file of Galley.
          </p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {newTask
              ? "Describe a new task. The agent makes a new document for it, and its output then belongs to that document."
              : "The output of the agent for this document shows here. Annotate the document and click Send prompt."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <Item key={i} item={item} />
            ))}
          </div>
        )}
        {busy && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            The agent works.
          </div>
        )}
      </div>

      {newTask ? (
      <div className="shrink-0 border-t p-2">
        <textarea
          className="block max-h-48 min-h-16 w-full resize-y border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary"
          placeholder={available ? "The new task (Enter starts it, Shift Enter makes a new line)" : ""}
          disabled={!available || busy}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Plain keys belong to the text; shortcuts with Ctrl stay active.
            if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-1.5 flex justify-end">
          {busy ? (
            <Button size="xs" variant="outline" onClick={onStop} title="Stop the current turn">
              <Square />
              Stop
            </Button>
          ) : (
            <Button size="xs" disabled={!available || !text.trim()} onClick={submit}>
              <Send />
              Start task
            </Button>
          )}
        </div>
      </div>
      ) : (
        busy && (
          <div className="flex shrink-0 justify-end border-t p-2">
            <Button size="xs" variant="outline" onClick={onStop} title="Stop the current turn">
              <Square />
              Stop
            </Button>
          </div>
        )
      )}
    </div>
  );
}
