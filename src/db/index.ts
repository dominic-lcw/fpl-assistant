import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const globalForDatabase = globalThis as unknown as {
  pool?: Pool;
};

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to use the database.");
  }

  return new Pool({
    connectionString,
    max: 5,
  });
}

const pool = globalForDatabase.pool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.pool = pool;
}

export const db = drizzle({ client: pool, schema });
