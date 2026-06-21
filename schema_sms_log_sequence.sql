-- Run this in the Supabase SQL editor after schema_reminder_schedule.sql

alter table sms_log
  add column if not exists sequence_number integer;
