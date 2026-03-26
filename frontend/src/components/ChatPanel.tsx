"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import {
  CHAT_WELCOME_MESSAGE,
  createConversation,
  deleteConversation as deleteConversationApi,
  fetchConversationDetail,
  fetchConversationSummaries,
  postQuery,
  type ConversationSummary,
  type QueryResponse,
  type ChatMessageRow,
} from "@/lib/api";
import ChatMarkdown from "./ChatMarkdown";

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

const headerIconBtn: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 36,
  height: 36,
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "white",
  color: "var(--ink)",
  cursor: "pointer",
  flexShrink: 0,
};

export default function ChatPanel({
  onQueryResult,
  onQueryStart,
  onConversationChange,
}: {
  onQueryResult: (r: QueryResponse) => void;
  onQueryStart?: () => void;
  onConversationChange?: () => void;
}) {
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Dodge AI is awaiting instructions");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const headerShellRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const activeTitle = summaries.find((s) => s.id === activeId)?.title ?? "New chat";

  const syncFromServer = useCallback(async (convoId: string) => {
    const [detail, list] = await Promise.all([fetchConversationDetail(convoId), fetchConversationSummaries()]);
    setMessages(detail.messages);
    setSummaries(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list = await fetchConversationSummaries();
        if (cancelled) return;
        if (list.length === 0) {
          const created = await createConversation();
          if (cancelled) return;
          list = await fetchConversationSummaries();
          if (cancelled) return;
          setSummaries(list);
          setActiveId(created.id);
          setMessages(created.messages);
        } else {
          setSummaries(list);
          const firstId = [...list].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0].id;
          setActiveId(firstId);
          const detail = await fetchConversationDetail(firstId);
          if (cancelled) return;
          setMessages(detail.messages);
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyOpen && !moreOpen) return;
    const close = (e: globalThis.MouseEvent) => {
      if (headerShellRef.current?.contains(e.target as Node)) return;
      setHistoryOpen(false);
      setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [historyOpen, moreOpen]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  const startNewChat = useCallback(async () => {
    setHistoryOpen(false);
    setMoreOpen(false);
    try {
      const created = await createConversation();
      const list = await fetchConversationSummaries();
      setSummaries(list);
      setActiveId(created.id);
      setMessages(created.messages);
      setInput("");
      onConversationChange?.();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [onConversationChange]);

  const selectConversation = useCallback(
    async (id: string) => {
      if (id === activeId) return;
      setHistoryOpen(false);
      setMoreOpen(false);
      try {
        setActiveId(id);
        setInput("");
        const detail = await fetchConversationDetail(id);
        setMessages(detail.messages);
        onConversationChange?.();
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    },
    [activeId, onConversationChange],
  );

  const deleteConversation = useCallback(
    async (e: MouseEvent, id: string) => {
      e.stopPropagation();
      try {
        await deleteConversationApi(id);
        let list = await fetchConversationSummaries();
        if (list.length === 0) {
          const created = await createConversation();
          list = await fetchConversationSummaries();
          setActiveId(created.id);
          setMessages(created.messages);
        } else if (id === activeId) {
          const nextId = list[0].id;
          setActiveId(nextId);
          const detail = await fetchConversationDetail(nextId);
          setMessages(detail.messages);
        }
        setSummaries(list);
        onConversationChange?.();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    },
    [activeId, onConversationChange],
  );

  const send = async () => {
    const q = input.trim();
    if (!q || busy || !activeId) return;
    const convoId = activeId;
    setInput("");
    onQueryStart?.();
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    queueMicrotask(() => scrollToEnd());
    setBusy(true);
    setStatus("Dodge AI is reasoning over your O2C data…");
    try {
      const res = await postQuery(q, convoId);
      onQueryResult(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onQueryResult({
        answer: `Something went wrong: ${msg}. Is the API running and GROQ_API_KEY set?`,
        queryType: "rejected",
        rawQuery: null,
        data: [],
        highlightedNodeIds: [],
      });
    } finally {
      try {
        await syncFromServer(convoId);
      } catch {
        /* keep UI if refresh fails */
      }
      setBusy(false);
      setStatus("Dodge AI is awaiting instructions");
      scrollToEnd();
    }
  };

  const asideStyle: CSSProperties = {
    width: 480,
    maxWidth: "100%",
    minWidth: 300,
    borderLeft: "1px solid var(--line)",
    background: "var(--panel)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    boxShadow: "-12px 0 40px rgba(15,23,42,0.04)",
    zIndex: 5,
  };

  if (!hydrated) {
    return (
      <aside style={{ ...asideStyle, alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 14 }}>
        Loading conversations…
      </aside>
    );
  }

  if (loadError) {
    return (
      <aside style={{ ...asideStyle, padding: 24, color: "#b45309", fontSize: 14, justifyContent: "center" }}>
        Could not load chat: {loadError}
      </aside>
    );
  }

  return (
    <aside style={asideStyle}>
      <div ref={headerShellRef} style={{ position: "relative", flexShrink: 0 }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 14px 10px",
            borderBottom: "1px solid var(--line)",
            background: "linear-gradient(180deg, rgba(248,250,252,0.98) 0%, var(--panel) 100%)",
          }}
        >
          <div style={{ flex: 1 }} />
          <div
            className="display"
            title={activeTitle}
            style={{
              flex: "1 1 auto",
              maxWidth: "min(320px, 56vw)",
              margin: "0 auto",
              padding: "8px 18px",
              borderRadius: 999,
              background: "#f1f5f9",
              border: "1px solid var(--line)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              textAlign: "center",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Order to cash · {activeTitle}
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
            <button
              type="button"
              title="New chat"
              aria-label="New chat"
              style={headerIconBtn}
              onClick={() => void startNewChat()}
            >
              <IconPlus />
            </button>
            <button
              type="button"
              title="Conversations"
              aria-label="Open conversation history"
              style={{
                ...headerIconBtn,
                background: historyOpen ? "var(--accent-soft)" : "white",
                borderColor: historyOpen ? "#93c5fd" : "var(--line)",
              }}
              onClick={() => {
                setMoreOpen(false);
                setHistoryOpen((o) => !o);
              }}
            >
              <IconHistory />
            </button>
            <button
              type="button"
              title="More"
              aria-label="More options"
              style={{
                ...headerIconBtn,
                background: moreOpen ? "var(--accent-soft)" : "white",
                borderColor: moreOpen ? "#93c5fd" : "var(--line)",
              }}
              onClick={() => {
                setHistoryOpen(false);
                setMoreOpen((o) => !o);
              }}
            >
              <IconMore />
            </button>
          </div>
        </header>

        {historyOpen && (
          <div
            role="listbox"
            style={{
              position: "absolute",
              top: "100%",
              right: 10,
              marginTop: 6,
              width: "min(340px, calc(100vw - 32px))",
              maxHeight: 340,
              overflowY: "auto",
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              boxShadow: "var(--shadow)",
              zIndex: 20,
            }}
          >
            <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.06em" }}>
              RECENT
            </div>
            {[...summaries]
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map((c) => {
                const isActive = c.id === activeId;
                return (
                  <div
                    key={c.id}
                    role="option"
                    aria-selected={isActive}
                    tabIndex={0}
                    onClick={() => void selectConversation(c.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        void selectConversation(c.id);
                      }
                    }}
                    style={{
                      position: "relative",
                      padding: "10px 36px 10px 14px",
                      cursor: "pointer",
                      borderTop: "1px solid var(--line)",
                      background: isActive ? "var(--accent-soft)" : "transparent",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? 700 : 600,
                        lineHeight: 1.3,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {c.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      {new Date(c.updatedAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      onClick={(e) => void deleteConversation(e, c.id)}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        border: "none",
                        background: "rgba(255,255,255,0.9)",
                        borderRadius: 8,
                        width: 26,
                        height: 26,
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                        color: "var(--muted)",
                        padding: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
          </div>
        )}

        {moreOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 10,
              marginTop: 6,
              width: 220,
              background: "var(--panel)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              boxShadow: "var(--shadow)",
              zIndex: 20,
              padding: "8px 0",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                void startNewChat();
              }}
              style={{
                width: "100%",
                padding: "10px 16px",
                border: "none",
                background: "transparent",
                textAlign: "left",
                fontSize: 14,
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              New conversation
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                setHistoryOpen(true);
              }}
              style={{
                width: "100%",
                padding: "10px 16px",
                border: "none",
                background: "transparent",
                textAlign: "left",
                fontSize: 14,
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              Recent chats
            </button>
          </div>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minHeight: 0,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={`${activeId}-${i}-${m.role}-${m.content.slice(0, 12)}`}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "min(92%, 420px)",
              borderRadius: 16,
              padding: "11px 15px",
              fontSize: 14,
              lineHeight: 1.5,
              background: m.role === "user" ? "var(--accent-soft)" : "#f8fafc",
              border: m.role === "user" ? "1px solid #bfdbfe" : "1px solid var(--line)",
            }}
          >
            {m.role === "assistant" ? (
              m.content === CHAT_WELCOME_MESSAGE ? (
                <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
              ) : (
                <ChatMarkdown content={m.content} variant="assistant" />
              )
            ) : (
              <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
            )}
          </div>
        ))}
        {busy && (
          <div style={{ alignSelf: "flex-start", fontSize: 12, color: "var(--muted)", padding: "4px 0" }}>
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: "12px 16px 16px",
          borderTop: "1px solid var(--line)",
          background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
            fontSize: 12,
            color: "var(--muted)",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: busy ? "#f59e0b" : "var(--success)",
              display: "inline-block",
            }}
          />
          {status}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 10,
            padding: "4px 4px 4px 12px",
            borderRadius: 14,
            border: "1px solid var(--line)",
            background: "white",
            boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about orders, billing, deliveries, journals…"
            rows={3}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              padding: "10px 4px 10px 0",
              fontFamily: "inherit",
              fontSize: 14,
              background: "transparent",
              minHeight: 72,
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !activeId}
            style={{
              alignSelf: "stretch",
              minWidth: 88,
              margin: 6,
              borderRadius: 12,
              border: "none",
              background: busy ? "#94a3b8" : "var(--accent)",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Send
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, paddingLeft: 4 }}>
          Dodge AI · Order-to-Cash graph workspace
        </div>
      </div>
    </aside>
  );
}
