import express, { type Router } from "express";
import type pg from "pg";
import { z } from "zod";
import { createConversation } from "../chat/chatRepo.js";

const uuidParam = z.string().uuid();

export function chatRouter(pool: pg.Pool): Router {
  const r = express.Router();

  r.get("/chat/conversations", async (_req, res) => {
    try {
      const q = await pool.query(
        `SELECT id::text AS id, title, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM chat_conversations
         ORDER BY updated_at DESC`,
      );
      res.json(q.rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.post("/chat/conversations", async (_req, res) => {
    try {
      const { id } = await createConversation(pool);
      const conv = await pool.query(
        `SELECT id::text AS id, title, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM chat_conversations WHERE id = $1`,
        [id],
      );
      const msgs = await pool.query(
        `SELECT role, content, created_at AS "createdAt"
         FROM chat_messages WHERE conversation_id = $1 ORDER BY id ASC`,
        [id],
      );
      res.status(201).json({
        ...conv.rows[0],
        messages: msgs.rows,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.get("/chat/conversations/:id", async (req, res) => {
    const idParse = uuidParam.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const id = idParse.data;
    try {
      const conv = await pool.query(
        `SELECT id::text AS id, title, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM chat_conversations WHERE id = $1`,
        [id],
      );
      if (!conv.rowCount) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      const msgs = await pool.query(
        `SELECT role, content, created_at AS "createdAt"
         FROM chat_messages WHERE conversation_id = $1 ORDER BY id ASC`,
        [id],
      );
      res.json({
        ...conv.rows[0],
        messages: msgs.rows,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  r.delete("/chat/conversations/:id", async (req, res) => {
    const idParse = uuidParam.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: "Invalid conversation id" });
      return;
    }
    const id = idParse.data;
    try {
      const del = await pool.query(`DELETE FROM chat_conversations WHERE id = $1`, [id]);
      if (!del.rowCount) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      res.status(204).end();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  return r;
}
