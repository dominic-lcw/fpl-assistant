import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // DuckDB loads a platform-specific native binding at runtime.
  serverExternalPackages: [
    "@duckdb/node-api",
    "@duckdb/node-bindings",
    "detect-libc",
  ],
  // `duckdb.node` depends on sibling `libduckdb.so` via RUNPATH $ORIGIN.
  // Next's file tracer follows the `.node` require but misses the shared
  // library, which makes `/api/chat` crash on import in the standalone image.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./node_modules/.pnpm/@duckdb+node-bindings-*/**/libduckdb.so",
      "./node_modules/@duckdb/**/libduckdb.so",
    ],
  },
};

export default nextConfig;
