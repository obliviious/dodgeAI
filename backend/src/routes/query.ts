import express, { type Router } from "express";
import type Groq from "groq-sdk";
import type pg from "pg";
import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { runNlQuery } from "../llm/queryPlanner.js";
import { DOMAIN_KEYWORDS } from "../llm/prompts.js";

const bodySchema = z.object({
  query: z.string().min(1).max(8000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .optional(),
});

export function queryRouter(groq: Groq | null, pool: pg.Pool, driver: Driver): Router {
  const r = express.Router();

  r.post("/query", async (req, res) => {
    if (!groq) {
      res.status(503).json({
        error: "GROQ_API_KEY is not configured on the server.",
        queryType: "rejected",
        rawQuery: null,
        data: [],
        highlightedNodeIds: [],
      });
      return;
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { query, conversationHistory } = parsed.data;

    const qlow = query.toLowerCase();
    const hits = DOMAIN_KEYWORDS.some((k) => qlow.includes(k));
    if (!hits && query.length < 400) {
      res.json({
        answer:
          "Your message does not appear related to Order-to-Cash documents or master data. Try asking about sales orders, deliveries, billing, invoices, payments, customers, or products.",
        queryType: "rejected",
        rawQuery: null,
        data: [],
        highlightedNodeIds: [],
      });
      return;
    }

    try {
      const out = await runNlQuery(groq, pool, driver, query, conversationHistory ?? []);
      res.json(out);
    } catch (e) {
      console.error(e);
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
        answer: e instanceof Error ? e.message : String(e),
        queryType: "rejected",
        rawQuery: null,
        data: [],
        highlightedNodeIds: [],
      });
    }
  });

  return r;
}
