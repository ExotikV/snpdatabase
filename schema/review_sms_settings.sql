-- Post-detail review SMS: one-time per client, configurable delay and EN/FR message.

create table if not exists review_sms_settings (
  id integer primary key default 1 check (id = 1),
  active boolean not null default false,
  delay_minutes integer not null default 60 check (delay_minutes in (30, 60, 120)),
  review_url text not null default '',
  message_body_en text not null default 'Hi {first_name}, thank you for choosing SNP Detailing! We''d love your feedback: {review_url}',
  message_body_fr text not null default 'Bonjour {prenom}, merci d''avoir choisi SNP Detailing! Votre avis compte pour nous : {lien_avis}',
  active_since timestamptz,
  updated_at timestamptz not null default now()
);

insert into review_sms_settings (id)
values (1)
on conflict (id) do nothing;
