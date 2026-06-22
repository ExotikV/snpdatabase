-- Separate maintenance vs general SMS reminder sequences.
-- Run the entire file in Supabase SQL Editor.

alter table reminder_schedule
  add column if not exists track text not null default 'maintenance';

update reminder_schedule
set track = 'maintenance'
where track is null or trim(track) = '';

alter table reminder_schedule
  drop constraint if exists reminder_schedule_track_check;

alter table reminder_schedule
  add constraint reminder_schedule_track_check
  check (track in ('maintenance', 'general', 'general_after_maintenance'));

drop index if exists reminder_schedule_sequence_number_idx;

create unique index if not exists reminder_schedule_track_sequence_idx
  on reminder_schedule (track, sequence_number);

-- Default general sequence (customize in dashboard)
insert into reminder_schedule (track, sequence_number, days_since_last_detail, active, message_body)
select 'general', 1, 60, true,
  'Hi {first_name}, it''s been a while since your last visit with SNP Detailing. Book your next detail here: {booking_url}'
where not exists (
  select 1 from reminder_schedule where track = 'general' and sequence_number = 1
);

insert into reminder_schedule (track, sequence_number, days_since_last_detail, active, message_body)
select 'general', 2, 90, true,
  'Hi {first_name}, we''d love to see you again - book your SNP Detailing appointment: {booking_url}'
where not exists (
  select 1 from reminder_schedule where track = 'general' and sequence_number = 2
);

insert into reminder_schedule (track, sequence_number, days_since_last_detail, active, message_body)
select 'general', 3, 120, true,
  'Hi {first_name}, last note from SNP Detailing - reserve your spot when you''re ready: {booking_url}'
where not exists (
  select 1 from reminder_schedule where track = 'general' and sequence_number = 3
);
