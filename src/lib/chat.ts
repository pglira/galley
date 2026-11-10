// The state of the chats with `claude`. Each document has one chat; the key
// `NEW_TASK` is the chat of a new task, which has no document yet. The chat id
// is the session id of `claude`.

import type { ChatEvent } from "@/lib/tauri";

export const NEW_TASK = "";

// The models of the chat. An empty id uses the default model of `claude`.
export const CHAT_MODELS = [
  { id: "", label: "Default model" },
  { id: "opus", label: "Opus" },
  { id: "sonnet", label: "Sonnet" },
  { id: "haiku", label: "Haiku" },
];

export type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "text"; text: string }
  // A tool call; `result` is undefined while the tool runs.
  | { kind: "tool"; id: string; name: string; summary: string; result?: string; isError?: boolean }
  // The end of a turn with the size of the context in tokens.
  | { kind: "turn"; contextTokens: number; error: string | null }
  | { kind: "error"; text: string };

export interface Chat {
  session: string;
  items: ChatItem[];
  // True while a turn runs.
  busy: boolean;
  // True when the history is loaded, or for a new session.
  loaded: boolean;
  // True after a message from this app: new snapshots of the document of
  // the chat then show at once.
  follow: boolean;
}

export function newChat(session: string, loaded: boolean): Chat {
  return { session, items: [], busy: false, loaded, follow: false };
}

// Adds an event to the items of a chat.
export function applyToItems(items: ChatItem[], ev: ChatEvent): ChatItem[] {
  switch (ev.kind) {
    case "user":
    case "text":
      return [...items, { kind: ev.kind, text: ev.text }];
    case "tool_use":
      return [...items, { kind: "tool", id: ev.id, name: ev.name, summary: ev.summary }];
    case "tool_result": {
      const i = items.findIndex((x) => x.kind === "tool" && x.id === ev.id);
      if (i < 0) return items;
      const next = items.slice();
      next[i] = { ...(items[i] as Extract<ChatItem, { kind: "tool" }>), result: ev.text, isError: ev.is_error };
      return next;
    }
    case "result":
      return [
        ...items,
        { kind: "turn", contextTokens: ev.context_tokens, error: ev.error },
      ];
    case "exit":
      return ev.error ? [...items, { kind: "error", text: ev.error }] : items;
  }
}

// Applies an event of the process to a chat. The end of a turn or of the
// process ends the busy state.
export function applyEvent(chat: Chat, ev: ChatEvent): Chat {
  const busy = ev.kind === "result" || ev.kind === "exit" ? false : chat.busy;
  return { ...chat, items: applyToItems(chat.items, ev), busy };
}

export function historyItems(events: ChatEvent[]): ChatItem[] {
  return events.reduce(applyToItems, [] as ChatItem[]);
}

// The names in `now` that are not in `before`, in the order of `now`.
export function newNames(before: string[], now: string[]): string[] {
  const known = new Set(before);
  return now.filter((n) => !known.has(n));
}

// A token count in a short form, for example "950", "12.3k" or "1.2M".
export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
