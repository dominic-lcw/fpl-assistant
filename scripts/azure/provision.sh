#!/usr/bin/env bash
# One-time Azure provision: Resource Group, ACR, Postgres Flexible Server,
# Key Vault, Container Apps Environment + App, and (optional) GitHub OIDC.
#
# Prerequisites: az login, Docker (for first image), .env.local with secrets.
#
# Usage (from repo root):
#   export LOCATION=southeastasia
#   export ACR_NAME=dominicacr   # shared registry; globally unique, lowercase alphanumeric
#   export KEY_VAULT=kv-fpl-assistant  # globally unique
#   export DB_PASSWORD='choose-a-strong-password'
#   ./scripts/azure/provision.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

load_azure_defaults
ensure_logged_in
require_cmd openssl
require_cmd python3

ENV_FILE="${ENV_FILE:-.env.local}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Create ${ENV_FILE} from .env.example before provisioning." >&2
  exit 1
fi

MOONSHOT_API_KEY="$(get_env MOONSHOT_API_KEY)"
AUTH_SECRET="$(get_env AUTH_SECRET)"
AUTH_GOOGLE_ID="$(get_env AUTH_GOOGLE_ID)"
AUTH_GOOGLE_SECRET="$(get_env AUTH_GOOGLE_SECRET)"
ADMIN_EMAILS="$(get_env ADMIN_EMAILS)"
KIMI_MODEL="$(get_env_optional KIMI_MODEL)"
KIMI_MODEL="${KIMI_MODEL:-kimi-k3}"

if [[ -z "${DB_PASSWORD:-}" ]]; then
  if [[ -n "$(get_env_optional DB_PASSWORD)" ]]; then
    DB_PASSWORD="$(get_env DB_PASSWORD)"
  else
    DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
    echo "Generated DB_PASSWORD (save it): ${DB_PASSWORD}"
  fi
fi

echo "==> Resource group ${RESOURCE_GROUP}"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Register providers (idempotent)"
for ns in Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.KeyVault Microsoft.OperationalInsights; do
  az provider register --namespace "$ns" --wait >/dev/null 2>&1 || true
done

echo "==> Azure Container Registry ${ACR_NAME}"
if ! az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az acr create \
    --name "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --sku Basic \
    --admin-enabled false \
    --output none
fi
ACR_LOGIN_SERVER="$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)"

echo "==> Log Analytics workspace (Container Apps)"
LAW_NAME="${APP_NAME}-logs"
if ! az monitor log-analytics workspace show --resource-group "$RESOURCE_GROUP" --workspace-name "$LAW_NAME" >/dev/null 2>&1; then
  az monitor log-analytics workspace create \
    --resource-group "$RESOURCE_GROUP" \
    --workspace-name "$LAW_NAME" \
    --location "$LOCATION" \
    --output none
fi
LAW_CUSTOMER_ID="$(az monitor log-analytics workspace show \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$LAW_NAME" \
  --query customerId -o tsv)"
LAW_SHARED_KEY="$(az monitor log-analytics workspace get-shared-keys \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$LAW_NAME" \
  --query primarySharedKey -o tsv)"

echo "==> Container Apps environment ${ACA_ENV}"
if ! az containerapp env show --name "$ACA_ENV" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az containerapp env create \
    --name "$ACA_ENV" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --logs-workspace-id "$LAW_CUSTOMER_ID" \
    --logs-workspace-key "$LAW_SHARED_KEY" \
    --output none
fi

echo "==> PostgreSQL Flexible Server ${DB_SERVER}"
if ! az postgres flexible-server show --name "$DB_SERVER" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az postgres flexible-server create \
    --name "$DB_SERVER" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --admin-user "$DB_USER" \
    --admin-password "$DB_PASSWORD" \
    --sku-name Standard_B1ms \
    --tier Burstable \
    --storage-size 32 \
    --version 16 \
    --public-access 0.0.0.0 \
    --yes \
    --output none
fi

# Allow Azure services (0.0.0.0) is set at create; also ensure rule exists after.
az postgres flexible-server firewall-rule create \
  --name "$DB_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0 \
  --output none 2>/dev/null || true

az postgres flexible-server db create \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$DB_SERVER" \
  --database-name "$DB_NAME" \
  --output none 2>/dev/null || true

DB_HOST="$(az postgres flexible-server show \
  --name "$DB_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --query fullyQualifiedDomainName -o tsv)"
DB_PASSWORD_ENC="$(printf '%s' "$DB_PASSWORD" | urlencode)"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD_ENC}@${DB_HOST}:5432/${DB_NAME}?sslmode=require"

echo "==> Key Vault ${KEY_VAULT}"
if ! az keyvault show --name "$KEY_VAULT" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az keyvault create \
    --name "$KEY_VAULT" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --enable-rbac-authorization false \
    --output none
fi

# Current user needs set-secret permission when using access policies.
USER_OID="$(az ad signed-in-user show --query id -o tsv 2>/dev/null || true)"
if [[ -n "$USER_OID" ]]; then
  az keyvault set-policy \
    --name "$KEY_VAULT" \
    --object-id "$USER_OID" \
    --secret-permissions get list set delete \
    --output none 2>/dev/null || true
fi

set_secret() {
  local name="$1" value="$2"
  printf '%s' "$value" | az keyvault secret set \
    --vault-name "$KEY_VAULT" \
    --name "$name" \
    --file /dev/stdin \
    --output none
}

