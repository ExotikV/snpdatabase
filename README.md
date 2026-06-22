# SNP Maintenance SMS Dashboard

Internal dashboard and Netlify functions for **maintenance detail reminders** — configurable day-based SMS sequences, Twilio delivery, and conversion tracking (website, QR code, SMS reminder).

## How it works

1. Clients are enrolled in `maintenance_enrollment` (maintenance program).
2. After their last completed detail (`details_completed`), reminders fire on your configured schedule (e.g. day 30, 44, 51, 59 — all before the 60-day full-price cutoff).
3. Each SMS includes a tracked booking URL: `https://your-site/book?ref={sms_log_id}&source=sms_reminder`
4. When someone books, your website writes to `booking_attempts` with `source` (`direct`, `qr_code`, or `sms_reminder`) and `ref` (for SMS conversions).
5. The scheduled function matches conversions and marks `sms_log.converted = true`.

## Setup

### 1. Supabase migration

Run `schema/message_body.sql` and `schema/client_city.sql` in the Supabase SQL Editor.

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

On the **Enrollments** page, click **Sync from Square** to pull the latest data. Manual city edits remain available if a Square profile has no address.

## Service area (enrollment eligibility)

Only clients whose city matches one of the configured service-area cities may enroll. Cities are populated automatically from Square; use manual edits only as a fallback.

City matching is accent-insensitive and handles common variants (e.g. Saint/St, apostrophes).

## Dashboard pages

- **Overview** — booking source breakdown, trend chart, SMS conversion stats, recent bookings
- **Reminder schedule** — edit days + fully customizable message templates with variables
- **Enrollments** — sync cities from Square, enroll/unenroll (blocked if city not in service area)
- **Send now** — manually trigger reminders for eligible clients
- **SMS log** — sent/failed/converted history

## Booking source values (website must send these)

| `source` value | Meaning |
|----------------|---------|
| `direct` | Website booking (no tracking ref) |
| `qr_code` | QR code maintenance booking |
| `sms_reminder` | Booking from SMS link (`ref` = `sms_log.id`) |

## Message variables

`{first_name}`, `{name}`, `{service}`, `{last_detail_date}`, `{days_since}`, `{booking_url}`
