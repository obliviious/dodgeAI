"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { GraphPayload } from "@/lib/api";

type CytoscapeCore = cytoscape.Core;

const GRANULAR_LABELS = new Set(["SalesOrderItem", "Product", "Plant", "BusinessPartner"]);

function primaryLabel(data: Record<string, unknown>): string {
  const l = data.label;
  return typeof l === "string" ? l : "Entity";
}

function stylesheet(): cytoscape.StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        label: "data(name)",
        "font-size": 10,
        color: "#0f172a",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "wrap",
        "text-max-width": 80,
        "background-color": "#e11d48",
        width: 18,
        height: 18,
        "border-width": 1,
        "border-color": "#fda4af",
      },
    },
    {
      selector: 'node[primary = "yes"]',
      style: {
        width: 34,
        height: 34,
        "background-color": "#60a5fa",
        "border-color": "#1d4ed8",
        "font-size": 11,
        "font-weight": 600,
      },
    },
    {
      selector: "node.hl",
      style: {
        "border-width": 4,
        "border-color": "#1d4ed8",
        "background-color": "#3b82f6",
      },
    },
    {
      selector: "node.granular",
      style: {
        width: 14,
        height: 14,
        "font-size": 8,
        "background-color": "#fb7185",
        "border-color": "#fda4af",
      },
    },
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": "#cbd5e1",
        "target-arrow-color": "#cbd5e1",
        "curve-style": "bezier",
        opacity: 0.85,
      },
    },
    {
      selector: "edge.highlight",
      style: {
        width: 3,
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        opacity: 1,
      },
    },
  ];
}

function toElements(payload: GraphPayload, hideGranular: boolean) {
  const nodes = payload.nodes.map((n) => {
    const d = { ...n.data };
    const id = String(d.id ?? "");
    const label = primaryLabel(d);
    const name =
      (d.billingDocument as string) ||
      (d.salesOrder as string) ||
      (d.deliveryDocument as string) ||
      (d.accountingDocument as string) ||
      (d.business_partner as string) ||
      (d.product as string) ||
      (d.plant as string) ||
      (d.item_key as string) ||
      label;
    const isGranular = GRANULAR_LABELS.has(label);
    return {
      data: {
        ...d,
        id,
        name: String(name).slice(0, 42),
        primary: !isGranular && ["SalesOrder", "Delivery", "BillingDocument", "JournalEntry", "Payment"].includes(label) ? "yes" : "no",
        granular: isGranular ? "yes" : "no",
      },
      classes: isGranular ? "secondary granular" : "primary",
    };
  });

  const nodeIds = new Set(nodes.map((n) => n.data.id as string));
  const edges = payload.edges
    .map((e) => {
      const d = e.data;
      const src = String(d.source ?? "");
      const tgt = String(d.target ?? "");
      const id = String(d.id ?? `${src}->${tgt}`);
      if (!nodeIds.has(src) || !nodeIds.has(tgt)) return null;
      return { data: { id, source: src, target: tgt, label: d.label } };
    })
    .filter(Boolean) as { data: Record<string, unknown> }[];

  if (hideGranular) {
    const keep = new Set(nodes.filter((n) => n.data.granular !== "yes").map((n) => n.data.id as string));
    const fnodes = nodes.filter((n) => keep.has(n.data.id as string));
    const fedges = edges.filter((e) => keep.has(e.data.source as string) && keep.has(e.data.target as string));
    return [...fnodes, ...fedges];
  }
  return [...nodes, ...edges];
}

export default function GraphCanvas({
  payload,
  highlightIds,
  hideGranular,
  onSelect,
}: {
  payload: GraphPayload | null;
  highlightIds: string[];
  hideGranular: boolean;
  onSelect: (node: Record<string, unknown> | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<CytoscapeCore | null>(null);

  useEffect(() => {
    if (!host.current || !payload) return;
    const els = toElements(payload, hideGranular);
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }
    const cy = cytoscape({
      container: host.current,
      elements: els,
      style: stylesheet(),
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: 8000,
        idealEdgeLength: 90,
        randomize: true,
      },
    });
    cyRef.current = cy;
    cy.on("tap", "node", (evt) => {
      const d = evt.target.data() as Record<string, unknown>;
      onSelect(d);
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) onSelect(null);
    });
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [payload, hideGranular, onSelect]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !payload) return;
    cy.elements().removeClass("hl");
    cy.elements("edge").removeClass("highlight");
    const set = new Set(highlightIds);
    for (const id of highlightIds) {
      const n = cy.getElementById(id);
      if (n.nonempty()) n.addClass("hl");
    }
    cy.edges().forEach((e) => {
      const s = e.source().id();
      const t = e.target().id();
      if (set.has(s) && set.has(t)) e.addClass("highlight");
    });
  }, [highlightIds, payload, hideGranular]);

  return (
    <div
      ref={host}
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(248,250,252,0.98) 100%)",
      }}
    />
  );
}
