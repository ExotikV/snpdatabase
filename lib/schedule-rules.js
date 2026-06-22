import { getGeneralFirstReminderMinDays } from "./client-tracks.js";
import {
  MAINTENANCE_REMINDER_START_DAYS,
  MAINTENANCE_WINDOW_DAYS,
  TRACKS,
  isGeneralTrack,
} from "./tracks.js";

/**
 * Minimum days before a schedule step may fire. Schedule DB values cannot go below these.
 */
export function getEffectiveDaysForScheduleStep(track, sequenceNumber, configuredDays) {
  const configured = Number(configuredDays);
  const days = Number.isFinite(configured) ? configured : 0;

  if (track === TRACKS.MAINTENANCE && sequenceNumber === 1) {
    return Math.max(days, MAINTENANCE_REMINDER_START_DAYS);
  }

  if (isGeneralTrack(track) && sequenceNumber === 1) {
    return Math.max(days, getGeneralFirstReminderMinDays({ track }));
  }

  return days;
}

export function validateScheduleStepDays(step) {
  const track = step.track;
  const sequenceNumber = Number(step.sequence_number);
  const configured = Number(step.days_since_last_detail);

  if (!Number.isFinite(sequenceNumber) || sequenceNumber < 1) {
    return "Each step needs a valid sequence number.";
  }

  if (!Number.isFinite(configured) || configured < 0) {
    return "Each step needs days since last detail.";
  }

  const effective = getEffectiveDaysForScheduleStep(track, sequenceNumber, configured);

  if (track === TRACKS.MAINTENANCE && sequenceNumber === 1 && configured < MAINTENANCE_REMINDER_START_DAYS) {
    return `Maintenance step 1 cannot be before ${MAINTENANCE_REMINDER_START_DAYS} days after the last detail.`;
  }

  if (
    track === TRACKS.MAINTENANCE &&
    sequenceNumber === 1 &&
    effective > MAINTENANCE_WINDOW_DAYS
  ) {
    return `Maintenance step 1 cannot be after the ${MAINTENANCE_WINDOW_DAYS}-day maintenance window.`;
  }

  if (isGeneralTrack(track) && sequenceNumber === 1) {
    const min = getGeneralFirstReminderMinDays({ track });
    if (configured < min) {
      return `Step 1 on the ${track} track cannot be before ${min} days after the last detail.`;
    }
  }

  return null;
}
