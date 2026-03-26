"use client";

import { useCallback, useEffect, useState } from "react";
import GraphCanvas from "./GraphCanvas";
import ChatPanel from "./ChatPanel";
import NodeDetail from "./NodeDetail";
import { fetchGraph, type GraphPayload, type QueryResponse } from "@/lib/api";

export default function O2CExplorer() {
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [hideGranular, setHideGranular] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await fetchGraph(650);
        if (!cancelled) setPayload(g);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onQueryResult = useCallback((r: QueryResponse) => {
    setHighlightIds(r.highlightedNodeIds ?? []);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", minHeight: 0 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderBottom: "1px solid var(--line)",
          background: "rgba(255,255,255,0.86)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #2563eb, #38bdf8)",
            }}
          />
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)" }}>
              Mapping
            </div>
            <div className="display" style={{ fontSize: 18 }}>
              Order to Cash
            </div>
          </div>
        </div>
        {loadErr && (
          <div style={{ color: "#b45309", fontSize: 13, maxWidth: 420, textAlign: "right" }}>
            Graph API: {loadErr}
          </div>
        )}
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <section
          style={{
            flex: 1,
            position: "relative",
            minHeight: minimized ? 56 : 0,
            height: minimized ? 56 : "auto",
            transition: "min-height 0.25s ease",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              zIndex: 10,
              display: "flex",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => setMinimized((m) => !m)}
              style={{
                border: "1px solid var(--line)",
                background: "white",
                borderRadius: 999,
                padding: "8px 14px",
                cursor: "pointer",
                fontWeight: 600,
                boxShadow: "0 6px 20px rgba(15,23,42,0.08)",
              }}
            >
              {minimized ? "Expand graph" : "Minimize"}
            </button>
            <button
              type="button"
              onClick={() => setHideGranular((g) => !g)}
              style={{
                border: "1px solid var(--line)",
                background: hideGranular ? "var(--accent-soft)" : "white",
                borderRadius: 999,
                padding: "8px 14px",
                cursor: "pointer",
                fontWeight: 600,
                boxShadow: "0 6px 20px rgba(15,23,42,0.08)",
              }}
            >
              {hideGranular ? "Show granular overlay" : "Hide granular overlay"}
            </button>
          </div>

          {!minimized && (
            <>
              <GraphCanvas
                payload={payload}
                highlightIds={highlightIds}
                hideGranular={hideGranular}
                onSelect={setSelected}
              />
              <NodeDetail data={selected} onClose={() => setSelected(null)} />
            </>
          )}
        </section>

        <ChatPanel onQueryResult={onQueryResult} />
      </div>
    </div>
  );
}
