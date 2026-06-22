-- Language chosen on the website at booking time (optional; synced to clients).

alter table booking_attempts
  add column if not exists preferred_language text;

alter table booking_attempts
  drop constraint if exists booking_attempts_preferred_language_check;

alter table booking_attempts
  add constraint booking_attempts_preferred_language_check
  check (preferred_language is null or preferred_language in ('en', 'fr'));
