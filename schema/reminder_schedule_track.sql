-- Separate maintenance vs general SMS reminder sequences.

alter table reminder_schedule
  add column if not exists track text not null default 'maintenance';

update reminder_schedule
set track = 'maintenance'
where track is null or trim(track) = '';

alter table reminder_schedule
  drop constraint if exists reminder_schedule_track_check;

alter table reminder_schedule
  add constraint reminder_schedule_track_check
  check (track in ('maintenance', 'general'));

drop index if exists reminder_schedule_sequence_number_idx;

create unique index if not exists reminder_schedule_track_sequence_idx
  on reminder_schedule (track, sequence_number);

-- Default general sequence (customize in dashboard)
insert into reminder_schedule (track, sequence_number, days_since_last_detail, active, message_body)
values
  (
    'general',
    1,
    30,
    true,
    'Hi {first_name}, it''s been a while since your last visit with SNP Detailing. Book your next detail here: {booking_url}'
  ),
  (
    'general',
    2,
    60,
    true,
    'Hi {first_name}, we''d love to see you again — book your SNP Detailing appointment: {booking_url}'
  ),
  (
    'general',
    3,
    90,
    true,
    'Hi {first_name}, last note from SNP Detailing — reserve your spot when you''re ready: {booking_url}'
  )
on conflict (track, sequence_number) do nothing;
