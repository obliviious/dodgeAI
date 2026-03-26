"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
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
  const endRef = useRef<HTMLDivElement>(null);

  const activeTitle = summaries.find((s) => s.id === activeId)?.title ?? "Order to Cash · Dodge AI";

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

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  const startNewChat = useCallback(async () => {
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
    setBusy(true);
    setStatus("Dodge AI is reasoning over your O2C data…");
    scrollToEnd();
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

  if (!hydrated) {
    return (
      <aside
        style={{
          width: 580,
          maxWidth: "100%",
          borderLeft: "1px solid var(--line)",
          background: "var(--panel)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: 14,
        }}
      >
        Loading conversations…
      </aside>
    );
  }

  if (loadError) {
    return (
      <aside
        style={{
          width: 580,
          maxWidth: "100%",
          borderLeft: "1px solid var(--line)",
          background: "var(--panel)",
          padding: 24,
          color: "#b45309",
          fontSize: 14,
        }}
      >
        Could not load chat: {loadError}
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: 580,
        maxWidth: "100%",
        minWidth: 280,
        borderLeft: "1px solid var(--line)",
        background: "var(--panel)",
        display: "flex",
        flexDirection: "row",
        minHeight: 0,
        boxShadow: "-12px 0 40px rgba(15,23,42,0.04)",
        zIndex: 5,
      }}
    >
      <nav
        style={{
          width: 168,
          flexShrink: 0,
          borderRight: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          background: "linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)",
        }}
      >
        <div style={{ padding: "12px 10px 8px" }}>
          <button
            type="button"
            onClick={() => void startNewChat()}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 10,
              padding: "10px 12px",
              background: "var(--accent)",
              color: "white",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            New chat
          </button>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 8px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {[...summaries]
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
            .map((c) => {
              const isActive = c.id === activeId;
              return (
                <div
                  key={c.id}
                  role="button"
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
                    borderRadius: 10,
                    padding: "8px 28px 8px 10px",
                    cursor: "pointer",
                    border: isActive ? "1px solid #93c5fd" : "1px solid transparent",
                    background: isActive ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 600,
                      lineHeight: 1.25,
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
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
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
                      right: 4,
                      top: 6,
                      border: "none",
                      background: "rgba(255,255,255,0.65)",
                      borderRadius: 6,
                      width: 22,
                      height: 22,
                      cursor: "pointer",
                      fontSize: 14,
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
      </nav>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <header style={{ padding: "18px 20px 10px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "linear-gradient(145deg, #1d4ed8, #93c5fd)",
                color: "white",
                fontFamily: "Fraunces, serif",
                fontWeight: 700,
                display: "grid",
                placeItems: "center",
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              D
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="display" style={{ fontSize: 18, lineHeight: 1.15 }}>
                Chat with Graph
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>{activeTitle}</div>
            </div>
          </div>
        </header>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {messages.map((m, i) => (
            <div
              key={`${activeId}-${i}-${m.role}-${m.content.slice(0, 12)}`}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "92%",
                borderRadius: 16,
                padding: "10px 14px",
                fontSize: 14,
                lineHeight: 1.45,
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
          <div ref={endRef} />
        </div>

        <div
          style={{
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
              marginBottom: 10,
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
          <div style={{ display: "flex", gap: 10 }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Analyze anything — e.g. trace billing document 90504248 to journal entry"
              rows={3}
              style={{
                flex: 1,
                resize: "none",
                borderRadius: 12,
                border: "1px solid var(--line)",
                padding: "10px 12px",
                fontFamily: "inherit",
                fontSize: 14,
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
                minWidth: 92,
                borderRadius: 12,
                border: "none",
                background: busy ? "#94a3b8" : "var(--accent)",
                color: "white",
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
