import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { loadEnvFiles } from "./load-env.mjs";

loadEnvFiles();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL is missing. Put it in .env.local or export it, then retry.",
  );
  process.exit(1);
}

const redacted = connectionString.replace(/:([^:@/]+)@/, ":***@");
console.log(`Migrating with ${redacted}`);

const pool = new pg.Pool({ connectionString });

try {
  await pool.query("select 1 as ok");
  console.log("Database connection OK");
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
} catch (error) {
  console.error("Migration failed:");
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
