import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, migrate } from "../db/postgres.js";
import { createDriver, verifyConnectivity } from "../db/neo4j.js";
import { ingestPostgres } from "./ingestPostgres.js";
import { ingestNeo4j } from "./ingestNeo4j.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const databaseUrl = process.env.DATABASE_URL ?? "postgresql://o2c:o2c_secret@localhost:5432/o2c";
  const neo4jUri = process.env.NEO4J_URI ?? "bolt://localhost:7687";
  const neo4jUser = process.env.NEO4J_USER ?? "neo4j";
  const neo4jPassword = process.env.NEO4J_PASSWORD ?? "o2c_neo4j_secret";
  const dataRoot = path.resolve(
    process.env.DATA_DIR ?? path.join(__dirname, "../../../sap-o2c-data"),
  );

  const pool = createPool(databaseUrl);
  const driver = createDriver(neo4jUri, neo4jUser, neo4jPassword);

  try {
    console.error("Migrating PostgreSQL...");
    // await migrate(pool);
    // console.error("Ingesting PostgreSQL from", dataRoot);
    // await ingestPostgres(pool, dataRoot, true);
    // console.error("Verifying Neo4j...");
    await verifyConnectivity(driver);
    console.error("Ingesting Neo4j...");
    await ingestNeo4j(pool, driver);
    console.error("Done.");
  } finally {
    await pool.end();
    await driver.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
