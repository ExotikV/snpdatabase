-- Client SMS language preference (set by website on booking).

alter table clients
  add column if not exists preferred_language text not null default 'en';

update clients
set preferred_language = 'en'
where preferred_language is null or trim(preferred_language) = '';

alter table clients
  drop constraint if exists clients_preferred_language_check;

alter table clients
  add constraint clients_preferred_language_check
  check (preferred_language in ('en', 'fr'));
