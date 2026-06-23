# SNP Maintenance SMS Dashboard

Internal dashboard and Netlify functions for **maintenance detail reminders** — configurable day-based SMS sequences, Twilio delivery, and conversion tracking (website, QR code, SMS reminder).

## How it works

1. Automated SMS (maintenance, general, after-maintenance) requires **at least one completed appointment** synced from Square.
2. **Maintenance track**: service-area city + last detail within 60 days → maintenance reminder sequence (first step **1 day** after the detail ends). Paused while they have an upcoming Square booking.
3. **General track**: everyone else with a completed detail → separate configurable sequence.
4. **Phone / Square bookings** (call-ins entered in Square) sync as `manual_square` in booking attempts — separate from website bookings.
5. After their last completed detail (or account creation if no detail yet), reminders fire on the schedule for their track unless they have an upcoming appointment or recently cancelled one.
6. Each SMS includes a tracked booking URL with `source=sms_reminder` or `source=general_reminder`.
7. When someone books on the website, your site writes to `booking_attempts` with the matching `source` and `ref`.
8. The scheduled function matches conversions and marks `sms_log.converted = true`.

## Setup

### 1. Supabase migration

Run `schema/message_body.sql`, `schema/client_city.sql`, `schema/reminder_schedule_track.sql`, and `schema/square_appointments.sql` in the Supabase SQL Editor.

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

Customer **city** comes from the Square customer address (`locality` field). Appointment sync runs **every 15 minutes** (and on each Appointments page load): upcoming bookings are stored in `square_appointments`, completed details in `details_completed`. Cancellations remove upcoming rows and any mistaken completed rows; reschedules update times in place via the Square booking ID.

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
| `sms_reminder` | Booking from maintenance SMS link (`ref` = short code or `sms_log.id`) |
| `general_reminder` | Booking from general SMS link (`ref` = `sms_log.id`) |

## Message variables

`{first_name}`, `{name}`, `{service}`, `{last_detail_date}`, `{days_since}`, `{booking_url}`
