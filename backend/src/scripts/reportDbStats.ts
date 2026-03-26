import "dotenv/config";
import neo4j from "neo4j-driver";
import { createPool } from "../db/postgres.js";
import { createDriver } from "../db/neo4j.js";

function neoInt(n: unknown): bigint {
  if (neo4j.isInt(n)) return BigInt(n.toString());
  if (typeof n === "bigint") return n;
  if (typeof n === "number") return BigInt(Math.trunc(n));
  return BigInt(String(n));
}

async function main() {
  const pgUrl = process.env.DATABASE_URL;
  const neoUri = process.env.NEO4J_URI ?? "bolt://localhost:7687";
  const neoUser = process.env.NEO4J_USER ?? "neo4j";
  const neoPass = process.env.NEO4J_PASSWORD ?? "o2c_neo4j_secret";

  console.log("=== PostgreSQL (public schema) ===\n");
  if (!pgUrl) {
    console.log("DATABASE_URL not set — skipping PostgreSQL.\n");
  } else {
    const pool = createPool(pgUrl);
    try {
      const { rows: tables } = await pool.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
      );
      let total = 0n;
      for (const { tablename } of tables) {
        if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) continue;
        const { rows } = await pool.query(`SELECT COUNT(*)::bigint AS c FROM ${tablename}`);
        const c = BigInt(String(rows[0].c));
        total += c;
        console.log(`${tablename.padEnd(45)} ${c}`);
      }
      console.log("-".repeat(52));
      console.log(`${"TOTAL ROWS".padEnd(45)} ${total}`);
    } catch (e) {
      console.error("PostgreSQL error:", e instanceof Error ? e.message : e);
    } finally {
      await pool.end();
    }
  }

  console.log("\n=== Neo4j ===\n");
  const driver = createDriver(neoUri, neoUser, neoPass);
  const session = driver.session();
  try {
    const nodes = await session.run(`
      MATCH (n)
      WITH coalesce(labels(n)[0], '(no label)') AS label, count(*) AS c
      RETURN label, c
      ORDER BY c DESC
    `);
    console.log("Nodes by label:");
    let nodeSum = 0n;
    for (const rec of nodes.records) {
      const c = neoInt(rec.get("c"));
      nodeSum += c;
      console.log(`  ${String(rec.get("label")).padEnd(22)} ${c}`);
    }
    console.log(`  ${"(sum)".padEnd(22)} ${nodeSum}`);

    const rels = await session.run(`
      MATCH ()-[r]->()
      WITH type(r) AS relType, count(*) AS c
      RETURN relType, c
      ORDER BY c DESC
    `);
    console.log("\nRelationships by type:");
    let relSum = 0n;
    for (const rec of rels.records) {
      const c = neoInt(rec.get("c"));
      relSum += c;
      console.log(`  ${String(rec.get("relType")).padEnd(22)} ${c}`);
    }
    console.log(`  ${"(sum)".padEnd(22)} ${relSum}`);
  } catch (e) {
    console.error("Neo4j error:", e instanceof Error ? e.message : e);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
