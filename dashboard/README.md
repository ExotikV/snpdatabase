# SNP SMS Dashboard

Next.js site deployed as the **main Netlify website** for the snpdatabase repo. Includes the admin UI and hooks into backend scripts at the repo root for nightly sync.

See the [root README](../README.md) for full Netlify deployment, env vars, and backend docs.

## Run locally

```bash
# from repo root
npm run dashboard:install
npm run dashboard:dev
```

Copy `.env.local.example` → `.env.local`.

## What runs on Netlify

| Piece | How |
|-------|-----|
| Dashboard UI | Next.js (`/`, `/sms-log`, `/manual-trigger`, etc.) |
| Nightly backend | Scheduled function → `POST /api/cron/daily-sync` → `daily-sync.js` at repo root |

## Env vars

Same as `.env.local.example`. On Netlify, also set `SQUARE_*` and `CRON_SECRET` for the nightly job.
