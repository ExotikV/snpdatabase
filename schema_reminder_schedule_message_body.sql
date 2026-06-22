-- Run this in the Supabase SQL editor after schema_reminder_schedule.sql
-- Adds fully customizable SMS body per schedule step with {variable} placeholders.

alter table reminder_schedule
  add column if not exists message_body text;

update reminder_schedule
set message_body = 'Hi {name}, hope you''re still enjoying your {service} from {last_detail_date}. When you''re ready for your next SNP Detailing visit, book here: {booking_url}'
where sequence_number = 1
  and (message_body is null or trim(message_body) = '');

update reminder_schedule
set message_body = 'Hi {name}, it''s been {days_since} days since your {service} on {last_detail_date}. Time to book your next maintenance detail: {booking_url}'
where sequence_number = 2
  and (message_body is null or trim(message_body) = '');

update reminder_schedule
set message_body = 'Hi {name}, your vehicle is due for maintenance ({days_since} days since your last {service}). Reserve your spot: {booking_url}'
where sequence_number = 3
  and (message_body is null or trim(message_body) = '');

update reminder_schedule
set message_body = 'Hi {name}, last reminder from SNP Detailing — please book your next detail soon ({days_since} days since {last_detail_date}): {booking_url}'
where sequence_number = 4
  and (message_body is null or trim(message_body) = '');

update reminder_schedule
set message_body = 'Hi {name}, it''s time to book your next maintenance detail with SNP Detailing. Your last {service} was on {last_detail_date} ({days_since} days ago). Book here: {booking_url}'
where message_body is null or trim(message_body) = '';

alter table reminder_schedule
  alter column message_body set default 'Hi {name}, it''s time to book your next maintenance detail with SNP Detailing. Your last {service} was on {last_detail_date} ({days_since} days ago). Book here: {booking_url}';

alter table reminder_schedule
  alter column message_body set not null;
