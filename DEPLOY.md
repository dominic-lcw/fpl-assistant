# Deploy FPL Assistant to Cloud Run

From-scratch guide matching how this app was first deployed: **local Docker build → Artifact Registry → Cloud Run**, with secrets in Secret Manager.

The app is a Next.js standalone container (`Dockerfile` + `output: "standalone"` in `next.config.ts`).

## Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`)
- Docker Desktop (or equivalent) running
- A GCP project with billing enabled
- Values ready (same as `.env.example` / `.env.local`):
  - `MOONSHOT_API_KEY`
  - `AUTH_SECRET` — `openssl rand -base64 32`
  - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth Web client
  - `DATABASE_URL` — PostgreSQL connection URL
  - `ADMIN_EMAILS` — comma-separated bootstrap administrator emails

## Variables used in this project

```bash
export PROJECT_ID=openclaw-dominic-209
export REGION=asia-southeast1
export SERVICE=fpl-assistant
export REPO=fpl-assistant
export IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"

gcloud config set project "$PROJECT_ID"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
```

Use another project/region if needed; keep `REGION` consistent for Artifact Registry and Cloud Run.

## 1. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

(`cloudbuild` is optional if you only build locally.)

## 2. Create Artifact Registry repo

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="FPL Assistant images"
```

Skip if the repo already exists.

## 3. Create secrets

Load from `.env.local` (or export by hand). Do not commit secrets.

```bash
get_env() { grep "^$1=" .env.local | sed "s/^$1=//"; }

create_or_update_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=-
  fi
}

create_or_update_secret MOONSHOT_API_KEY "$(get_env MOONSHOT_API_KEY)"
create_or_update_secret AUTH_SECRET "$(get_env AUTH_SECRET)"
create_or_update_secret AUTH_GOOGLE_ID "$(get_env AUTH_GOOGLE_ID)"
create_or_update_secret AUTH_GOOGLE_SECRET "$(get_env AUTH_GOOGLE_SECRET)"
create_or_update_secret DATABASE_URL "$(get_env DATABASE_URL)"
```

Grant the default Compute runtime service account access:

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in MOONSHOT_API_KEY AUTH_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET DATABASE_URL; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
done
```

Non-secret config (`ADMIN_EMAILS`, `KIMI_MODEL`, `AUTH_TRUST_HOST`, `AUTH_URL`) goes on the Cloud Run service as env vars, not secrets.

## 4. Create Cloud SQL and migrate

Create a single-zone PostgreSQL instance in the same region as Cloud Run. The
following uses the smallest shared-core tier for personal/low-traffic usage;
it is not highly available.

```bash
export DB_INSTANCE=fpl-assistant-db
export DB_NAME=fpl_assistant
export DB_USER=fpl_assistant

gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 \
  --edition=ENTERPRISE \
  --tier=db-f1-micro \
  --region="$REGION" \
  --storage-size=10GB \
  --storage-auto-increase \
  --backup-start-time=03:00

gcloud sql databases create "$DB_NAME" --instance="$DB_INSTANCE"
gcloud sql users create "$DB_USER" --instance="$DB_INSTANCE" --password='CHOOSE_A_STRONG_PASSWORD'
```

### Cloud Run `DATABASE_URL` (Unix socket)

```bash
export DB_PASSWORD='CHOOSE_A_STRONG_PASSWORD'
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
printf '%s' "$DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=-
# or: gcloud secrets versions add DATABASE_URL --data-file=-
```

The Cloud Run service account needs the Cloud SQL Client role:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/cloudsql.client"
```

### Local `DATABASE_URL` (same instance via Auth Proxy)

Install [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy), grant your user `roles/cloudsql.client`, then:

```bash
# terminal 1
pnpm db:proxy

# .env.local
DATABASE_URL=postgresql://fpl_assistant:CHOOSE_A_STRONG_PASSWORD@127.0.0.1:5432/fpl_assistant

# terminal 2 — migrate once against the shared DB
pnpm db:migrate
pnpm dev
```

Local and Cloud Run then read/write the same users, approvals, and chat history.

## 5. Build locally and push

Cloud Run needs **`linux/amd64`**. On Apple Silicon, always pass `--platform linux/amd64` or the revision will fail with a manifest/architecture error.

```bash
docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"
```

`.dockerignore` excludes `node_modules`, `.next`, `.env*`, etc. The image builds with pnpm inside the Dockerfile.

### Alternative: Cloud Build

```bash
gcloud builds submit --tag "$IMAGE"
```

If that returns `PERMISSION_DENIED`, use the local Docker path above (what worked for this project).

## 6. Deploy to Cloud Run

First deploy (creates the service):

```bash
ADMIN_EMAILS=$(get_env ADMIN_EMAILS)
KIMI_MODEL=$(get_env KIMI_MODEL)
KIMI_MODEL=${KIMI_MODEL:-kimi-k3}

gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --cpu=1 \
  --memory=1Gi \
  --timeout=60 \
  --add-cloudsql-instances="${PROJECT_ID}:${REGION}:${DB_INSTANCE}" \
  --set-env-vars="AUTH_TRUST_HOST=true,ADMIN_EMAILS=${ADMIN_EMAILS},KIMI_MODEL=${KIMI_MODEL}" \
  --set-secrets="MOONSHOT_API_KEY=MOONSHOT_API_KEY:latest,AUTH_SECRET=AUTH_SECRET:latest,AUTH_GOOGLE_ID=AUTH_GOOGLE_ID:latest,AUTH_GOOGLE_SECRET=AUTH_GOOGLE_SECRET:latest,DATABASE_URL=DATABASE_URL:latest"
```

Notes:

- `--allow-unauthenticated` = public HTTPS URL. Sign-in is still enforced by Auth.js; new accounts remain pending until an administrator approves them.
- `min-instances=0` = scale to zero when idle (request-based billing).

Get the URL:

```bash
gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)'
# e.g. https://fpl-assistant-jimwsgdi4a-as.a.run.app
```

### Set AUTH_URL

Cloud Run listens on `0.0.0.0`; without `AUTH_URL`, Auth.js may redirect to `https://0.0.0.0:8080/...`. Set it to the real service URL:

```bash
RUN_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')

gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --update-env-vars="AUTH_URL=${RUN_URL},AUTH_TRUST_HOST=true"
```

## 7. Google OAuth for production

In [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) → your OAuth 2.0 Web client:

- **Authorized JavaScript origins:** `https://YOUR-SERVICE-xxxxx.run.app`
- **Authorized redirect URIs:** `https://YOUR-SERVICE-xxxxx.run.app/api/auth/callback/google`

Keep `http://localhost:3000` entries for local dev. Changes apply immediately (no redeploy).

## 8. Redeploy after code changes

Preferred: merge to `main` and let GitHub Actions build/push/deploy (see [CI/CD](#8-cicd-github-actions--cloud-run) below).

Manual fallback:

```bash
docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION"
```

Env and secrets persist unless you pass `--set-env-vars` / `--set-secrets` again.

### Update a secret later

```bash
printf '%s' "$NEW_VALUE" | gcloud secrets versions add MOONSHOT_API_KEY --data-file=-
# Cloud Run picks up :latest on new revisions; force a no-op deploy if needed:
gcloud run services update "$SERVICE" --region="$REGION" --update-secrets=MOONSHOT_API_KEY=MOONSHOT_API_KEY:latest
```

## 8. CI/CD (GitHub Actions → Cloud Run)

Workflow: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

On every push to `main` (and manual `workflow_dispatch`), it:

1. Runs typecheck + tests
2. Authenticates to GCP via Workload Identity Federation (no JSON key)
3. Builds a `linux/amd64` image and pushes `:sha` + `:latest` to Artifact Registry
4. Deploys that image to Cloud Run so the service runs the new revision
5. Smoke-checks `/signin`

### One-time GCP setup for GitHub Actions

```bash
export PROJECT_ID=openclaw-dominic-209
export REGION=asia-southeast1
export SERVICE=fpl-assistant
export GITHUB_REPO=dominic-lcw/fpl-assistant   # owner/repo
export DEPLOY_SA=github-deployer

gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Deployer service account (no key; impersonated by GitHub via WIF)
gcloud iam service-accounts create "$DEPLOY_SA" \
  --display-name="GitHub Actions Cloud Run deployer" || true

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Workload Identity pool + GitHub OIDC provider
gcloud iam workload-identity-pools create github \
  --location=global \
  --display-name="GitHub Actions" || true

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global \
  --workload-identity-pool=github \
  --display-name="GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository=='${GITHUB_REPO}'" || true

gcloud iam service-accounts add-iam-policy-binding \
  "${DEPLOY_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_REPO}"

echo "WIF provider resource name:"
gcloud iam workload-identity-pools providers describe github \
  --location=global \
  --workload-identity-pool=github \
  --format='value(name)'
```

### GitHub repository configuration

1. Create a GitHub Environment named **`production`** (Settings → Environments).
2. Add repository (or environment) secrets:

| Secret | Value |
|--------|--------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider resource name from the `describe` command above |
| `GCP_SERVICE_ACCOUNT` | `github-deployer@openclaw-dominic-209.iam.gserviceaccount.com` |

Optional: add required reviewers on the `production` environment if you want a human gate before deploy.

## Smoke checks

```bash
RUN_URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
curl -sI "$RUN_URL/signin" | head
# Expect HTTP 200, cookies for authjs
```

Open the URL, sign in with an address in `ADMIN_EMAILS`, approve a requested account at `/admin`, enter an FPL manager ID, and try a chat turn.

## Current production pointers

| Item | Value |
|------|--------|
| Project | `openclaw-dominic-209` |
| Region | `asia-southeast1` |
| Service | `fpl-assistant` |
| Image | `asia-southeast1-docker.pkg.dev/openclaw-dominic-209/fpl-assistant/fpl-assistant:latest` |
| URL | https://fpl-assistant-jimwsgdi4a-as.a.run.app |

Custom domain (`fplassistant.app`) work is tracked separately under `todos/` (gitignored), not required for the Run URL above.

## Cost (personal use)

- Cloud Run: request-based + `min-instances=0` → idle ≈ $0; free tier applies in many regions
- Artifact Registry: small image storage usually free or cents
- Secret Manager: negligible at this scale
- Moonshot / Kimi API: billed separately (main ongoing cost)
- Google OAuth: free
