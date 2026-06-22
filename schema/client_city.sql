-- Add city to clients for service-area enrollment eligibility.
-- Populate from Square customer address locality during sync.

alter table clients add column if not exists city text;

create index if not exists clients_city_idx on clients (city) where city is not null;
