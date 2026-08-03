#!/usr/bin/env bash
# Start Cloud SQL Auth Proxy so local Next.js can use the same Postgres as Cloud Run.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-openclaw-dominic-209}"
REGION="${REGION:-asia-southeast1}"
DB_INSTANCE="${DB_INSTANCE:-fpl-assistant-db}"
PORT="${DB_PROXY_PORT:-5432}"
CONNECTION_NAME="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
  cat <<'EOF' >&2
cloud-sql-proxy is not installed.

Install (macOS Homebrew):
  brew install cloud-sql-proxy

Or download from:
  https://cloud.google.com/sql/docs/postgres/connect-auth-proxy
EOF
  exit 1
fi

echo "Proxying ${CONNECTION_NAME} on 127.0.0.1:${PORT}"
echo "Use DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:${PORT}/fpl_assistant"
exec cloud-sql-proxy "${CONNECTION_NAME}" --address 127.0.0.1 --port "${PORT}"
