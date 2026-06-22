-- Revenue attribution for bookings (especially SMS reminder links).
-- Run in Supabase SQL Editor.

alter table booking_attempts
  add column if not exists square_booking_id text,
  add column if not exists booked_revenue_cents integer,
  add column if not exists actual_revenue_cents integer,
  add column if not exists revenue_status text not null default 'booked',
  add column if not exists revenue_realized_at timestamptz;

create unique index if not exists booking_attempts_square_booking_id_idx
  on booking_attempts (square_booking_id)
  where square_booking_id is not null;

alter table booking_attempts
  drop constraint if exists booking_attempts_revenue_status_check;

alter table booking_attempts
  add constraint booking_attempts_revenue_status_check
  check (revenue_status in ('booked', 'realized', 'cancelled'));

comment on column booking_attempts.booked_revenue_cents is 'Quoted/checkout total when the customer booked (website writes this)';
comment on column booking_attempts.actual_revenue_cents is 'Counted only after Square detail is in the past and not cancelled';
comment on column booking_attempts.revenue_status is 'booked=future/open, realized=completed detail, cancelled=Square cancelled/no-show/deleted';
