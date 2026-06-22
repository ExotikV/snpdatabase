-- Reset dashboard tracking (SMS stats, QR stats, booking attribution, revenue).
-- Does NOT delete clients, details_completed, or reminder schedules.
-- After running: set QR_CONVERSION_START_DATE in lib/qr-stats.js to today's date.

-- All website booking attribution (direct, SMS ref, QR, revenue fields)
DELETE FROM booking_attempts;

-- All outbound SMS log rows (reminders, manual bulk, test sends)
DELETE FROM sms_log;
