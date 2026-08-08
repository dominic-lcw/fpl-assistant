# Deploy FPL Assistant to Azure

From-scratch guide for a new Azure subscription: **local Docker build → Azure Container Registry → Container Apps**, with **Azure Database for PostgreSQL (Flexible Server)** and secrets in **Key Vault**.

The app is a Next.js standalone container (`Dockerfile` + `output: "standalone"` in `next.config.ts`).

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`) — logged into your **new subscription** (`az login` / `az account set`)
- Docker Desktop (or equivalent) running
- Node 20 + pnpm (for `pnpm db:migrate`)
- Values ready (same as `.env.example` / `.env.local`):
  - `MOONSHOT_API_KEY`
  - `AUTH_SECRET` — `openssl rand -base64 32`
  - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth Web client
  - `ADMIN_EMAILS` — comma-separated bootstrap administrator emails

## Variables

```bash
export RESOURCE_GROUP=rg-fpl-assistant
export LOCATION=southeastasia          # or eastasia / westeurope / …
export APP_NAME=fpl-assistant
export ACR_NAME=openclawacr            # shared registry; globally unique, lowercase alphanumeric
export KEY_VAULT=kv-fpl-assistant      # globally unique, 3–24 chars
export DB_SERVER=fpl-assistant-pg      # globally unique DNS name
export DB_NAME=fpl_assistant
export DB_USER=fpl_assistant
export DB_PASSWORD='CHOOSE_A_STRONG_PASSWORD'
export ACA_ENV=fpl-assistant-env
export GITHUB_REPO=dominic-lcw/fpl-assistant

