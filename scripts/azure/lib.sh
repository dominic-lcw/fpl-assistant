#!/usr/bin/env bash
# Shared helpers for Azure provision / deploy scripts.
set -euo pipefail

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

get_env() {
  local key="$1"
  local file="${ENV_FILE:-.env.local}"
  if [[ ! -f "$file" ]]; then
    echo "Env file not found: $file" >&2
    exit 1
  fi
  # shellcheck disable=SC2002
  local value
  value="$(grep -E "^${key}=" "$file" | head -n1 | sed "s/^${key}=//")"
  if [[ -z "$value" ]]; then
    echo "Missing ${key} in ${file}" >&2
    exit 1
  fi
  printf '%s' "$value"
}

get_env_optional() {
  local key="$1"
  local file="${ENV_FILE:-.env.local}"
  [[ -f "$file" ]] || { printf ''; return 0; }
  # shellcheck disable=SC2002
  grep -E "^${key}=" "$file" | head -n1 | sed "s/^${key}=//" || true
}

urlencode() {
  # Minimal URL-encode for passwords in DATABASE_URL
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read().rstrip("\n"), safe=""))'
}

load_azure_defaults() {
  export AZURE_SUBSCRIPTION_ID="${AZURE_SUBSCRIPTION_ID:-}"
  export RESOURCE_GROUP="${RESOURCE_GROUP:-rg-fpl-assistant}"
  export LOCATION="${LOCATION:-southeastasia}"
  export APP_NAME="${APP_NAME:-fpl-assistant}"
  export ACR_NAME="${ACR_NAME:-dominicacr}"
  export ACA_ENV="${ACA_ENV:-fpl-assistant-env}"
  export DB_SERVER="${DB_SERVER:-fpl-assistant-pg}"
  export DB_NAME="${DB_NAME:-fpl_assistant}"
  export DB_USER="${DB_USER:-fpl_assistant}"
  export KEY_VAULT="${KEY_VAULT:-kv-fpl-assistant}"
  export IMAGE_NAME="${IMAGE_NAME:-fpl-assistant}"
  export GITHUB_REPO="${GITHUB_REPO:-dominic-lcw/fpl-assistant}"
  export DEPLOY_APP_NAME="${DEPLOY_APP_NAME:-fpl-assistant-github-deploy}"
}

ensure_logged_in() {
  require_cmd az
  if ! az account show >/dev/null 2>&1; then
    echo "Not logged in. Run: az login" >&2
    exit 1
  fi
  if [[ -n "${AZURE_SUBSCRIPTION_ID}" ]]; then
    az account set --subscription "$AZURE_SUBSCRIPTION_ID"
  fi
  export AZURE_SUBSCRIPTION_ID
  AZURE_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
  export AZURE_TENANT_ID
  AZURE_TENANT_ID="$(az account show --query tenantId -o tsv)"
  echo "Using subscription ${AZURE_SUBSCRIPTION_ID} (${LOCATION})"
}
