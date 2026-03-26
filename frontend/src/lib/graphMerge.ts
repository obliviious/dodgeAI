import type { GraphPayload } from "./api";

function edgeDedupeKey(e: { data: Record<string, unknown> }): string {
  const s = String(e.data.source ?? "");
  const t = String(e.data.target ?? "");
  const lbl = String(e.data.label ?? "");
  const id = String(e.data.id ?? "");
  return id || `${s}|${lbl}|${t}`;
}

/** Union two graph payloads by node id and edge identity (stable for cytoscape). */
export function mergeGraphPayload(a: GraphPayload, b: GraphPayload): GraphPayload {
  const nodeById = new Map<string, { data: Record<string, unknown> }>();
  for (const n of a.nodes) nodeById.set(String(n.data.id), n);
  for (const n of b.nodes) {
    const id = String(n.data.id);
    if (!nodeById.has(id)) nodeById.set(id, n);
  }
  const edgeByKey = new Map<string, { data: Record<string, unknown> }>();
  for (const e of a.edges) edgeByKey.set(edgeDedupeKey(e), e);
  for (const e of b.edges) {
    const k = edgeDedupeKey(e);
    if (!edgeByKey.has(k)) edgeByKey.set(k, e);
  }
  return {
    nodes: [...nodeById.values()],
    edges: [...edgeByKey.values()],
  };
}
