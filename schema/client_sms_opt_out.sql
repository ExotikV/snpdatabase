-- Tracks how and when a client opted out of SMS reminders.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS opted_out_source text;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_opted_out_source_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_opted_out_source_check
  CHECK (opted_out_source IS NULL OR opted_out_source IN ('manual', 'stop_reply'));

COMMENT ON COLUMN clients.opted_out_at IS 'When the client was last opted out of SMS reminders';
COMMENT ON COLUMN clients.opted_out_source IS 'manual = dashboard exclusion; stop_reply = client texted STOP';
