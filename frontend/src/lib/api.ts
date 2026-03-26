const base = () => process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

export type GraphPayload = {
  nodes: { data: Record<string, unknown> }[];
  edges: { data: Record<string, unknown> }[];
};

export async function fetchGraph(limit = 500): Promise<GraphPayload> {
  const res = await fetch(`${base()}/api/graph?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Graph fetch failed: ${res.status}`);
  return res.json();
}

/** One-hop neighborhood from Neo4j (merge into canvas with mergeGraphPayload). */
export async function fetchGraphExpand(gid: string): Promise<GraphPayload> {
  const q = encodeURIComponent(gid);
  const res = await fetch(`${base()}/api/graph/expand?gid=${q}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Expand failed: ${res.status}`);
  }
  return res.json();
}

export type NeighborLink = { rel: string; other: string; dir: string };

export type NodeMetadataResponse = {
  node: Record<string, unknown>;
  links: NeighborLink[];
};

export async function fetchNodeMetadata(type: string, id: string): Promise<NodeMetadataResponse> {
  const res = await fetch(`${base()}/api/graph/node/${encodeURIComponent(type)}/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Metadata failed: ${res.status}`);
  }
  return res.json();
}

export type QueryResponse = {
  answer: string;
  queryType: "sql" | "cypher" | "rejected";
  rawQuery: string | null;
  data: unknown[];
  highlightedNodeIds: string[];
};

export async function postQuery(
  query: string,
  conversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
): Promise<QueryResponse> {
  const res = await fetch(`${base()}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, conversationHistory }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Query failed: ${res.status}`);
  }
  return res.json();
}
