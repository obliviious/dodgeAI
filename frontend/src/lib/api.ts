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

/** Matches server `CHAT_WELCOME_MESSAGE` (plain text in first bubble). */
export const CHAT_WELCOME_MESSAGE =
  "Hi! I can help you analyze the Order to Cash process. Ask about flows, billing, deliveries, payments, or aggregations.";

export type ConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageRow = {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
};

export type ConversationDetail = ConversationSummary & { messages: ChatMessageRow[] };

export async function fetchConversationSummaries(): Promise<ConversationSummary[]> {
  const res = await fetch(`${base()}/api/chat/conversations`, { cache: "no-store" });
  if (!res.ok) throw new Error(`List conversations failed: ${res.status}`);
  return res.json();
}

export async function createConversation(): Promise<ConversationDetail> {
  const res = await fetch(`${base()}/api/chat/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Create conversation failed: ${res.status}`);
  return res.json();
}

export async function fetchConversationDetail(id: string): Promise<ConversationDetail> {
  const res = await fetch(`${base()}/api/chat/conversations/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Load conversation failed: ${res.status}`);
  return res.json();
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${base()}/api/chat/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    cache: "no-store",
  });
  if (res.status === 404) throw new Error("Conversation not found");
  if (!res.ok) throw new Error(`Delete conversation failed: ${res.status}`);
}

/** Persists turns on the server; prior messages are read from Postgres (not the client). */
export async function postQuery(query: string, conversationId: string): Promise<QueryResponse> {
  const res = await fetch(`${base()}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, conversationId }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as QueryResponse & { error?: string };
  if (!res.ok) {
    if (typeof body.answer === "string") return body as QueryResponse;
    throw new Error(body.error ?? `Query failed: ${res.status}`);
  }
  return body as QueryResponse;
}
