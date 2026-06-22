-- SMS opt-out: STOP webhook + dashboard exclusion. Opted-out clients never receive SMS.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS opted_out boolean NOT NULL DEFAULT false;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS opted_out_source text;

UPDATE clients
SET opted_out = false
WHERE opted_out IS NULL;

ALTER TABLE clients
  ALTER COLUMN opted_out SET DEFAULT false;

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_opted_out_source_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_opted_out_source_check
  CHECK (opted_out_source IS NULL OR opted_out_source IN ('manual', 'stop_reply'));

COMMENT ON COLUMN clients.opted_out IS 'When true, all automated and manual SMS sends are blocked';
COMMENT ON COLUMN clients.opted_out_at IS 'When the client was last opted out of SMS reminders';
COMMENT ON COLUMN clients.opted_out_source IS 'manual = dashboard exclusion; stop_reply = client texted STOP';
