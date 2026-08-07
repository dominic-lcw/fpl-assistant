# Set up GitHub Actions → Cloud Run deploy

One-time manual setup so [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) can authenticate to GCP and roll Cloud Run onto a new image.

If the Deploy workflow fails with:

> `must specify exactly one of "workload_identity_provider" or "credentials_json"`

the GitHub secrets below are missing or empty. Complete these steps, then re-run the workflow.

## 1. GCP (local terminal)

Requires `gcloud` logged in with permission to manage IAM on the project.

```bash
export PROJECT_ID=openclaw-dominic-209
export GITHUB_REPO=dominic-lcw/fpl-assistant
export DEPLOY_SA=github-deployer

gcloud config set project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Service account for deploys (no JSON key; impersonated by GitHub via WIF)
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

# Workload Identity Federation (GitHub OIDC)
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

# Copy this output — it is the GCP_WORKLOAD_IDENTITY_PROVIDER secret value
gcloud iam workload-identity-pools providers describe github \
  --location=global \
  --workload-identity-pool=github \
  --format='value(name)'
```

The last command prints a value like:

```text
projects/123456789012/locations/global/workloadIdentityPools/github/providers/github
```

## 2. GitHub secrets

1. Open the repo → **Settings → Environments → New environment**.
2. Name it exactly **`production`** (the workflow sets `environment: production`).
3. On that environment, add these secrets:

| Name | Value |
|------|--------|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full provider name from the last `gcloud` command above |
| `GCP_SERVICE_ACCOUNT` | `github-deployer@openclaw-dominic-209.iam.gserviceaccount.com` |

Put them on the **`production` environment** (not only as repo-level secrets). Empty values cause the auth error above.

Optional: add required reviewers on `production` if you want a human gate before deploy.

## 3. Re-run the workflow

- **Actions → Deploy → Re-run failed jobs**, or
- **Actions → Deploy → Run workflow** (`workflow_dispatch`)

On success, the job builds a `linux/amd64` image, pushes `:sha` + `:latest` to Artifact Registry, and deploys that image to Cloud Run service `fpl-assistant` in `asia-southeast1`.
