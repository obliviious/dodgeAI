import Groq from "groq-sdk";
import type pg from "pg";
import type { Driver } from "neo4j-driver";
import { chatJson, extractJsonObject } from "./groq.js";
import {
  ANSWER_SYSTEM,
  CYPHER_SCHEMA_PROMPT,
  GEN_CYPHER_SYSTEM,
  GEN_SQL_SYSTEM,
  GUARDRAIL_USER,
  ROUTER_SYSTEM,
  SQL_SCHEMA_PROMPT,
} from "./prompts.js";

const SQL_BANNED = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|execute|copy)\b/i;
const CYPHER_BANNED =
  /\b(create|merge|delete|detach|set|remove|call\s+db\.|apoc\.|bloom\.|gds\.)\b/i;

function validateSql(q: string): string {
  const t = q.trim();
  if (!/^\s*select\b/i.test(t)) throw new Error("Only SELECT queries are allowed");
  if (SQL_BANNED.test(t)) throw new Error("Disallowed SQL keyword");
  if (t.includes(";")) throw new Error("Multiple statements not allowed");
  return t;
}

function validateCypher(q: string): string {
  const t = q.trim();
  if (!/^\s*(match|optional\s+match|with)\b/i.test(t))
    throw new Error("Only MATCH/OPTIONAL MATCH/WITH read queries allowed");
  if (CYPHER_BANNED.test(t)) throw new Error("Disallowed Cypher keyword");
  if (t.includes(";")) throw new Error("Multiple statements not allowed");
  return t;
}

function extractGidsFromRows(rows: Record<string, unknown>[]): string[] {
  const g = new Set<string>();
  const keys = ["gid", "n_gid", "source", "target", "id", "billing_document", "sales_order", "delivery_document", "accounting_document"];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      const v = row[k];
      if (typeof v === "string" && v.includes(":")) {
        if (/^(SalesOrder|Delivery|BillingDocument|JournalEntry|Payment|BusinessPartner|Product|Plant|SalesOrderItem):/.test(v))
          g.add(v);
      }
      if (k === "gid" && typeof v === "string") g.add(v);
    }
    const bd = row.billing_document ?? row.billingDocument;
    if (typeof bd === "string" && bd) g.add(`BillingDocument:${bd}`);
    const so = row.sales_order ?? row.salesOrder;
    if (typeof so === "string" && so) g.add(`SalesOrder:${so}`);
    const dd = row.delivery_document ?? row.deliveryDocument;
    if (typeof dd === "string" && dd) g.add(`Delivery:${dd}`);
    const acc = row.accounting_document ?? row.accountingDocument;
    const cc = row.company_code ?? row.companyCode;
    const fy = row.fiscal_year ?? row.fiscalYear;
    if (typeof acc === "string" && acc && typeof cc === "string" && typeof fy === "string")
      g.add(`JournalEntry:${cc}|${fy}|${acc}`);
  }
  return [...g].slice(0, 50);
}

function collectGidsFromNeoValue(val: unknown, acc: Set<string>) {
  if (val === null || val === undefined) return;
  if (typeof val === "object" && !Array.isArray(val)) {
    const o = val as Record<string, unknown>;
    if (typeof o.gid === "string") acc.add(o.gid);
    for (const v of Object.values(o)) collectGidsFromNeoValue(v, acc);
  }
  if (Array.isArray(val)) for (const x of val) collectGidsFromNeoValue(x, acc);
}

export async function runNlQuery(
  client: Groq,
  pool: pg.Pool,
  driver: Driver,
  query: string,
  history: { role: string; content: string }[],
): Promise<{
  answer: string;
  queryType: "sql" | "cypher" | "rejected";
  rawQuery: string | null;
  data: unknown[];
  highlightedNodeIds: string[];
}> {
  const hist = history.slice(-10).map((m) => `${m.role}: ${m.content}`).join("\n");

  const routeRaw = await chatJson(
    client,
    ROUTER_SYSTEM,
    `${hist}\n\n${GUARDRAIL_USER(query)}`,
  );
  let route: { route?: string; reason?: string };
  try {
    route = extractJsonObject(routeRaw) as { route?: string };
  } catch {
    route = { route: "reject" };
  }

  if (route.route === "reject") {
    return {
      answer:
        "I can only answer questions about Order-to-Cash data in this workspace (orders, deliveries, billing, invoices, payments, customers, products). Please rephrase your question in that context.",
      queryType: "rejected",
      rawQuery: null,
      data: [],
      highlightedNodeIds: [],
    };
  }

  const routeType = route.route === "cypher" ? "cypher" : "sql";

  const genSystem =
    routeType === "sql"
      ? GEN_SQL_SYSTEM(SQL_SCHEMA_PROMPT)
      : GEN_CYPHER_SYSTEM(CYPHER_SCHEMA_PROMPT);
  const genUser = `${hist}\n\nUser request:\n"""${query}"""\nRespond JSON only.`;

  const genRaw = await chatJson(client, genSystem, genUser);
  let gen: { query?: string };
  try {
    gen = extractJsonObject(genRaw) as { query?: string };
  } catch {
    return {
      answer: "Could not generate a valid query from your request. Please try a more specific O2C question.",
      queryType: routeType,
      rawQuery: null,
      data: [],
      highlightedNodeIds: [],
    };
  }

  const raw = (gen.query ?? "").trim();
  let data: Record<string, unknown>[] = [];
  let highlightedNodeIds: string[] = [];

  if (routeType === "sql") {
    const safe = validateSql(raw);
    const res = await pool.query(safe);
    data = res.rows as Record<string, unknown>[];
    highlightedNodeIds = extractGidsFromRows(data);
    const ansRaw = await chatJson(
      client,
      ANSWER_SYSTEM,
      `User question: ${query}\nSQL: ${safe}\nResult JSON: ${JSON.stringify(data).slice(0, 12000)}`,
    );
    return { answer: ansRaw, queryType: "sql", rawQuery: safe, data, highlightedNodeIds };
  }

  const safeCy = validateCypher(raw);
  const session = driver.session();
  try {
    const res = await session.run(safeCy);
    const rows: Record<string, unknown>[] = [];
    const gidSet = new Set<string>();
    for (const rec of res.records) {
      const row: Record<string, unknown> = {};
      for (const key of rec.keys) {
        const v = rec.get(key);
        row[key] = neoToPlain(v);
        collectGidsFromNeoValue(v, gidSet);
      }
      rows.push(row);
    }
    data = rows;
    highlightedNodeIds = [...gidSet].slice(0, 50);
    const ansRaw = await chatJson(
      client,
      ANSWER_SYSTEM,
      `User question: ${query}\nCypher: ${safeCy}\nResult JSON: ${JSON.stringify(data).slice(0, 12000)}`,
    );
    return { answer: ansRaw, queryType: "cypher", rawQuery: safeCy, data, highlightedNodeIds };
  } finally {
    await session.close();
  }
}

function neoToPlain(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "bigint" || typeof v === "number" || typeof v === "string" || typeof v === "boolean")
    return v;
  if (Array.isArray(v)) return v.map(neoToPlain);
  if (typeof v === "object") {
    const any = v as { labels?: string[]; properties?: Record<string, unknown>; type?: string; elementId?: string };
    if (any.properties && Array.isArray(any.labels)) {
      return { labels: any.labels, gid: any.properties.gid, ...any.properties };
    }
    if (any.type && any.properties) {
      return { relType: any.type, ...any.properties };
    }
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) out[k] = neoToPlain(val);
    return out;
  }
  return String(v);
}
