# Échappée

Ad-free cycling news, one clean feed. Échappée scrapes the sources you care
about — English and Dutch, racing to gravel — extracts the full article text
(reader mode, zero ads), enriches it with an LLM (summary, category, story
clustering), and presents everything in a fast mobile-first PWA.

Single-user, self-hosted, no accounts.

## Quick start (local)

```bash
cd echappee
npm install
npm run seed          # optional: sample articles so the UI isn't empty
npm run dev           # server on :3600, web dev server on :5173
```

Open http://localhost:5173. The feed refreshes from all sources every
30 minutes; use the refresh button (or `npm run refresh`) to trigger a run
manually.

## Production

Two supported setups:

- **Vercel + Neon + GitHub Actions scraper** — see [DEPLOY.md](./DEPLOY.md)
  for a phone-friendly step-by-step. The API/PWA run on Vercel, the database
  is Neon Postgres, and the scraper runs as a scheduled GitHub workflow
  (`.github/workflows/echappee-scrape.yml`).
- **Docker on your own box**:

```bash
cd echappee
cp .env.example .env  # fill in LLM_API_KEY etc.
docker compose up -d --build
```

Open http://your-host:3600 and "Add to Home Screen" on your phone.

Without Docker: `npm run build && npm start` serves the built PWA and API
from one process on `:3600`.

## Storage

The app speaks Postgres. With `DATABASE_URL` set it uses that (Neon in
production); without it, it runs an embedded Postgres (PGlite) persisted to
`data/pg` — zero setup for local dev, and what the tests use in-memory.

## LLM configuration

Any OpenAI-compatible provider works; DeepSeek is the default. Set in `.env`
(or the environment):

| Variable | Default | Notes |
| --- | --- | --- |
| `LLM_API_KEY` | *(empty)* | Empty = AI disabled; app stays fully usable |
| `LLM_BASE_URL` | `https://api.deepseek.com` | e.g. `https://api.openai.com/v1` |
| `LLM_MODEL` | `deepseek-chat` | any chat-completions model id |

With a key, each new article gets a 2-sentence summary (in its own
language), a category, and is clustered with other coverage of the same
story. Without one, keyword rules pick categories and a strict
title-similarity fallback does the clustering.

## Sources

Defined in `server/src/sources.ts` — add an entry (name, feed URLs, language,
default category) and restart. Multiple candidate feed URLs per source are
tried until one works; per-source scrape health is visible under Settings.
v1 ships with: Cyclingnews, Velo, Cycling Weekly, BikeRadar, WielerFlits,
Sporza Wielrennen. Paywalled sites are deliberately excluded.

Scraping is polite: RSS-first, only new items fetched, 2s delay between
article fetches per host, honest User-Agent, ~25 items max per source per run.

## Architecture

```
echappee/
├─ server/          Fastify + Postgres/PGlite + node-cron (TypeScript, ESM)
│  ├─ src/pipeline/ fetchFeeds → extract (reader mode) → enrich (LLM) → store
│  ├─ src/routes/   REST API (/api/feed, /api/articles/:id, mutes, sources…)
│  └─ fixtures/     sample articles for offline dev + tests (npm run seed)
├─ web/             React + Vite + Tailwind PWA (feed / reader / settings)
├─ api/             Vercel serverless entrypoint (wraps the same Fastify API)
├─ vercel.json      Vercel build config (root directory: echappee)
└─ Dockerfile       single container: API + static PWA + scheduler
```

## Commands

| Command | What |
| --- | --- |
| `npm run dev` | server (tsx watch) + web (vite) |
| `npm run build` | build web then compile server |
| `npm start` | run production server |
| `npm run seed` | load fixture articles |
| `npm run refresh` | one-off scrape of all sources |
| `npm test` | server test suite (vitest) |
