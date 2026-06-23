import { isEligibleCity } from "./service-area.js";
import {
  GENERAL_AFTER_MAINTENANCE_MISS_DAYS,
  GENERAL_REMINDER_START_DAYS,
  MAINTENANCE_WINDOW_DAYS,
  TRACKS,
} from "./tracks.js";

/**
 * Maintenance detail reminders: service-area cities only, last detail within 60 days.
 * General reminders: clients with a completed past appointment — all cities.
 * Returns null track when hasCompletedDetail is false.
 */
export function isMaintenanceProgramEligible({ city, daysSinceLastDetail, hasCompletedDetail }) {
  if (!hasCompletedDetail) return false;
  if (daysSinceLastDetail == null || daysSinceLastDetail > MAINTENANCE_WINDOW_DAYS) return false;
  return isEligibleCity(city);
}

/**
 * Minimum days before the first reminder on a general track.
 */
export function getGeneralFirstReminderMinDays({ track }) {
  if (track === TRACKS.GENERAL_AFTER_MAINTENANCE) {
    return GENERAL_AFTER_MAINTENANCE_MISS_DAYS;
  }
  return GENERAL_REMINDER_START_DAYS;
}

export function isWaitingForGeneralStart({ track, daysSinceLastDetail }) {
  if (daysSinceLastDetail == null) return false;
  if (track !== TRACKS.GENERAL && track !== TRACKS.GENERAL_AFTER_MAINTENANCE) return false;
  return daysSinceLastDetail < getGeneralFirstReminderMinDays({ track });
}

export function getSmsTrackForClient({ city, daysSinceLastDetail, hasCompletedDetail }) {
  if (!hasCompletedDetail) {
    return null;
  }

  if (
    isMaintenanceProgramEligible({
      city,
      daysSinceLastDetail,
      hasCompletedDetail,
    })
  ) {
    return TRACKS.MAINTENANCE;
  }

  if (isEligibleCity(city)) {
    return TRACKS.GENERAL_AFTER_MAINTENANCE;
  }

  return TRACKS.GENERAL;
}

export { isEligibleCity, getEligibleCityLabels } from "./service-area.js";
