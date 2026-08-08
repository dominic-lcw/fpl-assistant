#!/usr/bin/env bash
# Add (or refresh) a Postgres firewall rule for your current public IP so
# local `pnpm db:migrate` / `pnpm dev` can reach Azure Database for PostgreSQL.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

load_azure_defaults
ensure_logged_in

RULE_NAME="${DB_FIREWALL_RULE:-AllowLocalDev}"
MY_IP="$(curl -fsS https://api.ipify.org)"

if az postgres flexible-server firewall-rule show \
  --name "$DB_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --rule-name "$RULE_NAME" >/dev/null 2>&1; then
  az postgres flexible-server firewall-rule update \
    --name "$DB_SERVER" \
    --resource-group "$RESOURCE_GROUP" \
    --rule-name "$RULE_NAME" \
    --start-ip-address "$MY_IP" \
    --end-ip-address "$MY_IP" \
    --output none
else
  az postgres flexible-server firewall-rule create \
    --name "$DB_SERVER" \
    --resource-group "$RESOURCE_GROUP" \
    --rule-name "$RULE_NAME" \
    --start-ip-address "$MY_IP" \
    --end-ip-address "$MY_IP" \
    --output none
fi

DB_HOST="$(az postgres flexible-server show \
  --name "$DB_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --query fullyQualifiedDomainName -o tsv)"

echo "Allowed ${MY_IP} on ${DB_SERVER}"
echo "Set DATABASE_URL=postgresql://${DB_USER}:YOUR_PASSWORD@${DB_HOST}:5432/${DB_NAME}?sslmode=require"
