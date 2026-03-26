import "dotenv/config";
import { createPool, migrate } from "../db/postgres.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = createPool(databaseUrl);
await migrate(pool);
console.log("Migration finished (O2C + chat tables).");
await pool.end();
