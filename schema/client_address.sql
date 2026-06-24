-- Full service address from Square customer profile (street, city, province, postal).
-- Safe to re-run in Supabase SQL Editor.

alter table clients add column if not exists address text;

comment on column clients.address is 'Formatted service address from Square (address line, city, province, postal)';
