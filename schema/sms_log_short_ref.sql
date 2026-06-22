-- Short codes for compact SMS booking links (e.g. snpdetailing.ca/r/a3K9m2/m)

alter table sms_log add column if not exists short_ref text;

create unique index if not exists sms_log_short_ref_unique
  on sms_log (short_ref)
  where short_ref is not null;
