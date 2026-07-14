# Deploying Échappée to Vercel (phone-friendly guide)

Production architecture:

- **Vercel** — serves the PWA and the API (serverless), reads/writes **Neon Postgres**
  (added through Vercel's storage marketplace, free tier).
- **GitHub Actions** — runs the scraper every 30 minutes on a schedule and writes
  into the same database. This avoids serverless time limits and Hobby-plan cron
  restrictions entirely.

Everything below works from a phone browser. Total time: ~5–10 minutes.

## 1. Merge this branch to `main`

Scheduled GitHub workflows only run from the default branch, and Vercel deploys
production from it.

- Open the repo on GitHub → create a pull request for
  `claude/cycling-news-aggregator-rxgfpo` → **Merge**.

## 2. Create the Vercel project

1. Go to **vercel.com/new** (logged in) → *Import Git Repository* →
   pick `typewriter-muse-gallery`.
2. **Root Directory**: tap *Edit* and set it to `echappee`. ← the one setting
   that matters; build command and output directory come from `vercel.json`.
3. Tap **Deploy**. The first deploy will come up with an empty database —
   that's expected.

## 3. Add the database

1. In the Vercel project: **Storage** tab → **Create Database** → choose
   **Neon** (Postgres) → accept the defaults (free plan).
2. When asked to connect it to the project, do so for *All environments*.
   This injects `DATABASE_URL` automatically.
3. **Deployments** tab → ⋯ on the latest deployment → **Redeploy** (so the
   app picks up the new env var).
4. Copy the connection string for step 4: Storage → your database →
   `.env.local` / *Show secret* → copy the `DATABASE_URL` value
   (starts with `postgres://`).

## 4. Give the scraper its secrets

In the GitHub repo: **Settings → Secrets and variables → Actions →
New repository secret**:

| Name | Value |
| --- | --- |
| `ECHAPPEE_DATABASE_URL` | the `postgres://…` string from step 3 |
| `ECHAPPEE_LLM_API_KEY` | *(optional, later)* your DeepSeek API key |

## 5. First scrape

GitHub repo → **Actions** tab → *Échappée scraper* → **Run workflow**.
Watch it go green (~2–5 min), then open your `*.vercel.app` URL: the feed
should be full. From now on it re-scrapes automatically every 30 minutes.

On your phone, use the browser's **Add to Home Screen** — it installs as an
app.

## Adding AI later

Create an API key at platform.deepseek.com, add it as the
`ECHAPPEE_LLM_API_KEY` secret (step 4), and from the next scraper run new
articles get summaries, better categories and cross-language story
clustering. To use another provider, also set `LLM_BASE_URL` + `LLM_MODEL`
env vars in the workflow (any OpenAI-compatible API works).

## Troubleshooting

- **Feed empty after deploy** — did the scraper workflow run and pass?
  Actions tab shows per-source results in the "Scrape all sources" step.
- **A source shows an error in Settings** — its feed URL guess was wrong;
  fix it in `server/src/sources.ts` (the file documents the format).
- **"managed" refresh** — the in-app refresh button doesn't scrape on
  Vercel (functions would time out); scraping is the workflow's job.
- **Costs** — Vercel Hobby, Neon free tier and public-repo Actions minutes
  are all free at this usage level.
