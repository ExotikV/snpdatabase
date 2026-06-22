-- Run this in the Supabase SQL editor after schema_eligibility.sql

create table if not exists reminder_schedule (
  id uuid primary key default gen_random_uuid(),
  sequence_number integer not null,
  days_since_last_detail integer not null,
  active boolean not null default true,
  message_body text not null default 'Hi {name}, it''s time to book your next maintenance detail with SNP Detailing. Your last {service} was on {last_detail_date} ({days_since} days ago). Book here: {booking_url}',
  created_at timestamptz not null default now()
);

create unique index if not exists reminder_schedule_sequence_number_idx
  on reminder_schedule (sequence_number);

insert into reminder_schedule (sequence_number, days_since_last_detail, active, message_body)
values
  (
    1,
    30,
    true,
    'Hi {name}, hope you''re still enjoying your {service} from {last_detail_date}. When you''re ready for your next SNP Detailing visit, book here: {booking_url}'
  ),
  (
    2,
    44,
    true,
    'Hi {name}, it''s been {days_since} days since your {service} on {last_detail_date}. Time to book your next maintenance detail: {booking_url}'
  ),
  (
    3,
    51,
    true,
    'Hi {name}, your vehicle is due for maintenance ({days_since} days since your last {service}). Reserve your spot: {booking_url}'
  ),
  (
    4,
    59,
    true,
    'Hi {name}, last reminder from SNP Detailing — please book your next detail soon ({days_since} days since {last_detail_date}): {booking_url}'
  )
on conflict (sequence_number) do nothing;
