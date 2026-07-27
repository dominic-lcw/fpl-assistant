# FPL Assistant

Fantasy Premier League chat assistant built with the [assistant-ui](https://www.assistant-ui.com/) minimal template, powered by Kimi (Moonshot), and grounded in the public FPL API.

## Features

- Manager ID input with persisted profile snapshot
- Live FPL tools: general info, fixtures, gameweek live, manager profile/history/squad, classic leagues, player detail
- Deterministic captain / transfer / watchlist suggestions from form, xGI, and fixture difficulty
- Minimal assistant-ui Thread chat UI with streaming responses

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Add your Moonshot API key:

```
MOONSHOT_API_KEY=your_key_here
# optional
KIMI_MODEL=kimi-k3
```

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), enter your FPL Manager ID, and ask for squad, captain, or transfer advice.

## Scripts

- `pnpm dev` — development server
- `pnpm build` — production build
- `pnpm lint` — ESLint
- `pnpm test` — Vitest unit tests
- `pnpm typecheck` — TypeScript check

## Finding your Manager ID

Sign in at fantasy.premierleague.com → Points / Gameweek history. Your Manager ID is the number in the URL before `/history`.
