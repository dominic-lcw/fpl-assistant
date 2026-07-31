import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const globalForDatabase = globalThis as unknown as {
  pool?: Pool;
};

function createPool() {
  return new Pool({
    // Creating a pool is lazy. The fallback keeps `next build` from opening a
    // database connection while evaluating route modules; requests still need
    // DATABASE_URL to successfully execute a query.
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/fpl_assistant",
    max: 5,
  });
}

const pool = globalForDatabase.pool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.pool = pool;
}

export const db = drizzle({ client: pool, schema });
