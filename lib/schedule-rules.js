/**
 * Schedule step timing: use the configured days from the database as-is.
 * Automated sends only fire on the exact schedule day (days since last detail === step day).
 */

export function getEffectiveDaysForScheduleStep(_track, _sequenceNumber, configuredDays) {
  const configured = Number(configuredDays);
  return Number.isFinite(configured) ? configured : 0;
}

/** True only on the exact Eastern calendar day for this step — not before, not after. */
export function isOnScheduleDay(daysSince, requiredDays) {
  return (
    Number.isFinite(daysSince) &&
    Number.isFinite(requiredDays) &&
    daysSince === requiredDays
  );
}

/**
 * Next step to evaluate for a client: skip past missed days, upcoming if too early, due on exact day.
 */
export function resolveNextScheduleStep({
  scheduleBySequence,
  highestReceived,
  daysSince,
  track,
}) {
  const sequenceNumbers = [...scheduleBySequence.keys()].sort((a, b) => a - b);
  if (!sequenceNumbers.length) {
    return { status: "complete" };
  }

  let seq = highestReceived + 1;
  const maxSeq = sequenceNumbers[sequenceNumbers.length - 1];

  while (seq <= maxSeq) {
    const step = scheduleBySequence.get(seq);
    if (!step) {
      seq += 1;
      continue;
    }

    const requiredDays = getEffectiveDaysForScheduleStep(
      track,
      seq,
      step.days_since_last_detail,
    );

    if (daysSince < requiredDays) {
      return {
        status: "upcoming",
        sequenceNumber: seq,
        requiredDays,
        daysUntilSend: requiredDays - daysSince,
        step,
      };
    }

    if (daysSince > requiredDays) {
      seq += 1;
      continue;
    }

    return {
      status: "due",
      sequenceNumber: seq,
      requiredDays,
      daysUntilSend: 0,
      step,
    };
  }

  return { status: "complete" };
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
