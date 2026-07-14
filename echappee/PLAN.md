# Échappée — implementation plan & decisions

Product decisions captured from the kickoff Q&A (2026-07-14):

| Decision | Choice |
| --- | --- |
| Content scope | Pro road racing, transfers/rider news, gear & tech, gravel/MTB/CX |
| Sources | Big English + Dutch/Belgian + independent; **free sources only** (no paywalls) |
| Reading | Full text in-app via reader-mode extraction, zero ads |
| Architecture | Self-contained Node/TS app: Fastify + SQLite + in-process cron |
| AI | Full pipeline (summaries, categories, clustering) via **configurable OpenAI-compatible provider — DeepSeek default**, model swappable via env |
| Features | Story clustering/dedupe, read tracking, filters & term/source muting |
| Usage | Live feed, ~30 min refresh cadence |
| UI | Mobile-first installable PWA, clean reader aesthetic, dark/light |
| Language | English UI; summaries in the article's original language |
| Users | Single user, no auth (private network / trusted URL) |
| Deployment | Vercel (PWA + API) + Neon Postgres + GitHub Actions scraper — see DEPLOY.md. Docker/compose remains for self-hosting |
| Storage | Postgres dialect everywhere: Neon in production, embedded PGlite for local dev/tests |
| Clusters | One card per story: best article + chips for other sources |
| Name | Échappée (`echappee/`) |

## v1 (this branch) — done

- Pipeline: RSS fetch (multi-URL fallback per source) → new-item detection →
  reader-mode extraction (`@extractus/article-extractor`) → LLM enrichment
  with graceful degradation (keyword categories + strict title-overlap
  clustering when no key) → SQLite.
- API: paginated clustered feed with filters, full article, read state,
  mutes CRUD, source health, status, manual refresh.
- Web: feed with category chips + unread toggle, reader view with
  same-story-elsewhere, settings (mutes, source health, AI status), PWA.
- Tests: pipeline units + API integration (vitest, in-memory DB).
- Docker: multi-stage build, single container, volume-backed DB.

## Known constraints

- The dev container used to build this has no outbound network to news
  sites, so feed URLs in `sources.ts` are best-effort and easy to correct;
  Settings → Sources shows per-source errors after the first real run.
- Extraction quality varies per site; sites that render articles
  client-side may need a per-source extractor tweak later.

## v2 candidates (not built)

- Per-source custom extractors where reader mode falls short.
- "Catch me up" digest view of unread clusters since last visit.
- Push notifications for followed riders/races (needs a push service).
- Full-text search over the archive (SQLite FTS5).
- OPML import / user-managed sources in the UI instead of `sources.ts`.
- Simple password gate if exposed to the public internet.
