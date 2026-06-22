-- Allow manual bulk SMS rows in sms_log (separate from automated reminder tracks).

alter table sms_log
  drop constraint if exists sms_log_trigger_type_check;

alter table sms_log
  add constraint sms_log_trigger_type_check
  check (
    trigger_type in (
      'maintenance_reminder',
      'general_reminder',
      'general_after_maintenance_reminder',
      'manual'
    )
  );
