/**
 * Schedule step timing: use the configured days from the database as-is.
 * Automated sends only fire when days since last detail >= that value (see lib/eligibility.js).
 */
export function getEffectiveDaysForScheduleStep(_track, _sequenceNumber, configuredDays) {
  const configured = Number(configuredDays);
  return Number.isFinite(configured) ? configured : 0;
}

export function validateScheduleStepDays(step) {
  const sequenceNumber = Number(step.sequence_number);
  const configured = Number(step.days_since_last_detail);

  if (!Number.isFinite(sequenceNumber) || sequenceNumber < 1) {
    return "Each step needs a valid sequence number.";
  }

  if (!Number.isFinite(configured) || configured < 0) {
    return "Each step needs days since last detail (0 or more).";
  }

  return null;
}
