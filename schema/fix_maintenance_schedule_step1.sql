-- Optional one-time fix: set maintenance step 1 to 30 days if it was saved too low.
-- Schedule steps have no minimum in the app — use only if you want step 1 at 30.

update reminder_schedule
set days_since_last_detail = 30
where track = 'maintenance'
  and sequence_number = 1
  and days_since_last_detail < 30;
