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

## Local development

```bash
NOTION_TOKEN=secret_xxx npm run build
open public/index.html
```
