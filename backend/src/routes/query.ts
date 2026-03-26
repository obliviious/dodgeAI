import express, { type Router } from "express";
import type Groq from "groq-sdk";
import type pg from "pg";
import type { Driver } from "neo4j-driver";
import { z } from "zod";
import {
  appendMessage,
  conversationExists,
  loadPriorTurns,
  maybeSetTitleFromFirstUserMessage,
  touchConversationUpdatedAt,
} from "../chat/chatRepo.js";
import { runNlQuery } from "../llm/queryPlanner.js";
import { DOMAIN_KEYWORDS } from "../llm/prompts.js";

const bodySchema = z.object({
  query: z.string().min(1).max(8000),
  /** Server loads prior turns from Postgres; client does not send message history. */
  conversationId: z.string().uuid(),
});

export function queryRouter(groq: Groq | null, pool: pg.Pool, driver: Driver): Router {
  const r = express.Router();

  r.post("/query", async (req, res) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { query, conversationId } = parsed.data;

    if (!(await conversationExists(pool, conversationId))) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

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

    const prior = await loadPriorTurns(pool, conversationId, 10);
    await appendMessage(pool, conversationId, "user", query);
    await maybeSetTitleFromFirstUserMessage(pool, conversationId, query);

    const qlow = query.toLowerCase();
    const hits = DOMAIN_KEYWORDS.some((k) => qlow.includes(k));
    if (!hits && query.length < 400) {
      const answer =
        "Your message does not appear related to Order-to-Cash documents or master data. Try asking about sales orders, deliveries, billing, invoices, payments, customers, or products.";
      await appendMessage(pool, conversationId, "assistant", answer);
      await touchConversationUpdatedAt(pool, conversationId);
      res.json({
        answer,
        queryType: "rejected",
        rawQuery: null,
        data: [],
        highlightedNodeIds: [],
      });
      return;
    }

    try {
      const out = await runNlQuery(groq, pool, driver, query, prior);
      await appendMessage(pool, conversationId, "assistant", out.answer);
      await touchConversationUpdatedAt(pool, conversationId);
      res.json(out);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      const answer = `Something went wrong: ${msg}`;
      await appendMessage(pool, conversationId, "assistant", answer);
      await touchConversationUpdatedAt(pool, conversationId);
      res.status(500).json({
        error: msg,
        answer,
        queryType: "rejected",
        rawQuery: null,
        data: [],
        highlightedNodeIds: [],
      });
    }
  });

  return r;
}
