# syntax=docker/dockerfile:1

# Use Debian (glibc), not Alpine (musl). DuckDB's native addon resolves
# platform bindings via detect-libc; Next standalone + pnpm tracing has
# repeatedly dropped or broken the musl package layout in the image.
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Next file tracing can materialize pnpm optional-dep symlinks as incomplete
# directories (e.g. libduckdb.so without duckdb.node / package.json). Replace
# traced @duckdb trees with the full installed packages before packing the
# runner image.
RUN set -eux; \
  mkdir -p /app/.next/standalone/node_modules/.pnpm; \
  for dir in /app/node_modules/.pnpm/@duckdb+* /app/node_modules/.pnpm/detect-libc@*; do \
    [ -d "$dir" ] || continue; \
    name="$(basename "$dir")"; \
    rm -rf "/app/.next/standalone/node_modules/.pnpm/$name"; \
    mkdir -p "/app/.next/standalone/node_modules/.pnpm/$name"; \
    cp -a "$dir"/. "/app/.next/standalone/node_modules/.pnpm/$name/"; \
  done; \
  rm -rf /app/.next/standalone/node_modules/@duckdb; \
  if [ -d /app/node_modules/@duckdb ]; then \
    mkdir -p /app/.next/standalone/node_modules; \
    cp -a /app/node_modules/@duckdb /app/.next/standalone/node_modules/@duckdb; \
  fi; \
  # Fail the image build if the standalone tree cannot load the native addon.
  cd /app/.next/standalone \
    && node -e "require('@duckdb/node-api'); console.log('duckdb ok')"

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
