"use client";

import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import type { GraphPayload } from "@/lib/api";
import { GRANULAR_LABELS, paletteForLabel } from "@/lib/graphNodePalette";

type CytoscapeCore = cytoscape.Core;

function primaryLabel(data: Record<string, unknown>): string {
  const l = data.label;
  return typeof l === "string" ? l : "Entity";
}

function stylesheet(): cytoscape.StylesheetJson {
  /* Colors from data(kindColor)/data(kindBorder); cytoscape uses string px for sizes. */
  return [
    {
      selector: "node",
      style: {
        label: "",
        "text-opacity": 0,
        "background-color": "data(kindColor)",
        "border-color": "data(kindBorder)",
        width: "18px",
        height: "18px",
        "border-width": "2px",
      },
    },
    {
      selector: 'node[primary = "yes"]',
      style: {
        width: "34px",
        height: "34px",
        "border-width": "2px",
      },
    },
    {
      selector: "node.granular:not(.hl)",
      style: {
        width: "14px",
        height: "14px",
        "border-width": "1px",
      },
    },
    {
      selector: "edge",
      style: {
        width: "1.5px",
        "line-color": "#cbd5e1",
        "target-arrow-color": "#cbd5e1",
        "curve-style": "bezier",
        opacity: 0.85,
      },
    },
    {
      selector: "edge.highlight",
      style: {
        width: "4px",
        "line-color": "#1d4ed8",
        "target-arrow-color": "#1d4ed8",
        opacity: 1,
        "line-style": "solid",
        "z-index": 8,
      },
    },
    {
      selector: "node.neighbor:not(.hl)",
      style: {
        "border-width": "3px",
        "border-color": "#0369a1",
      },
    },
    {
      selector: "edge.neighbor",
      style: {
        width: "2.5px",
        "line-color": "#334155",
        "target-arrow-color": "#334155",
        opacity: 1,
      },
    },
    /* Last: query/AI highlights — must win over granular + neighbor sizing. */
    {
      selector: "node.hl",
      style: {
        width: "52px",
        height: "52px",
        "border-width": "8px",
        "border-color": "#b45309",
        "z-index": 999,
        "overlay-opacity": 0.5,
        "overlay-color": "#fbbf24",
        "overlay-padding": "10px",
        "overlay-shape": "ellipse",
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
    const { fill, border } = paletteForLabel(label);
    return {
      data: {
        ...d,
        id,
        name: String(name).slice(0, 42),
        kindColor: fill,
        kindBorder: border,
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
  selectedGid,
  onSelect,
}: {
  payload: GraphPayload | null;
  highlightIds: string[];
  hideGranular: boolean;
  /** Node id (same as Neo4j gid) for selection + neighborhood highlighting. */
  selectedGid: string | null;
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
      selectionType: "single",
      boxSelectionEnabled: false,
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
      cy.elements().unselect();
      evt.target.select();
      const d = evt.target.data() as Record<string, unknown>;
      onSelect(d);
    });
    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        cy.elements().unselect();
        onSelect(null);
      }
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

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !payload) return;
    cy.elements().removeClass("neighbor");
    cy.elements("edge").removeClass("neighbor");
    if (!selectedGid) return;
    const n = cy.getElementById(selectedGid);
    if (!n.nonempty() || !n.isNode()) return;
    n.neighborhood("node").addClass("neighbor");
    n.connectedEdges().addClass("neighbor");
  }, [selectedGid, payload, hideGranular]);

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
