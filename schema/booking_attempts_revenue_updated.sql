-- Track when booking revenue status last changed (cancel / realize).
-- Used to pause automated SMS for 30 days after a Square cancellation.

alter table booking_attempts
  add column if not exists revenue_updated_at timestamptz;

comment on column booking_attempts.revenue_updated_at is
  'Last time revenue_status changed (cancelled or realized)';

update booking_attempts
set revenue_updated_at = coalesce(revenue_realized_at, booked_at, now())
where revenue_updated_at is null
  and revenue_status in ('cancelled', 'realized');
