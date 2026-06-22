-- Separate general sequence for service-area clients who missed the maintenance window (starts day 90).
-- Run in Supabase SQL Editor after reminder_schedule_language.sql

alter table reminder_schedule
  drop constraint if exists reminder_schedule_track_check;

alter table reminder_schedule
  add constraint reminder_schedule_track_check
  check (track in ('maintenance', 'general', 'general_after_maintenance'));

-- English — after maintenance miss (day 90+)
insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general_after_maintenance', 'en', 1, 90, true,
  'Hi {first_name}, we noticed you haven''t booked your maintenance detail yet. Book your next visit with SNP Detailing here: {booking_url}'
where not exists (
  select 1 from reminder_schedule
  where track = 'general_after_maintenance' and language = 'en' and sequence_number = 1
);

insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general_after_maintenance', 'en', 2, 120, true,
  'Hi {first_name}, we''d still love to see you — book your SNP Detailing appointment: {booking_url}'
where not exists (
  select 1 from reminder_schedule
  where track = 'general_after_maintenance' and language = 'en' and sequence_number = 2
);

insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general_after_maintenance', 'en', 3, 150, true,
  'Hi {first_name}, last note from SNP Detailing — reserve your spot when you''re ready: {booking_url}'
where not exists (
  select 1 from reminder_schedule
  where track = 'general_after_maintenance' and language = 'en' and sequence_number = 3
);

-- French — after maintenance miss
insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general_after_maintenance', 'fr', 1, 90, true,
  'Bonjour {prenom}, nous avons remarque que vous n''avez pas encore reserve votre entretien. Reservez votre prochain {detail} ici : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule
  where track = 'general_after_maintenance' and language = 'fr' and sequence_number = 1
);

insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general_after_maintenance', 'fr', 2, 120, true,
  'Bonjour {prenom}, on aimerait toujours vous revoir - reservez votre rendez-vous SNP Detailing : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule
  where track = 'general_after_maintenance' and language = 'fr' and sequence_number = 2
);

insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general_after_maintenance', 'fr', 3, 150, true,
  'Bonjour {prenom}, dernier rappel de SNP Detailing - reservez quand vous etes pret : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule
  where track = 'general_after_maintenance' and language = 'fr' and sequence_number = 3
);
