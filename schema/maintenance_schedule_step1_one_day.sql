-- Set maintenance step 1 to 1 day after a completed detail (service-area clients only).
-- Run in Supabase SQL Editor.

update reminder_schedule
set days_since_last_detail = 1
where track = 'maintenance'
  and sequence_number = 1;
