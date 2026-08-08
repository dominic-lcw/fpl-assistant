#!/usr/bin/env bash
# Tear down the GCP deployment AFTER Azure is live and verified.
#
# This script is intentionally interactive (requires typing YES) and deletes:
#   - Cloud Run service
#   - Artifact Registry repository (and images)
#   - Cloud SQL instance (IRREVERSIBLE data loss on GCP)
#   - Secret Manager secrets used by the app
#   - GitHub deployer service account + Workload Identity pool (optional)
#
# Usage:
#   export PROJECT_ID=openclaw-dominic-209
#   export REGION=asia-southeast1
#   ./scripts/gcp/teardown.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-openclaw-dominic-209}"
REGION="${REGION:-asia-southeast1}"
SERVICE="${SERVICE:-fpl-assistant}"
REPO="${REPO:-fpl-assistant}"
DB_INSTANCE="${DB_INSTANCE:-fpl-assistant-db}"
DEPLOY_SA="${DEPLOY_SA:-github-deployer}"
WIF_POOL="${WIF_POOL:-github}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required for teardown." >&2
  exit 1
fi

gcloud config set project "$PROJECT_ID"

cat <<EOF
About to DELETE GCP resources in project ${PROJECT_ID}:
  - Cloud Run:          ${SERVICE} (${REGION})
  - Artifact Registry:  ${REPO} (${REGION})
  - Cloud SQL:          ${DB_INSTANCE}  *** DESTROYS DATABASE ***
  - Secrets:            MOONSHOT_API_KEY AUTH_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET DATABASE_URL
  - Deployer SA:        ${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com
  - WIF pool:           ${WIF_POOL}

Ensure Azure is healthy and you have exported any data you need from Cloud SQL.
EOF

read -r -p "Type YES to continue: " confirm
if [[ "$confirm" != "YES" ]]; then
  echo "Aborted."
  exit 1
fi

echo "==> Cloud Run"
gcloud run services delete "$SERVICE" --region="$REGION" --quiet || true

echo "==> Artifact Registry"
gcloud artifacts repositories delete "$REPO" --location="$REGION" --quiet || true

echo "==> Cloud SQL (this can take several minutes)"
gcloud sql instances delete "$DB_INSTANCE" --quiet || true

echo "==> Secret Manager"
for SECRET in MOONSHOT_API_KEY AUTH_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET DATABASE_URL; do
  gcloud secrets delete "$SECRET" --quiet || true
done

echo "==> Workload Identity / deployer SA"
gcloud iam workload-identity-pools providers delete github \
  --location=global \
  --workload-identity-pool="$WIF_POOL" \
  --quiet || true
gcloud iam workload-identity-pools delete "$WIF_POOL" \
  --location=global \
  --quiet || true
gcloud iam service-accounts delete "${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --quiet || true

echo ""
echo "GCP app resources removed."
echo "Manual follow-ups:"
echo "  1. Google OAuth client: remove old *.run.app origins/redirects; keep Azure URL + localhost."
echo "  2. GitHub → Settings → Environments → production: delete GCP_* secrets."
echo "  3. Optional: disable unused APIs or delete the whole GCP project if nothing else remains."
echo "  4. Cancel GCP billing if the project is unused."
