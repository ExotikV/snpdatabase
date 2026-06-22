-- SMS links use short_ref codes (e.g. YnzXvV), not sms_log UUIDs.
-- The original ref column was uuid + FK, so short-ref inserts failed silently on the website.
-- Run this in Supabase SQL Editor before SMS conversion tracking will work.

alter table booking_attempts
  drop constraint if exists booking_attempts_ref_fkey;

alter table booking_attempts
  alter column ref type text
  using ref::text;

comment on column booking_attempts.ref is
  'SMS tracking code from the booking URL: sms_log.short_ref (preferred) or legacy sms_log.id UUID';
