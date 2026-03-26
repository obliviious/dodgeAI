import "dotenv/config";
import express from "express";
import cors from "cors";
import { createPool } from "./db/postgres.js";
import { createDriver, verifyConnectivity } from "./db/neo4j.js";
import { graphRouter } from "./routes/graph.js";
import { createGroqClient } from "./llm/groq.js";
import { queryRouter } from "./routes/query.js";

const port = Number(process.env.PORT) || 4000;
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://o2c:o2c_secret@localhost:5432/o2c";
const neo4jUri = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const neo4jUser = process.env.NEO4J_USER ?? "neo4j";
const neo4jPassword = process.env.NEO4J_PASSWORD ?? "o2c_neo4j_secret";

async function main() {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json({ limit: "1mb" }));

  const pool = createPool(databaseUrl);
  const driver = createDriver(neo4jUri, neo4jUser, neo4jPassword);
  await verifyConnectivity(driver).catch(() => {
    console.warn("Neo4j not reachable at startup; graph/query may fail until it is up.");
  });

  let groq: ReturnType<typeof createGroqClient> | null = null;
  try {
    groq = createGroqClient();
  } catch {
    console.warn("GROQ_API_KEY missing; POST /api/query returns 503 until set.");
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", graphRouter(driver));
  app.use("/api", queryRouter(groq, pool, driver));

  app.listen(port, () => {
    console.error(`O2C API listening on http://localhost:${port}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
