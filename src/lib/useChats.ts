import { useCallback, useEffect, useRef, useState } from "react";
import { onChatEvent, tauri } from "@/lib/tauri";
import { applyEvent, historyItems, newChat, NEW_TASK, type Chat } from "@/lib/chat";

export interface Chats {
  // The chats by key: a document name, or `NEW_TASK`.
  chats: Record<string, Chat>;
  // True if the `claude` binary exists.
  available: boolean;
  // Loads the history of the chat `key` if it is not loaded.
  load: (key: string) => void;
  // Sends a message. `model` is empty for the default model.
  send: (key: string, text: string, model: string) => void;
  // Stops the current turn.
  stop: (key: string) => void;
  // Forgets the session of the chat; the next message starts a new session.
  reset: (key: string) => void;
  // Gives the chat of the new task to the document `doc`.
  bind: (doc: string) => void;
}

// The chats of the galley `root`. `onTurnEnd` runs at the end of each turn.
export function useChats(root: string, onTurnEnd: (key: string) => void): Chats {
  const [chats, setChats] = useState<Record<string, Chat>>({});
  const [available, setAvailable] = useState(false);
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const turnEndRef = useRef(onTurnEnd);
  turnEndRef.current = onTurnEnd;

  useEffect(() => {
    tauri.chatClaudePath().then((p) => setAvailable(p != null)).catch(() => {});
    tauri
      .chatSessions(root)
      .then((sessions) =>
        setChats((prev) => {
          const next = { ...prev };
          for (const [doc, session] of Object.entries(sessions)) next[doc] ??= newChat(session, false);
          return next;
        })
      )
      .catch(() => {});
  }, [root]);

  // Route the events of the processes to the chats of this galley.
  useEffect(() => {
    const unlisten = onChatEvent((session, ev) => {
      const key = Object.keys(chatsRef.current).find((k) => chatsRef.current[k].session === session);
      if (key === undefined) return;
      setChats((prev) => (prev[key]?.session === session ? { ...prev, [key]: applyEvent(prev[key], ev) } : prev));
      if (ev.kind === "result" || ev.kind === "exit") turnEndRef.current(key);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // The processes stop with the galley.
  useEffect(
    () => () => {
      for (const c of Object.values(chatsRef.current)) tauri.chatClose(c.session).catch(() => {});
    },
    []
  );

  const load = useCallback(
    (key: string) => {
      const chat = chatsRef.current[key];
      if (!chat || chat.loaded) return;
      const session = chat.session;
      setChats((prev) => ({ ...prev, [key]: { ...prev[key], loaded: true } }));
      tauri
        .chatHistory(root, session)
        .then((events) =>
          setChats((prev) =>
            prev[key]?.session === session
              ? { ...prev, [key]: { ...prev[key], items: [...historyItems(events), ...prev[key].items] } }
              : prev
          )
        )
        .catch((e) =>
          setChats((prev) =>
            prev[key]?.session === session
              ? { ...prev, [key]: { ...prev[key], items: [{ kind: "error", text: String(e) }, ...prev[key].items] } }
              : prev
          )
        );
    },
    [root]
  );

  const send = useCallback(
    (key: string, text: string, model: string) => {
      const existing = chatsRef.current[key];
      if (existing?.busy) return;
      const chat = existing ?? newChat(crypto.randomUUID(), true);
      if (!existing && key !== NEW_TASK) tauri.setChatSession(root, key, chat.session).catch(() => {});
      const next: Chat = { ...chat, busy: true, follow: true, items: [...chat.items, { kind: "user", text }] };
      chatsRef.current = { ...chatsRef.current, [key]: next };
      setChats((prev) => ({ ...prev, [key]: next }));
      tauri.chatSend(root, chat.session, key === NEW_TASK ? null : key, model || null, text).catch((e) =>
        setChats((prev) =>
          prev[key]?.session === chat.session
            ? { ...prev, [key]: applyEvent(prev[key], { kind: "exit", error: String(e) }) }
            : prev
        )
      );
    },
    [root]
  );

  const stop = useCallback((key: string) => {
    const chat = chatsRef.current[key];
    if (chat) tauri.chatInterrupt(chat.session).catch(() => {});
  }, []);

  const reset = useCallback(
    (key: string) => {
      const chat = chatsRef.current[key];
      if (!chat) return;
      tauri.chatClose(chat.session).catch(() => {});
      if (key !== NEW_TASK) tauri.setChatSession(root, key, null).catch(() => {});
      const { [key]: _, ...rest } = chatsRef.current;
      chatsRef.current = rest;
      setChats(rest);
    },
    [root]
  );

  const bind = useCallback(
    (doc: string) => {
      const chat = chatsRef.current[NEW_TASK];
      if (!chat || chatsRef.current[doc]) return;
      tauri.setChatSession(root, doc, chat.session).catch(() => {});
      const { [NEW_TASK]: _, ...rest } = chatsRef.current;
      const next = { ...rest, [doc]: chat };
      chatsRef.current = next;
      setChats(next);
    },
    [root]
  );

  return { chats, available, load, send, stop, reset, bind };
}
