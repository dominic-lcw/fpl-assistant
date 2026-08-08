import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // DuckDB loads a platform-specific native binding at runtime.
  serverExternalPackages: [
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "@duckdb/node-bindings-linux-x64",
    "@duckdb/node-bindings-linux-x64-musl",
    "@duckdb/node-bindings-linux-arm64",
    "@duckdb/node-bindings-linux-arm64-musl",
    "detect-libc",
  ],
  // Include the full platform packages (not only libduckdb.so). Narrow .so
  // globs previously materialized broken directories over pnpm optional-dep
  // symlinks, which made `require('…/duckdb.node')` fail at runtime.
  // Use `/*` because Turbopack can load the DuckDB external from shared
  // server chunks outside `/api/chat` (e.g. auth).
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.pnpm/@duckdb+node-api@*/**/*",
      "./node_modules/.pnpm/@duckdb+node-bindings@*/**/*",
      "./node_modules/.pnpm/@duckdb+node-bindings-linux-*/**/*",
      "./node_modules/.pnpm/detect-libc@*/**/*",
      "./node_modules/@duckdb/**/*",
    ],
  },
};

export default nextConfig;
