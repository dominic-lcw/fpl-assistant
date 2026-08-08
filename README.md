# FPL Assistant

Fantasy Premier League chat assistant built with the [assistant-ui](https://www.assistant-ui.com/) minimal template, powered by Kimi (Moonshot), and grounded in the public FPL API.

## Features

- Google OAuth sign-in with administrator approval and account management
- Persistent, per-user chat threads and messages
- Manager ID input with persisted profile snapshot
- Live FPL tools: general info, fixtures, gameweek live, manager profile/history/squad, classic leagues, player detail
- Kimi built-in `$web_search` for player/team/manager news (same Moonshot/Kimi chat key)
- Deterministic captain / transfer / watchlist suggestions from form, xGI, and fixture difficulty
- Side-by-side suggestion comparisons in chat, clarifying-question chips (`ask_user_choices`), and follow-up prompt pills
- Legal 15-player squad builder (`draft_100` £100m or `wildcard` from manager value) with per-user drafts in Postgres
- Resizable right-hand draft rail (by position + stats) kept in sync with chat tools
- Agent skills under `.agents/skills/` documenting FPL API endpoints and web-search usage
- Minimal assistant-ui Thread chat UI with streaming responses
- Composer model picker for Kimi K3 and Kimi K2.7
- Last-reply token usage ring (assistant-ui Context Display)

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Fill in `.env.local`:

```
MOONSHOT_API_KEY=your_key_here
# optional default when the UI does not send a model (kimi-k3 | kimi-k2.7-code)
KIMI_MODEL=kimi-k3

AUTH_SECRET=          # openssl rand -base64 32
AUTH_GOOGLE_ID=       # Google OAuth client ID
AUTH_GOOGLE_SECRET=   # Google OAuth client secret
DATABASE_URL=         # Azure Postgres Flexible Server (?sslmode=require)
ADMIN_EMAILS=you@gmail.com
AUTH_TRUST_HOST=true
```

First-time Google sign-ins are stored as `pending`. Set `ADMIN_EMAILS` to one
or more comma-separated bootstrap administrator emails; administrators can
approve, reject, revoke, or restore accounts at `/admin`.

### Agent skills

Project skills for coding agents live in `.agents/skills/`:

- `fpl-api` — public FPL endpoints and how they map to `src/lib/fpl/*` tools
- `fpl-web-search` — when to use Kimi `$web_search` for players, teams, and managers

Restore other locked skills from `skills-lock.json` with `npx skills experimental_install` if needed.

### Local + Azure share one Postgres database

```bash
# terminal 1 — allow your current public IP on Flexible Server
pnpm db:allow-ip

# .env.local (same DB user/password as Azure)
DATABASE_URL=postgresql://fpl_assistant:YOUR_DB_PASSWORD@fpl-assistant-pg.postgres.database.azure.com:5432/fpl_assistant?sslmode=require

# terminal 2
pnpm db:migrate   # once, or after new migrations
pnpm dev
```

`sslmode=require` is required. Refresh the firewall rule with `pnpm db:allow-ip` when your IP changes.

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
- `pnpm db:allow-ip` — allow your public IP on Azure Postgres (for local access)
- `pnpm db:proxy` — alias of `db:allow-ip` (legacy name)

## Finding your Manager ID

Sign in at fantasy.premierleague.com → Points / Gameweek history. Your Manager ID is the number in the URL before `/history`.

## Deploy to Azure

Full from-scratch walkthrough (Postgres, Key Vault, Container Apps, OIDC CI, GCP teardown): see **[DEPLOY.md](DEPLOY.md)**.

The app is a stateless Next.js container (`Dockerfile` + `output: "standalone"`). Use **min replicas = 0** on Container Apps so idle cost is near zero. Postgres Flexible Server is the main fixed Azure cost; Moonshot/Kimi usage is the main variable cost.

### Quick path (new subscription)

```bash
az login
az account set --subscription '<your-new-subscription>'

export LOCATION=southeastasia
export ACR_NAME=dominicacr              # shared registry; globally unique
export KEY_VAULT=kv-fpl-assistant        # globally unique
export DB_PASSWORD='CHOOSE_A_STRONG_PASSWORD'

./scripts/azure/provision.sh
./scripts/azure/setup-github-oidc.sh     # then add AZURE_* GitHub secrets
```

After Azure is healthy, remove GCP with `./scripts/gcp/teardown.sh` (see **[DEPLOY.md](DEPLOY.md)** §Remove the GCP deployment).

### What gets created

| Azure resource | Role |
|----------------|------|
| Resource group | `rg-fpl-assistant` |
| Container Registry | Docker images |
| Container Apps + environment | HTTPS app, scale 0–2 |
| PostgreSQL Flexible Server 16 | Auth + chat data |
| Key Vault | Runtime secrets |
| User-assigned identity | ACR pull + Key Vault access |

### Redeploy

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Manual fallback: `./scripts/azure/deploy.sh`.
