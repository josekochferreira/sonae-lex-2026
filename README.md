# Sonae LEX2026 — Dynamic Agenda

Generates a visual timeline agenda for the Sonae LEX2026 China trip from the
`LEX2026-agenda-db` Notion database, and publishes it to GitHub Pages on a
schedule so it stays in sync with Notion without any manual steps.

## How it works

- `scripts/render.mjs` turns normalized agenda rows into an HTML timeline:
  one column per day, events positioned and sized by their `Slot` time range,
  colored by event type (site visit / meal / transfer / hotel / other,
  inferred from the event title), with city and confirmation status shown as
  badges and border style.
- `scripts/build-agenda.mjs` queries the Notion database live via the Notion
  API and writes `public/index.html`.
- `.github/workflows/deploy-agenda.yml` runs the build every 3 hours (and on
  every push to `main`, and on demand), then publishes `public/` to GitHub
  Pages.

## One-time setup

1. **Create a Notion integration**: [notion.so/my-integrations](https://www.notion.so/my-integrations) →
   New integration → copy the "Internal Integration Secret".
2. **Share the database with it**: open the `LEX2026-agenda-db` database in
   Notion → `···` menu → Connections → add your integration.
3. **Add repo secrets** (Settings → Secrets and variables → Actions):
   - `NOTION_TOKEN` — the integration secret from step 1.
   - `NOTION_DATA_SOURCE_ID` — optional, only needed if the data source ID
     ever changes. Defaults to the current `LEX2026-agenda-db` data source.
4. **Enable GitHub Pages**: Settings → Pages → Source: "GitHub Actions".
5. Run the workflow once manually (Actions tab → "Build & Deploy Agenda" →
   Run workflow) or push to `main`.

## Also deployed to Vercel

The project is also connected to Vercel (`sonae-lex-2026.vercel.app`), which
runs the same `npm run build`. Vercel needs `NOTION_TOKEN` set in its own
project settings (Settings → Environment Variables). **Set it for every
environment (Production, Preview, Development)** — if it is scoped to
Production only, builds on any non-production branch fail with
"Missing NOTION_TOKEN".

Vercel redeploys on every push to the production branch via its Git
integration, and the refresh button pulls live data through `/api/agenda`, so
no scheduled deploy hook is needed. For everything to line up, set the Vercel
**Production Branch** (Settings → Git) and the GitHub **default branch** to the
same branch you deploy from.

## Refresh button (live, on Vercel)

The header's refresh button calls `GET /api/agenda` (`api/agenda.js`), a Vercel
serverless function that queries Notion live and returns the rendered agenda as
JSON. The client swaps it into the page instantly — no rebuild. It reuses the
same `NOTION_TOKEN` env var the build uses, so no extra setup is required.

On a static host without the function (e.g. GitHub Pages), the button falls
back to a plain page reload.

## Local development

```bash
NOTION_TOKEN=secret_xxx npm run build
open public/index.html
```
