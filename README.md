# FPL Assistant

Fantasy Premier League chat assistant built with the [assistant-ui](https://www.assistant-ui.com/) minimal template, powered by Azure AI Foundry (GPT-5.6), and grounded in the public FPL API.

## Features

- Google OAuth sign-in with administrator approval and account management
- Persistent, per-user chat threads and messages
- Manager ID input with persisted profile snapshot
- Live FPL tools: general info, fixtures, gameweek live, manager profile/history/squad, classic leagues, player detail
- Azure Foundry `web_search` for player/team/manager news (Bing grounding, same Azure chat credentials)
- Deterministic captain / transfer / watchlist suggestions from form, xGI, and fixture difficulty
- Side-by-side suggestion comparisons in chat, clarifying-question chips (`ask_user_choices`), and follow-up prompt pills
- Legal 15-player squad builder (`draft_100` £100m or `wildcard` from manager value) with per-user drafts in Postgres
- Resizable right-hand draft rail (by position + stats) kept in sync with chat tools
- Agent skills under `.agents/skills/` documenting FPL API endpoints and web-search usage
- Minimal assistant-ui Thread chat UI with streaming responses
- Composer model picker for GPT-5.6 Luna, Terra, and Sol
- Last-reply token usage ring (assistant-ui Context Display)

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
AZURE_API_KEY=your_key_here
AZURE_RESOURCE_NAME=your-foundry-resource
# optional default when the UI does not send a model (gpt-5.6-luna | gpt-5.6-terra | gpt-5.6-sol)
AZURE_MODEL=gpt-5.6-terra

AUTH_SECRET=          # openssl rand -base64 32
AUTH_GOOGLE_ID=       # Google OAuth client ID
AUTH_GOOGLE_SECRET=   # Google OAuth client secret
DATABASE_URL=         # same Cloud SQL DB via Auth Proxy (see below)
ADMIN_EMAILS=you@gmail.com
AUTH_TRUST_HOST=true
```

First-time Google sign-ins are stored as `pending`. Set `ADMIN_EMAILS` to one
or more comma-separated bootstrap administrator emails; administrators can
approve, reject, revoke, or restore accounts at `/admin`.

### Agent skills

Project skills for coding agents live in `.agents/skills/`:

- `fpl-api` — public FPL endpoints and how they map to `src/lib/fpl/*` tools
- `fpl-web-search` — when to use Azure `web_search` for players, teams, and managers

Restore other locked skills from `skills-lock.json` with `npx skills experimental_install` if needed.

### Local + Cloud Run share one Cloud SQL database

Install [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy), then:

```bash
# terminal 1 — tunnels Cloud SQL to 127.0.0.1:5432
pnpm db:proxy

# .env.local (same DB user/password as Cloud SQL)
DATABASE_URL=postgresql://fpl_assistant:YOUR_DB_PASSWORD@127.0.0.1:5432/fpl_assistant

# terminal 2
pnpm db:migrate   # once, or after new migrations
pnpm dev
```

Your Google account needs `roles/cloudsql.client` on the project (or equivalent).
Cloud Run uses a Unix-socket `DATABASE_URL` instead; see `.env.example`.

### Google OAuth client (local)

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (application type: Web application).
3. Authorized JavaScript origins: `http://localhost:3000`
4. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
5. Copy the client ID and secret into `.env.local`.

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with the bootstrap
administrator account, approve requested accounts at `/admin`, then ask for
squad, captain, or transfer advice. Conversations are saved per approved account.

## Scripts

- `pnpm dev` — development server
- `pnpm build` — production build
- `pnpm start` — production server
- `pnpm lint` — ESLint
- `pnpm test` — Vitest unit tests
- `pnpm typecheck` — TypeScript check
- `pnpm db:generate` — generate a new Drizzle migration after schema changes
- `pnpm db:migrate` — apply committed Drizzle migrations
- `pnpm db:proxy` — Cloud SQL Auth Proxy for local access to the shared DB

## Finding your Manager ID

Sign in at fantasy.premierleague.com → Points / Gameweek history. Your Manager ID is the number in the URL before `/history`.

## Deploy to Google Cloud Run

Full from-scratch walkthrough (secrets, local `linux/amd64` build, push, `AUTH_URL`, OAuth): see **[DEPLOY.md](DEPLOY.md)**.

The app is a stateless Next.js container (`Dockerfile` + `output: "standalone"`). Use **min instances = 0** and **request-based billing** so personal use usually stays within Cloud Run’s free tier. Your Azure Foundry usage is the main ongoing cost.

### 1. One-time GCP setup

```bash
export PROJECT_ID=your-gcp-project
export REGION=us-central1
export SERVICE=fpl-assistant
export REPO=fpl-assistant

gcloud config set project "$PROJECT_ID"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com

gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="FPL Assistant images"
```

### 2. Cloud SQL for PostgreSQL

Create a single-zone Cloud SQL PostgreSQL instance in the same region as Cloud
Run. Start with `db-f1-micro` and 10 GiB SSD for a personal, low-traffic app;
enable automated backups and storage auto-increase.

Create an application database/user, construct a `DATABASE_URL`, store it in
Secret Manager, and grant the Cloud Run runtime service account both
`roles/cloudsql.client` and `roles/secretmanager.secretAccessor`. Configure the
Cloud Run service with the instance connection name so it can use the Cloud SQL
connector rather than opening the database to the internet. Apply `pnpm
db:migrate` from a trusted environment whenever a new migration is deployed.

### 3. Secrets

```bash
# Azure Foundry
printf '%s' "$AZURE_API_KEY" | gcloud secrets create AZURE_API_KEY --data-file=-

# Auth.js
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create AUTH_SECRET --data-file=-
printf '%s' "$AUTH_GOOGLE_ID" | gcloud secrets create AUTH_GOOGLE_ID --data-file=-
printf '%s' "$AUTH_GOOGLE_SECRET" | gcloud secrets create AUTH_GOOGLE_SECRET --data-file=-
printf '%s' "$DATABASE_URL" | gcloud secrets create DATABASE_URL --data-file=-
```

Grant the Cloud Run runtime service account access to these secrets (replace `PROJECT_NUMBER` if needed):

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in AZURE_API_KEY AUTH_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET DATABASE_URL; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 4. Build and deploy

```bash
gcloud builds submit --tag "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"

gcloud run deploy "$SERVICE" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --cpu=1 \
  --memory=1Gi \
  --timeout=60 \
  --set-env-vars="AUTH_TRUST_HOST=true,ADMIN_EMAILS=you@gmail.com,AZURE_RESOURCE_NAME=your-foundry-resource,AZURE_MODEL=gpt-5.6-terra" \
  --set-secrets="AZURE_API_KEY=AZURE_API_KEY:latest,AUTH_SECRET=AUTH_SECRET:latest,AUTH_GOOGLE_ID=AUTH_GOOGLE_ID:latest,AUTH_GOOGLE_SECRET=AUTH_GOOGLE_SECRET:latest,DATABASE_URL=DATABASE_URL:latest"
```

`--allow-unauthenticated` makes the Cloud Run URL publicly reachable so browsers can load the app. **App-level Auth.js** still requires Google sign-in, and only accounts approved by an administrator can access the app.

### 5. Update the OAuth client for production

After deploy, note the service URL (e.g. `https://fpl-assistant-xxxxx-uc.a.run.app`).

In the Google OAuth client:

- Authorized JavaScript origins: add the Cloud Run origin
- Authorized redirect URIs: add `https://YOUR-SERVICE-xxxxx.run.app/api/auth/callback/google`

Redeploy only if you change the image or env; OAuth redirect updates apply in Google Console immediately.

### 6. Redeploy after code changes

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): tests, image build/push to Artifact Registry, and Cloud Run deploy onto the new image. One-time Workload Identity setup is in **[DEPLOY.md](DEPLOY.md)** (§8).

Manual fallback:

```bash
gcloud builds submit --tag "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest"
gcloud run deploy "$SERVICE" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}:latest" \
  --region="$REGION"
```

### Cost notes

- Request-based billing + `min-instances=0`: idle cost is effectively $0
- Free tier (per billing account, Tier 1 regions like `us-central1`): ~180k vCPU-seconds, ~360k GiB-seconds, 2M requests / month
- Artifact Registry / Cloud Build for a small personal image is usually free or cents
- Google OAuth is free; Azure Foundry / web search usage is billed separately
