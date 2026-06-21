# SNP Square Sync

Square → Supabase data sync and maintenance reminder eligibility for a mobile detailing SMS system.

## Prerequisites

- Node.js 18 or later
- A Supabase project
- A Square Developer application with access to the Customers API and Bookings API (for step one only)
- Square access token with seller permissions (`CUSTOMERS_READ`, `APPOINTMENTS_ALL_READ`, `APPOINTMENTS_READ`, and catalog read access for service names)

## Install

```bash
npm install
```

## Configure environment variables

Copy the placeholders in `.env` and replace them with your real values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SQUARE_ACCESS_TOKEN=your_square_access_token
SQUARE_ENVIRONMENT=production
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+10000000000
```

Where to find them:

- **Supabase URL** and **service role key**: Supabase dashboard → Project Settings → API
- **Square access token**: Square Developer Dashboard → your application → Credentials
- **SQUARE_ENVIRONMENT**: use `production` for live data (use `sandbox` only if testing against Square's sandbox)

Use the service role key only in trusted backend scripts like this one. Do not expose it in a browser app.

---

## Step one: Square data pull

### Create the Supabase tables

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Open `schema.sql` from this project.
4. Paste the SQL into the editor and run it.

That creates:

- `clients` — one row per Square customer
- `details_completed` — one row per past completed Square booking

Both tables use unique Square IDs so rerunning the sync updates existing rows instead of creating duplicates.

### Run the pull script

```bash
npm run pull
```

Or:

```bash
node pull.js
```

The script will:

1. Fetch all Square customers and upsert them into `clients`
2. Fetch past bookings from the last 365 days in 31-day windows (Square API limit)
3. Keep only bookings whose `start_at` is in the past and whose status is `ACCEPTED`
4. Resolve service names from Square Catalog when possible
5. Upsert those bookings into `details_completed`

### Important note about booking status

Square does **not** expose a `COMPLETED` booking status. The statuses are:

`PENDING`, `ACCEPTED`, `CANCELLED_BY_CUSTOMER`, `CANCELLED_BY_SELLER`, `DECLINED`, `NO_SHOW`

This script treats a detail as completed when:

- the booking start time is in the past, and
- the status is `ACCEPTED`

If your workflow uses a different rule, update the filter in `pull.js`.

### Confirm the pull worked in Supabase

After the script finishes, open **Table Editor** in Supabase and check:

#### `clients`

- Rows exist for your Square customers
- `square_customer_id` is populated and unique
- `phone`, `name`, and `email` match what you expect from Square
- `sms_consent` and `opted_out` default to `false` until you manage them later

#### `details_completed`

- Rows exist for past appointments
- `square_booking_id` is populated and unique
- `client_id` links to the correct row in `clients`
- `service_type` shows the catalog service name when Square returned it
- `completed_at` matches the booking start time from Square

Also review the terminal summary:

- `Clients processed`
- `Bookings processed`
- Any per-record errors (one bad record does not stop the run)

### Safe to rerun

You can run `npm run pull` as often as you like. Upserts match on:

- `clients.square_customer_id`
- `details_completed.square_booking_id`

Existing consent/opt-out flags on clients are not overwritten because those columns are omitted from the upsert payload.

---

## Step two: Maintenance reminder eligibility

### Create the eligibility tables

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Open `schema_eligibility.sql` from this project.
4. Paste the SQL into the editor and run it.

That creates:

- `maintenance_enrollment` — clients actively enrolled in the maintenance program
- `sms_log` — SMS send history (empty for now; used to avoid duplicate reminders)

### Create the reminder schedule table

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Open `schema_reminder_schedule.sql` from this project.
4. Paste the SQL into the editor and run it.

That creates:

- `reminder_schedule` — ordered steps in the maintenance reminder sequence (days after last detail for each SMS)

Default seed data (four steps):

| Step | Days since last detail |
|------|------------------------|
| 1 | 30 |
| 2 | 44 |
| 3 | 51 |
| 4 | 59 |

Each step fires once per detail cycle. A client moves to the next step only after the previous step's SMS has been logged (`sent` or `pending`).

### Add sequence tracking to sms_log

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Open `schema_sms_log_sequence.sql` from this project.
4. Paste the SQL into the editor and run it.

That adds `sequence_number` (nullable integer) to `sms_log` so each reminder records which schedule step it was for.

### How the reminder schedule works

`reminder_schedule` defines a multi-step SMS cadence. Each row is one step:

- `sequence_number` — order in the sequence (1, 2, 3, …)
- `days_since_last_detail` — how many days after the client's **most recent completed detail** that step becomes due
- `active` — set to `false` to disable a step without deleting it

**Adjusting timing (until the dashboard exists):** open **Table Editor** → `reminder_schedule` in Supabase and edit `days_since_last_detail` on any row. Changes take effect on the next eligibility run — no code deploy needed. You can also toggle `active` to skip a step.

**Cycle reset on new detail:** eligibility always uses the client's latest `details_completed.completed_at`. When they book again and `pull.js` syncs a newer detail, the cycle restarts at step 1. Only `sms_log` rows with `created_at` **after** that detail count toward the current cycle; older reminders belong to previous cycles and are ignored.

**Next step logic:** for each client, the script finds the highest `sequence_number` already logged this cycle (`sent` or `pending`), then checks whether they are due for the **next** step (`highest + 1`). A client is eligible when today's date is on or after `last_detail_date + that step's days_since_last_detail`, and they have not already received that step number in the current cycle. Failed sends (`status = failed`) do not advance the sequence, so the same step can be retried.

