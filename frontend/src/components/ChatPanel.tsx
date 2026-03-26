"use client";

import { useCallback, useRef, useState } from "react";
import { postQuery, type QueryResponse } from "@/lib/api";
import ChatMarkdown from "./ChatMarkdown";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPanel({
  onQueryResult,
  onQueryStart,
}: {
  onQueryResult: (r: QueryResponse) => void;
  /** Called as soon as the user submits a new question (before the API returns). */
  onQueryStart?: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Hi! I can help you analyze the Order to Cash process. Ask about flows, billing, deliveries, payments, or aggregations.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Dodge AI is awaiting instructions");
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    onQueryStart?.();
    setBusy(true);
    setStatus("Dodge AI is reasoning over your O2C data…");
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    scrollToEnd();
    try {
      const hist = next.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const res = await postQuery(q, hist);
      onQueryResult(res);
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Something went wrong: ${msg}. Is the API running and GROQ_API_KEY set?` },
      ]);
    } finally {
      setBusy(false);
      setStatus("Dodge AI is awaiting instructions");
      scrollToEnd();
    }
  };

  return (
    <aside
      style={{
        width: 420,
        maxWidth: "100%",
        borderLeft: "1px solid var(--line)",
        background: "var(--panel)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        boxShadow: "-12px 0 40px rgba(15,23,42,0.04)",
        zIndex: 5,
      }}
    >
      <header style={{ padding: "20px 22px 12px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
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
            }}
          >
            D
          </div>
          <div>
            <div className="display" style={{ fontSize: 20, lineHeight: 1.15 }}>
              Chat with Graph
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>Order to Cash · Dodge AI</div>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div
            key={i}
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
              <ChatMarkdown content={m.content} variant="assistant" />
            ) : (
              <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div style={{ padding: "12px 18px 18px", borderTop: "1px solid var(--line)", background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "var(--muted)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: busy ? "#f59e0b" : "var(--success)", display: "inline-block" }} />
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
            disabled={busy}
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
    </aside>
  );
}