az account show   # confirm the new subscription
# az account set --subscription '<subscription-id-or-name>'
```

## 1. One-command provision (recommended)

From the repo root, with `.env.local` filled in:

```bash
chmod +x scripts/azure/*.sh scripts/gcp/*.sh
./scripts/azure/provision.sh
```

This creates:

| Resource | Name (defaults) |
|----------|-----------------|
| Resource group | `rg-fpl-assistant` |
| Container Registry | `openclawacr` (shared; not app-specific) |
| Log Analytics + Container Apps env | `fpl-assistant-env` |
| PostgreSQL 16 Flexible Server (Burstable B1ms) | `fpl-assistant-pg` |
| Key Vault secrets | `moonshot-api-key`, `auth-secret`, `auth-google-id`, `auth-google-secret`, `database-url` |
| User-assigned identity | ACR pull + Key Vault get |
| Container App | public HTTPS, min 0 / max 2 replicas, port 3000 |
| Firewall | Azure services + your current public IP |
| Migrations | runs `pnpm db:migrate` |

Save the printed app URL and DB password.

### Manual step-by-step (same outcome)

If you prefer not to use the script, see the commands inside [`scripts/azure/provision.sh`](scripts/azure/provision.sh). The mapping from the old GCP stack is:

| Was (GCP) | Now (Azure) |
|-----------|-------------|
| Cloud Run | Azure Container Apps |
| Artifact Registry | Azure Container Registry |
| Cloud SQL Postgres | Azure Database for PostgreSQL Flexible Server |
| Secret Manager | Azure Key Vault |
| Cloud SQL Auth Proxy | Firewall allow-list + `sslmode=require` |
| WIF → `github-deployer` | Entra app + federated credential (OIDC) |

## 2. Local development against Azure Postgres

```bash
# refresh firewall rule when your IP changes
pnpm db:allow-ip

# .env.local
DATABASE_URL=postgresql://fpl_assistant:YOUR_DB_PASSWORD@fpl-assistant-pg.postgres.database.azure.com:5432/fpl_assistant?sslmode=require

pnpm db:migrate   # when schema changes
pnpm dev
```

`sslmode=require` is mandatory for Flexible Server.

## 3. Google OAuth for production

In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → your OAuth 2.0 Web client (OAuth can stay on Google; only hosting moves):

- **Authorized JavaScript origins:**
  - `https://<container-app-fqdn>`
  - `https://fplassistant.app` (if you attach a custom domain)
  - `http://localhost:3000`
- **Authorized redirect URIs:**
  - `https://<container-app-fqdn>/api/auth/callback/google`
  - `https://fplassistant.app/api/auth/callback/google`
  - `http://localhost:3000/api/auth/callback/google`

Set Container App `AUTH_URL` to the URL users open (script sets the default FQDN; update if you add a custom domain):

```bash
az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --set-env-vars "AUTH_URL=https://fplassistant.app"
```

## 4. Redeploy after code changes

### CI (preferred)

```bash
./scripts/azure/setup-github-oidc.sh
```

Add GitHub **Environment** `production` secrets:

| Secret | Value |
|--------|--------|
| `AZURE_CLIENT_ID` | App (client) ID printed by the script |
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID |

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): tests → build/push ACR → Container Apps update → smoke `/signin`.

### Manual

```bash
./scripts/azure/deploy.sh
```

### Update a secret later

```bash
printf '%s' "$NEW_VALUE" | az keyvault secret set \
  --vault-name "$KEY_VAULT" \
  --name moonshot-api-key \
  --file /dev/stdin

# Force a new revision so the app reloads Key Vault refs if needed
az containerapp revision restart \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --revision "$(az containerapp revision list -n "$APP_NAME" -g "$RESOURCE_GROUP" --query '[0].name' -o tsv)"
```

## 5. Optional: copy data from Cloud SQL → Azure

Only if you need existing users/threads before deleting GCP:

```bash
# terminal A — old Cloud SQL
cloud-sql-proxy openclaw-dominic-209:asia-southeast1:fpl-assistant-db --port 5433

# dump
pg_dump "postgresql://fpl_assistant:OLD_PASSWORD@127.0.0.1:5433/fpl_assistant" \
  --no-owner --no-acl -Fc -f fpl.dump

# restore into Azure (firewall must allow your IP)
pg_restore --clean --if-exists --no-owner --no-acl \
  -d "postgresql://fpl_assistant:NEW_PASSWORD@fpl-assistant-pg.postgres.database.azure.com:5432/fpl_assistant?sslmode=require" \
  fpl.dump
```

If you start fresh on Azure, skip this and keep `pnpm db:migrate` only.

## 6. Custom domain (optional)

```bash
az containerapp hostname add \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --hostname fplassistant.app
# follow DNS TXT/CNAME validation, then bind a managed certificate
az containerapp hostname bind \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --hostname fplassistant.app \
  --validation-method CNAME
```

Update `AUTH_URL` + Google OAuth as in §3.

## Smoke checks

```bash
APP_FQDN=$(az containerapp show -n "$APP_NAME" -g "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn -o tsv)
curl -sI "https://${APP_FQDN}/signin" | head
```

Sign in with an `ADMIN_EMAILS` account, approve users at `/admin`, try a chat turn.

## Cost (personal use)

- **Container Apps** Consumption: `min-replicas=0` → idle ≈ $0
- **ACR Basic**: small monthly fee for the registry
- **PostgreSQL Flexible Burstable B1ms**: always-on (main fixed cost; stop/start the server if you want to pause)
- **Key Vault / Log Analytics**: usually cents at this scale
- **Moonshot / Kimi API**: billed separately (main variable cost)
- Google OAuth: free

---

## Remove the GCP deployment (after Azure cutover)

Do this only when the Azure URL works (sign-in, chat, admin) and you have migrated or accepted losing Cloud SQL data.

### Checklist

1. **Verify Azure** — smoke `/signin`, Google OAuth, migrate/restore DB if needed, update DNS/`AUTH_URL` if using `fplassistant.app`.
2. **Update Google OAuth** — add Azure origins/redirects; remove `*.run.app` entries once unused.
3. **Export Cloud SQL** (optional) — `pg_dump` via Auth Proxy if you still need a backup.
4. **Run teardown script** (interactive; type `YES`):

```bash
export PROJECT_ID=openclaw-dominic-209
export REGION=asia-southeast1
./scripts/gcp/teardown.sh
```

Deletes: Cloud Run service, Artifact Registry repo, Cloud SQL instance, app secrets, WIF pool, `github-deployer` SA.

5. **GitHub** — Environment `production`: delete `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` (keep `AZURE_*`).
6. **Billing** — if the GCP project is empty, disable billing or delete the project in Cloud Console.
7. **Local tooling** — you can uninstall `cloud-sql-proxy` / stop using `gcloud` for this app; local DB access is `pnpm db:allow-ip` + Azure `DATABASE_URL`.

### Manual gcloud equivalents

```bash
gcloud config set project openclaw-dominic-209
gcloud run services delete fpl-assistant --region=asia-southeast1 --quiet
gcloud artifacts repositories delete fpl-assistant --location=asia-southeast1 --quiet
gcloud sql instances delete fpl-assistant-db --quiet
for S in MOONSHOT_API_KEY AUTH_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET DATABASE_URL; do
  gcloud secrets delete "$S" --quiet
done
```