set_secret moonshot-api-key "$MOONSHOT_API_KEY"
set_secret auth-secret "$AUTH_SECRET"
set_secret auth-google-id "$AUTH_GOOGLE_ID"
set_secret auth-google-secret "$AUTH_GOOGLE_SECRET"
set_secret database-url "$DATABASE_URL"

# Strip version suffix so Container Apps always resolve the latest secret value.
kv_secret_uri() {
  az keyvault secret show --vault-name "$KEY_VAULT" --name "$1" --query id -o tsv | sed -E 's|/[[:xdigit:]]{32}$||'
}
MOONSHOT_SECRET_URI="$(kv_secret_uri moonshot-api-key)"
AUTH_SECRET_URI="$(kv_secret_uri auth-secret)"
AUTH_GOOGLE_ID_URI="$(kv_secret_uri auth-google-id)"
AUTH_GOOGLE_SECRET_URI="$(kv_secret_uri auth-google-secret)"
DATABASE_URL_URI="$(kv_secret_uri database-url)"

echo "==> User-assigned managed identity for Container App"
IDENTITY_NAME="${APP_NAME}-identity"
if ! az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az identity create \
    --name "$IDENTITY_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none
fi
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)"
IDENTITY_PRINCIPAL_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --query principalId -o tsv)"
IDENTITY_CLIENT_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --query clientId -o tsv)"

az keyvault set-policy \
  --name "$KEY_VAULT" \
  --object-id "$IDENTITY_PRINCIPAL_ID" \
  --secret-permissions get list \
  --output none

# ACR pull for the app identity
az role assignment create \
  --assignee "$IDENTITY_PRINCIPAL_ID" \
  --role AcrPull \
  --scope "$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)" \
  --output none 2>/dev/null || true

echo "==> Build and push first image (linux/amd64)"
require_cmd docker
IMAGE_TAG="${ACR_LOGIN_SERVER}/${IMAGE_NAME}:latest"
az acr login --name "$ACR_NAME"
docker build --platform linux/amd64 -t "$IMAGE_TAG" .
docker push "$IMAGE_TAG"

echo "==> Container App ${APP_NAME}"
if ! az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az containerapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ACA_ENV" \
    --image "$IMAGE_TAG" \
    --user-assigned "$IDENTITY_ID" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-identity "$IDENTITY_ID" \
    --target-port 3000 \
    --ingress external \
    --min-replicas 0 \
    --max-replicas 2 \
    --cpu 1.0 \
    --memory 2.0Gi \
    --secrets \
      "moonshot-api-key=keyvaultref:${MOONSHOT_SECRET_URI},identityref:${IDENTITY_ID}" \
      "auth-secret=keyvaultref:${AUTH_SECRET_URI},identityref:${IDENTITY_ID}" \
      "auth-google-id=keyvaultref:${AUTH_GOOGLE_ID_URI},identityref:${IDENTITY_ID}" \
      "auth-google-secret=keyvaultref:${AUTH_GOOGLE_SECRET_URI},identityref:${IDENTITY_ID}" \
      "database-url=keyvaultref:${DATABASE_URL_URI},identityref:${IDENTITY_ID}" \
    --env-vars \
      "MOONSHOT_API_KEY=secretref:moonshot-api-key" \
      "AUTH_SECRET=secretref:auth-secret" \
      "AUTH_GOOGLE_ID=secretref:auth-google-id" \
      "AUTH_GOOGLE_SECRET=secretref:auth-google-secret" \
      "DATABASE_URL=secretref:database-url" \
      "AUTH_TRUST_HOST=true" \
      "ADMIN_EMAILS=${ADMIN_EMAILS}" \
      "KIMI_MODEL=${KIMI_MODEL}" \
      "PORT=3000" \
    --output none
else
  az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$IMAGE_TAG" \
    --output none
fi

APP_FQDN="$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn -o tsv)"
APP_URL="https://${APP_FQDN}"

az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --set-env-vars "AUTH_URL=${APP_URL}" \
  --output none

echo "==> Allow your public IP on Postgres (for migrate / local)"
MY_IP="$(curl -fsS https://api.ipify.org)"
az postgres flexible-server firewall-rule create \
  --name "$DB_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --rule-name "AllowLocalDev" \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP" \
  --output none 2>/dev/null || \
az postgres flexible-server firewall-rule update \
  --name "$DB_SERVER" \
  --resource-group "$RESOURCE_GROUP" \
  --rule-name "AllowLocalDev" \
  --start-ip-address "$MY_IP" \
  --end-ip-address "$MY_IP" \
  --output none

echo "==> Run Drizzle migrations against Azure Postgres"
export DATABASE_URL
pnpm db:migrate

echo ""
echo "========================================"
echo "Azure provision complete"
echo "========================================"
echo "App URL:          ${APP_URL}"
echo "ACR:              ${ACR_LOGIN_SERVER}"
echo "Postgres host:    ${DB_HOST}"
echo "Key Vault:        ${KEY_VAULT}"
echo "Managed identity: ${IDENTITY_CLIENT_ID}"
echo ""
echo "Local .env.local DATABASE_URL (SSL required):"
echo "  postgresql://${DB_USER}:YOUR_PASSWORD@${DB_HOST}:5432/${DB_NAME}?sslmode=require"
echo ""
echo "Google OAuth — add:"
echo "  Origin:  ${APP_URL}"
echo "  Redirect:${APP_URL}/api/auth/callback/google"
echo ""
echo "Optional GitHub OIDC deployer:"
echo "  ./scripts/azure/setup-github-oidc.sh"
echo "========================================"
