"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GraphCanvas from "./GraphCanvas";
import GraphLegend from "./GraphLegend";
import ChatPanel from "./ChatPanel";
import NodeDetail from "./NodeDetail";
import { fetchGraph, fetchGraphExpand, type GraphPayload, type QueryResponse } from "@/lib/api";
import { mergeGraphPayload } from "@/lib/graphMerge";

export default function O2CExplorer() {
  const [basePayload, setBasePayload] = useState<GraphPayload | null>(null);
  const [expansionOverlay, setExpansionOverlay] = useState<GraphPayload>({ nodes: [], edges: [] });
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [hideGranular, setHideGranular] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  const mergedPayload = useMemo(() => {
    if (!basePayload) return null;
    return mergeGraphPayload(basePayload, expansionOverlay);
  }, [basePayload, expansionOverlay]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await fetchGraph(650);
        if (!cancelled) setBasePayload(g);
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onQueryStart = useCallback(() => {
    setHighlightIds([]);
  }, []);

  const onQueryResult = useCallback((r: QueryResponse) => {
    setHighlightIds(r.highlightedNodeIds ?? []);
  }, []);

  /** Pull cited entities onto the canvas when the AI highlights ids that are not in the current sample. */
  useEffect(() => {
    if (!mergedPayload || highlightIds.length === 0) return;
    const have = new Set(mergedPayload.nodes.map((n) => String(n.data?.id ?? "")));
    const missing = highlightIds.filter((id) => id && !have.has(id));
    if (missing.length === 0) return;
    const toFetch = missing.slice(0, 8);
    let cancelled = false;
    void (async () => {
      const chunks = await Promise.all(
        toFetch.map((gid) => fetchGraphExpand(gid).catch(() => ({ nodes: [], edges: [] } satisfies GraphPayload))),
      );
      if (cancelled) return;
      setExpansionOverlay((prev) => chunks.reduce((acc, c) => mergeGraphPayload(acc, c), prev));
    })();
    return () => {
      cancelled = true;
    };
  }, [mergedPayload, highlightIds]);

  const onExpandNeighbors = useCallback(async (gid: string) => {
    const chunk = await fetchGraphExpand(gid);
    setExpansionOverlay((prev) => mergeGraphPayload(prev, chunk));
  }, []);

  const selectedGid =
    selected && typeof selected.gid === "string"
      ? selected.gid
      : selected && selected.id != null
        ? String(selected.id)
        : null;

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
            <button
              type="button"
              onClick={() => {
                setExpansionOverlay({ nodes: [], edges: [] });
                setSelected(null);
              }}
              style={{
                border: "1px solid var(--line)",
                background: "white",
                borderRadius: 999,
                padding: "8px 14px",
                cursor: "pointer",
                fontWeight: 600,
                boxShadow: "0 6px 20px rgba(15,23,42,0.08)",
              }}
              title="Collapse expanded nodes back to the initial sample"
            >
              Reset graph
            </button>
          </div>

          {!minimized && (
            <>
              <GraphCanvas
                payload={mergedPayload}
                highlightIds={highlightIds}
                hideGranular={hideGranular}
                selectedGid={selectedGid}
                onSelect={setSelected}
              />
              <GraphLegend />
              <NodeDetail
                data={selected}
                onClose={() => setSelected(null)}
                onExpandNeighbors={onExpandNeighbors}
              />
            </>
          )}
        </section>

        <ChatPanel onQueryResult={onQueryResult} onQueryStart={onQueryStart} />
      </div>
    </div>
  );
}
