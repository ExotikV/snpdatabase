-- Run this in the Supabase SQL editor after schema.sql (step one)

create table if not exists maintenance_enrollment (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete restrict,
  enrolled_at timestamptz not null default now(),
  program_tier text,
  active boolean not null default true
);

create table if not exists sms_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete restrict,
  trigger_type text not null,
  sent_at timestamptz,
  status text not null default 'pending',
  converted boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists maintenance_enrollment_client_id_idx
  on maintenance_enrollment (client_id);

create index if not exists sms_log_client_trigger_created_idx
  on sms_log (client_id, trigger_type, created_at);
