-- Optional one-time fix: set maintenance step 1 to 1 day if it was saved higher.
-- Schedule steps have no minimum in the app — use only if you want step 1 at 1 day.

update reminder_schedule
set days_since_last_detail = 1
where track = 'maintenance'
  and sequence_number = 1
  and days_since_last_detail > 1;
