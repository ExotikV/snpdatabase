# SNP Maintenance SMS Dashboard

Internal dashboard and Netlify functions for **maintenance detail reminders** — configurable day-based SMS sequences, Twilio delivery, and conversion tracking (website, QR code, SMS reminder).

## How it works

1. Every client (except opted-out) is automatically on an SMS track — no manual enrollment.
2. **Maintenance track**: service-area city + last detail within 60 days → maintenance reminder sequence.
3. **General track**: everyone else → separate configurable sequence.
4. After their last completed detail (or account creation if no detail yet), reminders fire on the schedule for their track.
5. Each SMS includes a tracked booking URL with `source=sms_reminder` or `source=general_reminder`.
6. When someone books, your website writes to `booking_attempts` with the matching `source` and `ref`.
7. The scheduled function matches conversions and marks `sms_log.converted = true`.

## Setup

### 1. Supabase migration

Run `schema/message_body.sql`, `schema/client_city.sql`, and `schema/reminder_schedule_track.sql` in the Supabase SQL Editor.

### 2. Environment variables

Copy `.env.example` to `.env` locally. In Netlify → Site configuration → Environment variables, set:

| Variable | Required |
|----------|----------|
| `SUPABASE_URL` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `SQUARE_ACCESS_TOKEN` | Yes |
| `SQUARE_ENVIRONMENT` | Yes (`production` or `sandbox`) |
| `TWILIO_ACCOUNT_SID` | Yes |
| `TWILIO_AUTH_TOKEN` | Yes |
| `TWILIO_PHONE_NUMBER` | Yes |
| `BOOKING_WEBSITE_DOMAIN` | Yes (e.g. `www.snpdetailing.ca`) |
| `SMS_TEST_MODE` | Optional (`true` routes all SMS to test number) |
| `SMS_TEST_PHONE_NUMBER` | Optional |

### 3. Install & run locally

```bash
npm install
npm run dashboard:install
npm run dev
```

Open http://localhost:8888

### 4. Deploy to Netlify

Connect this repo. Root `netlify.toml` builds the Vite dashboard and deploys functions.

- **Scheduled reminders**: `scheduled-reminders` runs every hour — syncs customer cities from Square, then sends due SMS
- **Scheduled Square sync**: `scheduled-square-sync` runs daily at 6:00 UTC — full customer + completed booking pull
- **Manual sync**: Enrollments → **Sync from Square**, or `npm run sync` locally

## Square sync

Customer **city** comes from the Square customer address (`locality` field). The sync also refreshes completed bookings into `details_completed` (used for “days since last detail”).

```bash
npm run sync              # full sync (customers + completed bookings)
npm run sync:customers    # customers/cities only (faster)
```

On the **Clients** page, click **Sync from Square** to pull the latest data. Manual city edits remain available if a Square profile has no address.

## SMS tracks

| Track | Who | Schedule tab |
|-------|-----|--------------|
| **Maintenance** | Service-area cities only + detail within last 60 days | Maintenance sequence |
| **General** | Regular detail — **all cities**, no location limit | General sequence |

## Service area (maintenance track only)

The city list in `lib/service-area.js` applies **only** to maintenance-detail reminders. General regular-detail reminders are sent to clients in any city.

## Dashboard pages

- **Overview** — booking source breakdown, trend chart, SMS conversion stats, recent bookings
- **Reminder schedule** — edit maintenance and general sequences separately
- **Clients** — view SMS track per client, sync cities from Square
- **Send now** — manually trigger reminders for eligible clients
- **SMS log** — sent/failed/converted history

## Booking source values (website must send these)

| `source` value | Meaning |
|----------------|---------|
| `direct` | Website booking (no tracking ref) |
| `qr_maintenance` | QR code — maintenance (`/book?source=qr_maintenance`) |
| `qr_general` | QR code — general detailing (`/book?source=qr_general`) |
| `qr_code` | Legacy single QR source (older bookings) |
| `sms_reminder` | Booking from maintenance SMS link (`ref` = `sms_log.id`) |
| `general_reminder` | Booking from general SMS link (`ref` = `sms_log.id`) |

## Message variables

`{first_name}`, `{name}`, `{service}`, `{last_detail_date}`, `{days_since}`, `{booking_url}`
