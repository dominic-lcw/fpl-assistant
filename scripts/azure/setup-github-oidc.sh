#!/usr/bin/env bash
# One-time Entra app + federated credential so GitHub Actions can deploy
# without a client secret (OIDC).
#
# Usage:
#   export GITHUB_REPO=dominic-lcw/fpl-assistant
#   ./scripts/azure/setup-github-oidc.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

load_azure_defaults
ensure_logged_in

echo "==> App registration ${DEPLOY_APP_NAME}"
APP_ID="$(az ad app list --display-name "$DEPLOY_APP_NAME" --query "[0].appId" -o tsv)"
if [[ -z "$APP_ID" || "$APP_ID" == "null" ]]; then
  APP_ID="$(az ad app create --display-name "$DEPLOY_APP_NAME" --query appId -o tsv)"
fi

SP_ID="$(az ad sp list --filter "appId eq '${APP_ID}'" --query "[0].id" -o tsv)"
if [[ -z "$SP_ID" || "$SP_ID" == "null" ]]; then
  SP_ID="$(az ad sp create --id "$APP_ID" --query id -o tsv)"
fi

# Wait briefly for directory propagation
sleep 5

SCOPE="$(az group show --name "$RESOURCE_GROUP" --query id -o tsv)"
az role assignment create \
  --assignee "$APP_ID" \
  --role Contributor \
  --scope "$SCOPE" \
  --output none 2>/dev/null || true

# Also need AcrPush on the registry
ACR_ID="$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query id -o tsv)"
az role assignment create \
  --assignee "$APP_ID" \
  --role AcrPush \
  --scope "$ACR_ID" \
  --output none 2>/dev/null || true

FED_NAME="github-main"
EXISTING="$(az ad app federated-credential list --id "$APP_ID" --query "[?name=='${FED_NAME}'].name" -o tsv)"
if [[ -z "$EXISTING" ]]; then
  cat > /tmp/github-fed.json <<EOF
{
  "name": "${FED_NAME}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${GITHUB_REPO}:environment:production",
  "audiences": ["api://AzureADTokenExchange"],
  "description": "GitHub Actions production environment"
}
EOF
  az ad app federated-credential create --id "$APP_ID" --parameters /tmp/github-fed.json --output none
fi

# Also allow workflow_dispatch / branch pushes via ref subject (optional second credential)
FED_BRANCH="github-ref-main"
EXISTING_BRANCH="$(az ad app federated-credential list --id "$APP_ID" --query "[?name=='${FED_BRANCH}'].name" -o tsv)"
if [[ -z "$EXISTING_BRANCH" ]]; then
  cat > /tmp/github-fed-branch.json <<EOF
{
  "name": "${FED_BRANCH}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${GITHUB_REPO}:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"],
  "description": "GitHub Actions pushes to main"
}
EOF
  az ad app federated-credential create --id "$APP_ID" --parameters /tmp/github-fed-branch.json --output none
fi

echo ""
echo "Add these GitHub Environment secrets (Settings → Environments → production):"
echo ""
echo "  AZURE_CLIENT_ID=${APP_ID}"
echo "  AZURE_TENANT_ID=${AZURE_TENANT_ID}"
echo "  AZURE_SUBSCRIPTION_ID=${AZURE_SUBSCRIPTION_ID}"
echo ""
echo "You can remove the old GCP_WORKLOAD_IDENTITY_PROVIDER / GCP_SERVICE_ACCOUNT secrets after cutover."
