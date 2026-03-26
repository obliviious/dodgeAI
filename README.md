# Order-to-Cash (O2C) Explorer

Hybrid **PostgreSQL + Neo4j** analytics with a **Groq** natural-language query layer and a **Next.js + Cytoscape.js** UI for graph exploration and chat-driven insights.

---

## Architecture

| Layer | Choice | Role |
|--------|--------|------|
| **UI** | Next.js (App Router) | Graph canvas, chat panel, node detail; calls the REST API only (no client-side DB). |
| **API** | Express | `/api/graph`, `/api/chat/*`, `/api/query`; JSON in/out; CORS enabled for local dev. |
| **LLM** | Groq (OpenAI-compatible chat) | Multi-step prompting: route → generate query → answer + graph highlights (JSON). |

**Why two databases in one product**

- **PostgreSQL** holds normalized **SAP O2C** tables (orders, deliveries, billing, journals, payments, master data). It is the best fit for **aggregations, joins, top-N rankings, and reports** (wide result sets, familiar SQL).
- **Neo4j** holds the same domain as a **property graph** (`gid` keys, typed relationships). It is the best fit for **traversals** (e.g. order → delivery → invoice → journal → payment), **neighbors**, and **path-style** questions.

The NL layer **routes each question** to SQL or Cypher so the right engine answers it. The **frontend graph** is fed from Neo4j (sample + expand); **highlights** in the UI use canonical node ids (`Type:identifier`) aligned with Neo4j `gid`.

**Conversation memory**

- Chat threads are stored in **Postgres** (`chat_conversations`, `chat_messages`) with **separate columns** for `role` and `content` (not opaque JSON blobs for those fields).
- `POST /api/query` accepts **`conversationId` only**; the server loads the last turns from the DB. The browser must not supply full history (avoids tampering and keeps a single source of truth).

---

## Database

### PostgreSQL

- **Ingest**: JSONL under `sap-o2c-data/` → typed tables + `doc` JSONB where needed (see `backend/src/ingestion/`).
- **Schema DDL**: `backend/src/db/postgres.ts` (`MIGRATE_SQL`) — run via `npm run db:migrate` in `backend/` (or ensure migrations have been applied once against `DATABASE_URL`).
- **TLS**: Managed Postgres (e.g. Aiven) can use `DATABASE_SSL_CA_PEM` / `DATABASE_SSL_CA_BASE64`; query params that conflict with a custom CA are stripped so `ssl.ca` is preserved.

### Neo4j

- **Ingest**: builds nodes/relationships with stable `gid` values (see `backend/src/ingestion/ingestNeo4j.ts`). Document-shaped properties are flattened/sanitized so Neo4j does not receive nested maps where drivers reject them.

### Chat tables

- Applied in the same migrate step as the rest of the app DDL: `chat_conversations`, `chat_messages` (FK + check on `role`).

---

## LLM prompting strategy

The pipeline is **deterministic in structure**; the model fills in queries and prose only inside those steps.

1. **Router** (`ROUTER_SYSTEM` + `GUARDRAIL_USER`): model returns JSON `{"route":"sql"|"cypher"|"reject","reason":...}`. Decides whether the question belongs to O2C and which engine to use.
2. **Query generation**:  
   - **SQL**: `GEN_SQL_SYSTEM` + embedded `SQL_SCHEMA_PROMPT` → JSON `{"query": "SELECT ..."}`.  
   - **Cypher**: `GEN_CYPHER_SYSTEM` + `CYPHER_SCHEMA_PROMPT` → JSON `{"query": "MATCH ..."}`.  
   Conversation context is included as a short text block (last **10** turns) in these prompts.
3. **Execution**: server runs validated SQL against Postgres or Cypher against Neo4j.
4. **Answer** (`ANSWER_JSON_SYSTEM`): model returns **one JSON object** with:
   - `answer`: GitHub-flavored Markdown for the chat UI.
   - `highlightedNodeIds`: canonical graph ids for entities the answer **focuses on** (capped and validated server-side).

If the model omits highlights, the server **falls back** to deriving ids from result rows (and a small row window for SQL) or from Neo4j node structures.

**Models**: default from `GROQ_MODEL` (see `backend/.env.example`); low temperature on chat completions for stability.

---

## Guardrails

| Stage | Mechanism |
|--------|-----------|
| **HTTP / API** | Zod validates bodies (e.g. `query` length, UUID `conversationId`). |
| **Domain heuristics** | Before calling the LLM stack, short messages must hit `DOMAIN_KEYWORDS` unless long (heuristic for “maybe in domain”); otherwise a canned rejection is returned and persisted on the thread. |
| **Router** | Off-topic requests should get `route: "reject"` with a fixed workspace scope message. |
| **SQL** | `SELECT` only; blocklist for DML/DDL; no multi-statement (`;`); validated in `queryPlanner.ts`. |
| **Cypher** | Must start with read clauses (`MATCH` / `OPTIONAL MATCH` / `WITH`); blocklist for write/admin/procedure patterns; no `;`. |
| **Highlights** | `highlightedNodeIds` must match a strict `Type:id` pattern for known entity types before being returned to the client. |
| **Secrets** | `GROQ_API_KEY` only on the server; if missing, `POST /api/query` returns `503` **before** any messages are written for that request. |

Guardrails reduce **abuse and accidents**; they are **not** a substitute for authentication. Conversation ids are UUIDs; without auth, any caller who can reach the API could reference an id. Treat network access and API keys accordingly.

---

## Quickstart

### Prerequisites

- Docker (for Postgres + Neo4j), or your own instances
- Node.js 20+
- [Groq API key](https://console.groq.com/)

### 1. Start databases

```bash
docker compose up -d
```

### 2. Migrate + ingest `sap-o2c-data`

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL, NEO4J_*, GROQ_API_KEY as needed

npm install
npm run db:migrate
npm run ingest
```

### 3. Backend API

```bash
cd backend
npm run dev
# http://localhost:4000/health
```

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
# http://localhost:3000
```

Set `NEXT_PUBLIC_API_BASE` in `.env.local` if the API is not on `http://localhost:4000`.

---

## API (overview)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/graph?limit=` | Sample graph for Cytoscape |
| `GET` | `/api/graph/expand?gid=` | 1-hop neighborhood |
| `GET` | `/api/graph/node/:type/:id` | Node metadata + neighbor links |
| `GET` | `/api/chat/conversations` | List chat threads |
| `POST` | `/api/chat/conversations` | Create thread (+ welcome message) |
| `GET` | `/api/chat/conversations/:id` | Thread + messages |
| `DELETE` | `/api/chat/conversations/:id` | Delete thread |
| `POST` | `/api/query` | `{ "query": "...", "conversationId": "<uuid>" }` → answer, optional `highlightedNodeIds`, etc. |

---

## Project layout

- `sap-o2c-data/` — JSONL extracts (source data)
- `backend/` — Express API, Postgres + Neo4j clients, ingestion, Groq planner, chat persistence
- `frontend/` — Next.js App Router, graph canvas, chat UI
