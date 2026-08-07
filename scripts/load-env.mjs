import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load `.env` then `.env.local` into process.env (local files win). */
export function loadEnvFiles(cwd = process.cwd()) {
  for (const name of [".env", ".env.local"]) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
