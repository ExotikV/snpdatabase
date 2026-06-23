-- Upcoming Square appointments synced from the Bookings API (cancelled rows are removed).
-- Run in Supabase SQL Editor.

create table if not exists square_appointments (
  id uuid primary key default gen_random_uuid(),
  square_booking_id text not null,
  client_id uuid references clients(id) on delete set null,
  square_customer_id text,
  start_at timestamptz not null,
  end_at timestamptz,
  status text not null,
  service_type text,
  duration_minutes integer,
  customer_note text,
  seller_note text,
  synced_at timestamptz not null default now()
);

create unique index if not exists square_appointments_square_booking_id_idx
  on square_appointments (square_booking_id);

create index if not exists square_appointments_start_at_idx
  on square_appointments (start_at);

comment on table square_appointments is 'Future/in-progress Square bookings; removed when cancelled or completed';
