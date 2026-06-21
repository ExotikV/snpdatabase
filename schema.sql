-- Run this in the Supabase SQL editor before running pull.js

create extension if not exists "pgcrypto";

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  square_customer_id text not null unique,
  phone text,
  name text,
  email text,
  sms_consent boolean not null default false,
  opted_out boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists details_completed (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete restrict,
  square_booking_id text not null unique,
  service_type text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists details_completed_client_id_idx
  on details_completed (client_id);
