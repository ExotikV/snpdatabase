-- General reminder timing: first step at 60 days (90 for service-area clients who missed maintenance).
-- Run in Supabase SQL Editor if you already applied reminder_schedule_track.sql with the old 30/60/90 defaults.

update reminder_schedule
set days_since_last_detail = 60
where track = 'general'
  and sequence_number = 1
  and days_since_last_detail < 60;

update reminder_schedule
set days_since_last_detail = 90
where track = 'general'
  and sequence_number = 2
  and days_since_last_detail < 90;

update reminder_schedule
set days_since_last_detail = 120
where track = 'general'
  and sequence_number = 3
  and days_since_last_detail < 120;
