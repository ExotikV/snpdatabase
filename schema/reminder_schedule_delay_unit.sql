-- Per-step delay unit: hours or days after last detail.
-- Run in Supabase SQL Editor.

alter table reminder_schedule
  add column if not exists delay_unit text not null default 'days';

update reminder_schedule
set delay_unit = 'days'
where delay_unit is null or trim(delay_unit) = '';

alter table reminder_schedule
  drop constraint if exists reminder_schedule_delay_unit_check;

alter table reminder_schedule
  add constraint reminder_schedule_delay_unit_check
  check (delay_unit in ('hours', 'days'));

comment on column reminder_schedule.delay_unit is 'Whether days_since_last_detail is measured in hours or calendar days';
comment on column reminder_schedule.days_since_last_detail is 'Delay amount after last detail (hours or days per delay_unit)';
