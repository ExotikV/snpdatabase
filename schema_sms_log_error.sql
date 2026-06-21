-- Run this in the Supabase SQL editor before send_reminders.js (step three)

alter table sms_log
  add column if not exists error_message text;
