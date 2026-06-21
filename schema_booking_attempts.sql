-- Run this in the Supabase SQL editor before match_conversions.js
-- booking_attempts is written by your main website booking flow (separate repo), not this project.

create table if not exists booking_attempts (
  id uuid primary key default gen_random_uuid(),
  ref uuid,
  source text,
  square_customer_id text,
  phone text,
  booked_at timestamptz not null default now(),
  processed boolean not null default false,
  raw_note text
);

-- Idempotent column adds if the table was created earlier without every column.
alter table booking_attempts add column if not exists ref uuid;
alter table booking_attempts add column if not exists source text;
alter table booking_attempts add column if not exists square_customer_id text;
alter table booking_attempts add column if not exists phone text;
alter table booking_attempts add column if not exists booked_at timestamptz not null default now();
alter table booking_attempts add column if not exists processed boolean not null default false;
alter table booking_attempts add column if not exists raw_note text;

update booking_attempts set source = 'direct' where source is null;

alter table booking_attempts alter column source set not null;

create index if not exists booking_attempts_processed_idx
  on booking_attempts (processed)
  where processed = false;

create index if not exists booking_attempts_ref_idx
  on booking_attempts (ref)
  where ref is not null;
