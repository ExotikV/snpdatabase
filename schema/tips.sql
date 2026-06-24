-- Tips logged from the dashboard, linked to a client and optional completed job.
-- Run in Supabase SQL Editor.

create table if not exists tips (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  detail_id uuid references details_completed(id) on delete set null,
  amount_cents integer not null check (amount_cents > 0),
  tipped_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists tips_client_id_idx on tips (client_id);
create index if not exists tips_tipped_at_idx on tips (tipped_at desc);
create index if not exists tips_detail_id_idx on tips (detail_id);

comment on table tips is 'Cash/card tips recorded in the SNP dashboard';
comment on column tips.detail_id is 'Optional link to details_completed row for the job that was tipped';
