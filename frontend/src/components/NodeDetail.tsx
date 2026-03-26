"use client";

export default function NodeDetail({
  data,
  onClose,
}: {
  data: Record<string, unknown> | null;
  onClose: () => void;
}) {
  if (!data) return null;
  const entries = Object.entries(data).filter(([k]) => !["name", "primary", "granular"].includes(k));
  const title = String(data.label ?? data.gid ?? "Node");

  return (
    <div
      style={{
        position: "absolute",
        left: 20,
        bottom: 20,
        width: "min(420px, calc(100vw - 480px))",
        maxHeight: "46vh",
        overflow: "auto",
        background: "rgba(255,255,255,0.96)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)",
        padding: "16px 18px",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="display" style={{ fontSize: 18, marginBottom: 6 }}>
            {title}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>
            {String(data.gid ?? "")}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "var(--accent-soft)",
            color: "var(--accent)",
            borderRadius: 10,
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Close
        </button>
      </div>
      <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "12px 0" }} />
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "minmax(110px, 38%) 1fr", gap: "6px 10px", fontSize: 12 }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt style={{ color: "var(--muted)", fontWeight: 600 }}>{k}</dt>
            <dd style={{ margin: 0, wordBreak: "break-word" }}>
              {v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
