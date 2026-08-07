<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## FPL domain skills

When working on Fantasy Premier League data, tools, or advice flows, use:

- `.agents/skills/fpl-api/SKILL.md` — API endpoints and app tool mapping
- `.agents/skills/fpl-web-search/SKILL.md` — Kimi built-in `$web_search` for player/team/manager news

Chat runtime tools: FPL API tools in `src/lib/fpl/tools.ts`, plus Kimi `$web_search` in `src/lib/kimi/`.
