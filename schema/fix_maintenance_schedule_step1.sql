-- Maintenance step 1 must be 30 days (maintenance window starts at day 30).
-- Automated sends also enforce this in code, but fix the saved schedule too.

update reminder_schedule
set days_since_last_detail = 30
where track = 'maintenance'
  and sequence_number = 1
  and days_since_last_detail < 30;
