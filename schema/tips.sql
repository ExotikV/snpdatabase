-- Tips logged from the dashboard, linked to a client and optional completed job.
-- Safe to re-run in Supabase SQL Editor.

create table if not exists tips (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  detail_id uuid,
  square_booking_id text,
  amount_cents integer not null check (amount_cents > 0),
  tipped_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

alter table tips add column if not exists detail_id uuid;
alter table tips add column if not exists square_booking_id text;

create index if not exists tips_client_id_idx on tips (client_id);
create index if not exists tips_tipped_at_idx on tips (tipped_at desc);
create index if not exists tips_detail_id_idx on tips (detail_id);

comment on table tips is 'Cash/card tips recorded in the SNP dashboard';
comment on column tips.detail_id is 'Optional link to details_completed.id for the job that was tipped';
comment on column tips.square_booking_id is 'Optional Square booking id for the tipped job';
