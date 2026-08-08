import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // DuckDB loads a platform-specific native binding at runtime.
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
};

export default nextConfig;
