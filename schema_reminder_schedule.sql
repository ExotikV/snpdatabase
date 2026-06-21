-- Run this in the Supabase SQL editor after schema_eligibility.sql

create table if not exists reminder_schedule (
  id uuid primary key default gen_random_uuid(),
  sequence_number integer not null,
  days_since_last_detail integer not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists reminder_schedule_sequence_number_idx
  on reminder_schedule (sequence_number);

insert into reminder_schedule (sequence_number, days_since_last_detail, active)
values
  (1, 30, true),
  (2, 44, true),
  (3, 51, true),
  (4, 59, true)
on conflict (sequence_number) do nothing;
