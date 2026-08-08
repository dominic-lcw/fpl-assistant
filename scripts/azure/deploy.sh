#!/usr/bin/env bash
# Build (linux/amd64), push to ACR, and update the Container App.
#
# Usage (from repo root):
#   ./scripts/azure/deploy.sh
#   ./scripts/azure/deploy.sh --tag "$GITHUB_SHA"
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

load_azure_defaults
ensure_logged_in
require_cmd docker

TAG="latest"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      TAG="$2"
      shift 2
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

ACR_LOGIN_SERVER="$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer -o tsv)"
IMAGE_SHA="${ACR_LOGIN_SERVER}/${IMAGE_NAME}:${TAG}"
IMAGE_LATEST="${ACR_LOGIN_SERVER}/${IMAGE_NAME}:latest"

az acr login --name "$ACR_NAME"
docker build --platform linux/amd64 -t "$IMAGE_SHA" -t "$IMAGE_LATEST" .
docker push "$IMAGE_SHA"
docker push "$IMAGE_LATEST"

az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --image "$IMAGE_SHA" \
  --output none

APP_FQDN="$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn -o tsv)"
APP_URL="https://${APP_FQDN}"

echo "Deployed ${IMAGE_SHA}"
echo "Smoke: ${APP_URL}/signin"
curl -fsS -o /dev/null -w "%{http_code}\n" "${APP_URL}/signin"
