/**
 * Schedule step timing. Each step sends after a configured delay from the last detail.
 * - days: exact Eastern calendar day only (not before, not after)
 * - hours: after N hours, within a short grace window (hourly job)
 */

export const DELAY_UNITS = {
  HOURS: "hours",
  DAYS: "days",
};

/** How long after the target hour a step stays eligible (covers hourly runs). */
export const HOUR_STEP_GRACE_HOURS = 2;

export function normalizeDelayUnit(unit) {
  return unit === DELAY_UNITS.HOURS ? DELAY_UNITS.HOURS : DELAY_UNITS.DAYS;
}

export function getEffectiveDelayAmount(_track, _sequenceNumber, configuredAmount) {
  const configured = Number(configuredAmount);
  return Number.isFinite(configured) ? configured : 0;
}

export function getStepDelay(step) {
  return {
    amount: getEffectiveDelayAmount(step?.track, step?.sequence_number, step?.days_since_last_detail),
    unit: normalizeDelayUnit(step?.delay_unit),
  };
}

function isStepUpcoming({ amount, unit }, daysSince, hoursSince) {
  if (unit === DELAY_UNITS.HOURS) {
    return hoursSince < amount;
  }
  return daysSince < amount;
}

function isStepDue({ amount, unit }, daysSince, hoursSince) {
  if (unit === DELAY_UNITS.HOURS) {
    return hoursSince >= amount && hoursSince <= amount + HOUR_STEP_GRACE_HOURS;
  }
  return daysSince === amount;
}

function isStepMissed({ amount, unit }, daysSince, hoursSince) {
  if (unit === DELAY_UNITS.HOURS) {
    return hoursSince > amount + HOUR_STEP_GRACE_HOURS;
  }
  return daysSince > amount;
}

function timeUntilSend({ amount, unit }, daysSince, hoursSince) {
  if (unit === DELAY_UNITS.HOURS) {
    return Math.max(0, amount - hoursSince);
  }
  return Math.max(0, amount - daysSince);
}

/**
 * Next step to evaluate for a client: skip past missed steps, upcoming if too early, due when in window.
 */
export function resolveNextScheduleStep({
  scheduleBySequence,
  highestReceived,
  daysSince,
  hoursSince = 0,
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

    const delay = getStepDelay(step);
    const requiredAmount = getEffectiveDelayAmount(
      track,
      seq,
      step.days_since_last_detail,
    );
    const delayUnit = delay.unit;
    const normalizedDelay = { amount: requiredAmount, unit: delayUnit };

    if (isStepUpcoming(normalizedDelay, daysSince, hoursSince)) {
      return {
        status: "upcoming",
        sequenceNumber: seq,
        requiredAmount,
        delayUnit,
        timeUntilSend: timeUntilSend(normalizedDelay, daysSince, hoursSince),
        step,
        requiredDays: delayUnit === DELAY_UNITS.DAYS ? requiredAmount : null,
        daysUntilSend:
          delayUnit === DELAY_UNITS.DAYS
            ? timeUntilSend(normalizedDelay, daysSince, hoursSince)
            : null,
        hoursUntilSend:
          delayUnit === DELAY_UNITS.HOURS
            ? timeUntilSend(normalizedDelay, daysSince, hoursSince)
            : null,
      };
    }

    if (isStepMissed(normalizedDelay, daysSince, hoursSince)) {
      seq += 1;
      continue;
    }

    if (isStepDue(normalizedDelay, daysSince, hoursSince)) {
      return {
        status: "due",
        sequenceNumber: seq,
        requiredAmount,
        delayUnit,
        timeUntilSend: 0,
        step,
        requiredDays: delayUnit === DELAY_UNITS.DAYS ? requiredAmount : null,
        daysUntilSend: 0,
        hoursUntilSend: delayUnit === DELAY_UNITS.HOURS ? 0 : null,
      };
    }

    seq += 1;
  }

  return { status: "complete" };
}

/** @deprecated use getEffectiveDelayAmount */
export function getEffectiveDaysForScheduleStep(track, sequenceNumber, configuredDays) {
  return getEffectiveDelayAmount(track, sequenceNumber, configuredDays);
}

export function validateScheduleStepDays(step) {
  const sequenceNumber = Number(step.sequence_number);
  const configured = Number(step.days_since_last_detail);
  const unit = normalizeDelayUnit(step.delay_unit);

  if (!Number.isFinite(sequenceNumber) || sequenceNumber < 1) {
    return "Each step needs a valid sequence number.";
  }

  if (!Number.isFinite(configured) || configured < 0) {
    return "Each step needs a delay amount (0 or more).";
  }

  if (unit === DELAY_UNITS.HOURS && configured < 1) {
    return "Hour-based steps must be at least 1 hour after the last detail.";
  }

  return null;
}

export function formatDelayLabel(amount, unit) {
  const value = Number(amount);
  if (unit === DELAY_UNITS.HOURS) {
    return value === 1 ? "1 hour" : `${value} hours`;
  }
  return value === 1 ? "1 day" : `${value} days`;
}
