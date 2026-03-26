import type pg from "pg";
import { CHAT_WELCOME_MESSAGE } from "./constants.js";

export type ChatTurn = { role: "user" | "assistant" | "system"; content: string };

export async function conversationExists(pool: pg.Pool, id: string): Promise<boolean> {
  const r = await pool.query(`SELECT 1 FROM chat_conversations WHERE id = $1`, [  id]);
  return (r.rowCount ?? 0) > 0;
}

/** Prior turns for the LLM (does not include the message about to be sent). */
export async function loadPriorTurns(pool: pg.Pool, conversationId: string, limit: number): Promise<ChatTurn[]> {
  const r = await pool.query<{ role: string; content: string }>(
    `SELECT role, content FROM chat_messages WHERE conversation_id = $1 ORDER BY id ASC`,
    [conversationId],
  );
  const rows = r.rows.filter((x) => x.role === "user" || x.role === "assistant" || x.role === "system");
  const sliced = rows.slice(-limit);
  return sliced.map((x) => ({
    role: x.role as ChatTurn["role"],
    content: x.content,
  }));
}

export async function appendMessage(
  pool: pg.Pool,
  conversationId: string,
  role: ChatTurn["role"],
  content: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
    [conversationId, role, content],
  );
}

export async function touchConversationUpdatedAt(pool: pg.Pool, conversationId: string): Promise<void> {
  await pool.query(`UPDATE chat_conversations SET updated_at = now() WHERE id = $1`, [conversationId]);
}

/** When title is still default and this is the first user message, set title from text. */
export async function maybeSetTitleFromFirstUserMessage(
  pool: pg.Pool,
  conversationId: string,
  userText: string,
): Promise<void> {
  const normalized = userText.trim().replace(/\s+/g, " ");
  const title =
    normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}…`;
  if (!title) return;
  await pool.query(
    `UPDATE chat_conversations c
     SET title = $2, updated_at = now()
     WHERE c.id = $1
       AND c.title = 'New chat'
       AND (SELECT COUNT(*)::int FROM chat_messages m WHERE m.conversation_id = c.id AND m.role = 'user') = 1`,
    [conversationId, title],
  );
}

export async function createConversation(pool: pg.Pool): Promise<{ id: string }> {
  const ins = await pool.query<{ id: string }>(
    `INSERT INTO chat_conversations DEFAULT VALUES RETURNING id`,
  );
  const id = ins.rows[0]?.id;
  if (!id) throw new Error("Failed to create conversation");
  await appendMessage(pool, id, "assistant", CHAT_WELCOME_MESSAGE);
  await touchConversationUpdatedAt(pool, id);
  return { id };
}
