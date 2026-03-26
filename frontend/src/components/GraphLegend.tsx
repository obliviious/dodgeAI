"use client";

import { GRAPH_LEGEND_ROWS, NODE_DEFAULT_PALETTE, NODE_TYPE_PALETTE } from "@/lib/graphNodePalette";

export default function GraphLegend() {
  return (
    <div
      style={{
        position: "absolute",
        right: 14,
        bottom: 14,
        zIndex: 12,
        maxWidth: 240,
        padding: "12px 14px",
        borderRadius: 12,
        border: "1px solid var(--line)",
        background: "rgba(255,255,255,0.94)",
        boxShadow: "0 8px 28px rgba(15,23,42,0.1)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        className="display"
        style={{
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 10,
          color: "var(--ink)",
          letterSpacing: "0.02em",
        }}
      >
        Node types
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {GRAPH_LEGEND_ROWS.map(({ typeKey, label }) => {
          const colors = typeKey === "__other__" ? NODE_DEFAULT_PALETTE : NODE_TYPE_PALETTE[typeKey];
          if (!colors) return null;
          return (
            <li
              key={typeKey}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                lineHeight: 1.25,
              }}
            >
              <span
                title={typeKey === "__other__" ? "Default / other" : typeKey}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: colors.fill,
                  border: `2px solid ${colors.border}`,
                  boxSizing: "border-box",
                }}
              />
              <span style={{ color: "var(--ink)" }}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
