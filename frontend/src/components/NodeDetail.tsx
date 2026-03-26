"use client";

import { useEffect, useState } from "react";
import { fetchNodeMetadata, type NeighborLink } from "@/lib/api";
import { parseGid } from "@/lib/gid";

const HIDDEN_KEYS = new Set([
  "name",
  "primary",
  "granular",
  "kindColor",
  "kindBorder",
  "id",
  "label",
  "gid",
  "labels",
]);

export default function NodeDetail({
  data,
  onClose,
  onExpandNeighbors,
}: {
  data: Record<string, unknown> | null;
  onClose: () => void;
  onExpandNeighbors: (gid: string) => Promise<void>;
}) {
  const gid = data && typeof data.gid === "string" ? data.gid : null;
  const [meta, setMeta] = useState<{
    node: Record<string, unknown>;
    links: NeighborLink[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanding, setExpanding] = useState(false);

  useEffect(() => {
    if (!gid) {
      setMeta(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { type, id } = parseGid(gid);
    fetchNodeMetadata(type, id)
      .then((res) => {
        if (!cancelled) setMeta(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gid]);

  if (!data) return null;

  const title = String(data.label ?? meta?.node?.label ?? "Node");
  const displayGid = gid ?? String(data.id ?? "—");
  const propsSource = meta?.node ?? data;
  const entries = Object.entries(propsSource).filter(([k]) => !HIDDEN_KEYS.has(k));

  const expand = async () => {
    if (!gid) return;
    setExpanding(true);
    setError(null);
    try {
      await onExpandNeighbors(gid);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExpanding(false);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 20,
        bottom: 20,
        width: "min(440px, calc(100vw - 480px))",
        maxHeight: "52vh",
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
          <div style={{ color: "var(--muted)", fontSize: 11, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
            {displayGid}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          {gid && (
            <button
              type="button"
              disabled={expanding}
              onClick={() => void expand()}
              style={{
                border: "1px solid var(--line)",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                borderRadius: 10,
                padding: "6px 12px",
                cursor: expanding ? "wait" : "pointer",
                fontWeight: 600,
                fontSize: 12,
                whiteSpace: "nowrap",
              }}
            >
              {expanding ? "Expanding…" : "Expand neighbors"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "#f1f5f9",
              color: "var(--muted)",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </div>

      {loading && (
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 0" }}>Loading metadata…</p>
      )}
      {error && (
        <p style={{ fontSize: 12, color: "#b45309", margin: "12px 0 0" }}>{error}</p>
      )}

      {meta && meta.links.filter((l) => l.other).length > 0 && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "14px 0 10px" }} />
          <div className="display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Relationships
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12 }}>
            {meta.links
              .filter((l) => l.other)
              .map((l, i) => (
                <li
                  key={`${l.other}-${l.rel}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid #f1f5f9",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: l.dir === "out" ? "#2563eb" : "#ea580c",
                      minWidth: 32,
                    }}
                  >
                    {l.dir === "out" ? "→" : "←"}
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--ink)" }}>{l.rel}</span>
                  <span style={{ color: "var(--muted)", wordBreak: "break-all" }}>{l.other}</span>
                </li>
              ))}
          </ul>
        </>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--line)", margin: "14px 0 10px" }} />
      <div className="display" style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
        Properties
      </div>
      <dl
        style={{
          margin: 0,
          display: "grid",
          gridTemplateColumns: "minmax(120px, 40%) 1fr",
          gap: "6px 10px",
          fontSize: 12,
        }}
      >
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
