# SNP SMS Dashboard

Next.js admin UI for the SNP maintenance reminder system. Lives in this repo under `dashboard/` alongside the backend scripts at the repo root.

## Run locally

From the **repo root**:

```bash
npm run dashboard:install   # first time only
npm run dashboard:dev
```

Or from this folder:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.local.example` to `.env.local` and fill in values. Use the same Supabase project as the backend `.env` at the repo root.

## Deploy (Netlify)

1. Connect this **snpdatabase** GitHub repo to Netlify.
2. Set **Base directory** to `dashboard`.
3. Add the same env vars as `.env.local` under Site configuration → Environment variables.
4. Deploy.

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Overview stats |
| `/sms-log` | SMS history |
| `/manual-trigger` | Eligibility check + send reminders |
| `/bulk-send` | Manual SMS blast |
| `/settings/reminder-schedule` | Cadence + customizable SMS per step |

Backend scripts (`pull.js`, `send_reminders.js`, etc.) are documented in the [root README](../README.md).
