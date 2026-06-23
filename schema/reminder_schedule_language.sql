-- English + French SMS sequences per track (maintenance / general).
-- Run after schema/reminder_schedule_track.sql

alter table reminder_schedule
  add column if not exists language text not null default 'en';

update reminder_schedule
set language = 'en'
where language is null or trim(language) = '';

alter table reminder_schedule
  drop constraint if exists reminder_schedule_language_check;

alter table reminder_schedule
  add constraint reminder_schedule_language_check
  check (language in ('en', 'fr'));

drop index if exists reminder_schedule_track_sequence_idx;

create unique index if not exists reminder_schedule_track_language_sequence_idx
  on reminder_schedule (track, language, sequence_number);

-- French general sequence
insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general', 'fr', 1, 60, true,
  'Bonjour {prenom}, ca fait un bon moment depuis votre derniere visite chez SNP Detailing. Reservez votre prochain {detail} ici : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule where track = 'general' and language = 'fr' and sequence_number = 1
);

insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general', 'fr', 2, 90, true,
  'Bonjour {prenom}, on aimerait vous revoir - reservez votre rendez-vous SNP Detailing : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule where track = 'general' and language = 'fr' and sequence_number = 2
);

insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'general', 'fr', 3, 120, true,
  'Bonjour {prenom}, dernier rappel de SNP Detailing - reservez quand vous etes pret : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule where track = 'general' and language = 'fr' and sequence_number = 3
);

-- French maintenance sequence (mirror default EN timing)
insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'maintenance', 'fr', 1, 1, true,
  'Bonjour {prenom}, ca fait {jours_depuis} jours depuis votre dernier {detail} du {date_dernier_detail}. Reservez votre entretien ici : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule where track = 'maintenance' and language = 'fr' and sequence_number = 1
);

insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'maintenance', 'fr', 2, 45, true,
  'Bonjour {prenom}, ca fait {jours_depuis} jours depuis votre {detail} du {date_dernier_detail}. Il est temps de reserver votre prochain entretien : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule where track = 'maintenance' and language = 'fr' and sequence_number = 2
);

insert into reminder_schedule (track, language, sequence_number, days_since_last_detail, active, message_body)
select 'maintenance', 'fr', 3, 55, true,
  'Bonjour {prenom}, votre vehicule est due pour un entretien ({jours_depuis} jours depuis votre dernier {detail}). Reservez votre place : {lien_reservation}'
where not exists (
  select 1 from reminder_schedule where track = 'maintenance' and language = 'fr' and sequence_number = 3
);
