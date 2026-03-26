# Order-to-Cash (O2C) Explorer

Hybrid **PostgreSQL + Neo4j** analytics with a **Groq** LLM query layer and a **Next.js + Cytoscape** UI.

## Prerequisites

- Docker (for Postgres + Neo4j)
- Node.js 20+
- [Groq API key](https://console.groq.com/)

## 1. Start databases

```bash
docker compose up -d
```

## 2. Ingest `sap-o2c-data` into Postgres + Neo4j

```bash
cd backend
cp .env.example .env
# Set GROQ_API_KEY in .env (needed for the API, not for ingest)

npm install
npm run ingest
```

## 3. Backend API

```bash
cd backend
npm run dev
# http://localhost:4000/health
```

## 4. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
# http://localhost:3000
```

Set `NEXT_PUBLIC_API_BASE` in `.env.local` if the API is not on `http://localhost:4000`.

## API

- `GET /api/graph?limit=500` — Cytoscape elements
- `GET /api/graph/node/:type/:id` — Node + neighbors
- `POST /api/query` — `{ "query": "...", "conversationHistory": [...] }`

## Project layout

- `sap-o2c-data/` — JSONL extracts (unchanged)
- `backend/` — Express, ingestion, Groq query planner
- `frontend/` — Next.js App Router, graph + chat
