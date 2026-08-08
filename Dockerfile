# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
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
# Belt-and-suspenders: `duckdb.node` dlopens sibling `libduckdb.so` via
# $ORIGIN. Next tracing can miss the .so; copy any still-missing ones in.
RUN set -eux; \
  find /app/node_modules -name 'libduckdb.so' -print0 \
  | while IFS= read -r -d '' so; do \
      rel="${so#/app/}"; \
      dest="/app/.next/standalone/${rel}"; \
      if [ ! -f "$dest" ]; then \
        mkdir -p "$(dirname "$dest")"; \
        cp "$so" "$dest"; \
      fi; \
    done

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
