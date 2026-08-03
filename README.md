# FPL Assistant

Fantasy Premier League chat assistant built with the [assistant-ui](https://www.assistant-ui.com/) minimal template, powered by Kimi (Moonshot), and grounded in the public FPL API.

## Features

- Google OAuth sign-in restricted to a single allowlisted email
- Manager ID input with persisted profile snapshot
- Live FPL tools: general info, fixtures, gameweek live, manager profile/history/squad, classic leagues, player detail
- `web_search` tool for player/team/manager news (DuckDuckGo by default; optional Tavily)
- Deterministic captain / transfer / watchlist suggestions from form, xGI, and fixture difficulty
- Agent skills under `.agents/skills/` documenting FPL API endpoints and web-search usage
- Minimal assistant-ui Thread chat UI with streaming responses

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
MOONSHOT_API_KEY=your_key_here
# optional
KIMI_MODEL=kimi-k3

AUTH_SECRET=          # openssl rand -base64 32
AUTH_GOOGLE_ID=       # Google OAuth client ID
AUTH_GOOGLE_SECRET=   # Google OAuth client secret
ALLOWED_EMAIL=you@gmail.com
AUTH_TRUST_HOST=true

# optional — better web_search quality
# TAVILY_API_KEY=tvly-...
```

### Agent skills

Project skills for coding agents live in `.agents/skills/`:

- `fpl-api` — public FPL endpoints and how they map to `src/lib/fpl/*` tools
- `fpl-web-search` — when to search the web for players, teams, and managers

Restore other locked skills from `skills-lock.json` with `npx skills experimental_install` if needed.

### Google OAuth client (local)

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth 2.0 Client ID** (application type: Web application).
3. Authorized JavaScript origins: `http://localhost:3000`
4. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
5. Copy the client ID and secret into `.env.local`.

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with the allowlisted Google account, enter your FPL Manager ID, and ask for squad, captain, or transfer advice.

## Scripts

- `pnpm dev` — development server
- `pnpm build` — production build
- `pnpm start` — production server
- `pnpm lint` — ESLint
- `pnpm test` — Vitest unit tests
- `pnpm typecheck` — TypeScript check

## Finding your Manager ID

Sign in at fantasy.premierleague.com → Points / Gameweek history. Your Manager ID is the number in the URL before `/history`.

## Deploy to Google Cloud Run

Full from-scratch walkthrough (secrets, local `linux/amd64` build, push, `AUTH_URL`, OAuth): see **[DEPLOY.md](DEPLOY.md)**.

The app is a stateless Next.js container (`Dockerfile` + `output: "standalone"`). Use **min instances = 0** and **request-based billing** so personal use usually stays within Cloud Run’s free tier. Your Moonshot API usage is the main ongoing cost.

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

### 2. Secrets

```bash
# Moonshot
printf '%s' "$MOONSHOT_API_KEY" | gcloud secrets create MOONSHOT_API_KEY --data-file=-

# Auth.js
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create AUTH_SECRET --data-file=-
printf '%s' "$AUTH_GOOGLE_ID" | gcloud secrets create AUTH_GOOGLE_ID --data-file=-
printf '%s' "$AUTH_GOOGLE_SECRET" | gcloud secrets create AUTH_GOOGLE_SECRET --data-file=-
```

Grant the Cloud Run runtime service account access to these secrets (replace `PROJECT_NUMBER` if needed):

```bash
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in MOONSHOT_API_KEY AUTH_SECRET AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 3. Build and deploy

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
  --set-env-vars="AUTH_TRUST_HOST=true,ALLOWED_EMAIL=you@gmail.com,KIMI_MODEL=kimi-k3" \
  --set-secrets="MOONSHOT_API_KEY=MOONSHOT_API_KEY:latest,AUTH_SECRET=AUTH_SECRET:latest,AUTH_GOOGLE_ID=AUTH_GOOGLE_ID:latest,AUTH_GOOGLE_SECRET=AUTH_GOOGLE_SECRET:latest"
```

`--allow-unauthenticated` makes the Cloud Run URL publicly reachable so browsers can load the app. **App-level Auth.js** still requires Google sign-in and rejects any email that is not `ALLOWED_EMAIL`.

### 4. Update the OAuth client for production

After deploy, note the service URL (e.g. `https://fpl-assistant-xxxxx-uc.a.run.app`).

In the Google OAuth client:

- Authorized JavaScript origins: add the Cloud Run origin
- Authorized redirect URIs: add `https://YOUR-SERVICE-xxxxx.run.app/api/auth/callback/google`

Redeploy only if you change the image or env; OAuth redirect updates apply in Google Console immediately.

### 5. Redeploy after code changes

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
- Google OAuth is free; Moonshot/Kimi usage is billed separately