### Enroll a client for testing

Pick a `client_id` from the `clients` table, then run something like this in the SQL editor:

```sql
INSERT INTO maintenance_enrollment (client_id, program_tier, active)
VALUES (
  '00000000-0000-0000-0000-000000000000',  -- replace with a real clients.id
  NULL,
  true
);
```

To enroll the first client in your table automatically:

```sql
INSERT INTO maintenance_enrollment (client_id)
SELECT id FROM clients
LIMIT 1;
```

For a client to show up as eligible, they also need:

- `opted_out = false` on `clients`
- at least one row in `details_completed`
- to be due for the next step in `reminder_schedule` (see above)

### Run the eligibility check

```bash
npm run check-eligibility
```

Or:

```bash
node check_eligibility.js
```

The script reads from Supabase only. It does **not** send SMS or write to `sms_log`.

A client is eligible when:

1. They have an active row in `maintenance_enrollment`
2. They are not opted out
3. They have at least one completed detail in `details_completed`
4. They are due for the next `sequence_number` in the active reminder schedule (days since last detail ≥ that step's threshold)
5. They have not already received that `sequence_number` in the current detail cycle (no `sms_log` row with that step, `created_at` after their latest detail, and `status` of `sent` or `pending`)

Output includes each eligible client's name, phone, last detail date, days since last detail, and which schedule step they are due for, plus a final count:

`X clients eligible for maintenance reminder`

---

## Step three: Send maintenance reminder SMS

### Add the sms_log error column

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Open `schema_sms_log_error.sql` from this project.
4. Paste the SQL into the editor and run it.

That adds `error_message` (nullable text) to `sms_log` for failed send details.

### Set up Twilio environment variables

Add these to your `.env` file:

```env
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+15551234567
```

Where to find them:

- **Account SID** and **Auth Token**: [Twilio Console](https://console.twilio.com/) → Account Info
- **Phone number**: Twilio Console → Phone Numbers → your sending number (E.164 format, e.g. `+15551234567`)

### TEST_MODE (safe testing)

`send_reminders.js` has a `TEST_MODE` flag at the top (default: `true`).

When `TEST_MODE` is `true`:

- The script still runs the real eligibility query
- It still inserts and updates real `sms_log` rows in Supabase
- **All SMS are sent to `TEST_PHONE_NUMBER`** instead of each client's phone

Before your first test run:

1. Set `TEST_PHONE_NUMBER` in `send_reminders.js` to your own mobile number
2. Confirm `TEST_MODE = true`
3. Run the script and verify you receive the test message

When you are ready to text real clients:

1. Set `TEST_MODE = false` in `send_reminders.js`
2. Double-check your Twilio number and message template
3. Run the script again

### Run the send script

```bash
npm run send-reminders
```

Or:

```bash
node send_reminders.js
```

For each eligible client, the script:

1. Inserts an `sms_log` row with `status = 'pending'` and `sequence_number` set to the due schedule step
2. Sends the SMS via Twilio using `buildMaintenanceReminderMessage(clientName, smsLogId)` from `message-templates.js`
3. On success: updates the row to `status = 'sent'` and sets `sent_at`
4. On failure: updates the row to `status = 'failed'` and stores the Twilio error in `error_message`

Clients are processed one at a time with a 300ms delay between sends. One failure does not stop the run.

At the end you get a summary: total eligible, sent successfully, failed, plus a list of failed clients by name.

### Confirm sends in Supabase

After running, open **Table Editor** → `sms_log` and check:

- New rows with `trigger_type = 'maintenance_reminder'`
- `sequence_number` shows which schedule step the reminder was for (1–4 by default)
- Successful sends: `status = 'sent'`, `sent_at` populated, `error_message` empty
- Failed sends: `status = 'failed'`, `sent_at` null, `error_message` contains the Twilio error
- Pending rows (if a run was interrupted mid-send): `status = 'pending'`, `sent_at` null

To change the message wording or booking link, edit `message-templates.js` only.

---

## Step four: Tracked booking links and conversion matching

### Tracked SMS booking links

Each maintenance reminder SMS includes a unique booking URL built in `message-templates.js`:

```
https://[YOUR_DOMAIN]/book?ref={smsLogId}&source=sms_reminder
```

Before sending real messages:

1. Open `message-templates.js`
2. Replace `BOOKING_WEBSITE_DOMAIN` with your real domain (e.g. `www.detailingsnp.com`)
3. Update the message wording in the same file when you're ready

`send_reminders.js` creates the `sms_log` row first, then passes that row's `id` into the message builder. This works the same in `TEST_MODE` — the link always contains the real `sms_log` id even when the SMS is redirected to your test phone.

Your main website booking flow (separate repo) should read `ref` and `source` from the URL when someone lands from an SMS, then write a row to `booking_attempts` with `source = 'sms_reminder'` and `ref` set to that UUID.

### Create the booking_attempts table

1. Open your Supabase project.
2. Go to **SQL Editor**.
3. Open `schema_booking_attempts.sql` from this project.
4. Paste the SQL into the editor and run it.

If the table already exists but is missing columns (especially `source`), run `schema_booking_attempts_fix.sql` instead.

This project **reads** from `booking_attempts` and may set `processed = true` after matching. Your website INSERTs new rows only.

### Diagnose empty or broken booking_attempts

```bash
npm run diagnose-booking-attempts
```

This prints:

- Which Supabase project this repo is using (`SUPABASE_URL` must match the website)
- Total row count and unprocessed count
- Whether required columns exist (`source` is required)
- Recent rows by `booked_at`

**Common root cause:** `booking_attempts` exists but was created without a `source` column. That breaks both `match_conversions.js` and website INSERTs. Run `schema_booking_attempts_fix.sql` in Supabase.

Required env vars for matching (same as the rest of this repo):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Three booking sources

| Source | Who writes it | Where on the website | `ref` value |
|--------|---------------|----------------------|-------------|
| `sms_reminder` | Main website booking flow | Booking page someone lands on after clicking the SMS link (`/book?ref=...&source=sms_reminder`) | `sms_log.id` from the URL |
| `qr_code` | Main website booking flow | Booking page linked from the QR code on a physical maintenance card (returning clients, no SMS) | `null` |
| `direct` | Main website booking flow | Normal booking flow with no program link or QR involved | `null` |

- **sms_reminder** — client clicked the tracked link in a maintenance SMS. `match_conversions.js` marks the matching `sms_log` row as `converted = true`.
- **qr_code** — returning maintenance-program client scanned their card. No SMS was sent, so there is no `sms_log` row to match. The script counts these but does not update `sms_log`.
- **direct** — ordinary booking with no maintenance-program tracking. Logged for visibility only.

### Run conversion matching

After your website has written new rows to `booking_attempts`:

```bash
npm run match-conversions
```

Or:

```bash
node match_conversions.js
```

The script:

1. Reads all `booking_attempts` rows where `processed = false`
2. For `sms_reminder` rows with a `ref`: looks up `sms_log` by id and sets `converted = true` if found
3. For `sms_reminder` rows with a missing or unmatched `ref`: flags as orphaned (likely a bug)
4. For `qr_code` rows: counts as maintenance-program QR bookings (no `sms_log` update)
5. For `direct` rows: counts as regular bookings (no further action)
6. Marks each row `processed = true` once handled

Summary output is broken out by source: converted, orphaned refs, QR bookings, direct bookings.

**Per source (daily matcher behavior):**

| Source | Action |
|--------|--------|
| `sms_reminder` | Match `ref` → `sms_log.id`, set `sms_log.converted = true`, then `processed = true` |
| `qr_code` | Count as maintenance-card QR booking (log phone/customer if present), `processed = true` — no `sms_log` update |
| `direct` | Count as normal website booking (log phone/customer if present), `processed = true` — no `sms_log` update |

### Daily GitHub Actions workflow

The repo includes `.github/workflows/daily-sync.yml`, which runs all three backend scripts in order:

1. `pull.js` — sync Square customers and bookings into Supabase
2. `send_reminders.js` — check eligibility and send maintenance SMS
3. `match_conversions.js` — match new bookings back to `sms_log`

**Schedule:** daily at 10pm Eastern (see the cron comment in the workflow file for UTC conversion and DST notes).

**Manual run:** the workflow also supports `workflow_dispatch` so you can trigger it from the Actions tab without waiting for the schedule.

#### Required GitHub Actions secrets

Confirm these already exist under **Settings → Secrets and variables → Actions** in your GitHub repo (names must match exactly):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`

#### First-time setup and manual test

1. Commit and push `.github/workflows/daily-sync.yml` to GitHub.
2. Open your repo on GitHub and go to the **Actions** tab.
3. Select **daily-sync** in the left sidebar.
4. Click **Run workflow**, then **Run workflow** again to start a manual run.
5. Open the run and confirm all three steps complete successfully.

While `TEST_MODE = true` in `send_reminders.js`, scheduled and manual runs only send SMS to the hardcoded test phone number — not real clients.

---

## What is not included yet

- Dashboard UI
- Automatic sync beyond the daily GitHub Actions workflow (manual script runs still work locally)

