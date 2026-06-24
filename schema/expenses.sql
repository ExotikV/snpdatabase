-- Business expenses and reusable store profiles for the dashboard.
-- Safe to re-run in Supabase SQL Editor.

create table if not exists expense_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists expense_stores_name_lower_idx
  on expense_stores (lower(trim(name)));

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references expense_stores(id) on delete restrict,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  expense_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists expenses_store_id_idx on expenses (store_id);
create index if not exists expenses_expense_date_idx on expenses (expense_date desc);

comment on table expense_stores is 'Stores/vendors used when logging expenses';
comment on table expenses is 'Business expenses logged in the SNP dashboard';
