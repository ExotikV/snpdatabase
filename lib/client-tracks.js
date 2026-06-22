import { isEligibleCity } from "./service-area.js";
import {
  GENERAL_AFTER_MAINTENANCE_MISS_DAYS,
  GENERAL_REMINDER_START_DAYS,
  MAINTENANCE_WINDOW_DAYS,
  TRACKS,
} from "./tracks.js";

/**
 * Maintenance detail reminders: service-area cities only, last detail within 60 days.
 * General reminders: past clients with a completed detail — all cities.
 */
export function isMaintenanceProgramEligible({ city, daysSinceLastDetail, hasCompletedDetail }) {
  if (!hasCompletedDetail) return false;
  if (daysSinceLastDetail == null || daysSinceLastDetail > MAINTENANCE_WINDOW_DAYS) return false;
  return isEligibleCity(city);
}

/**
 * Minimum days before the first general reminder.
 * - Outside service area: 60 days after last detail.
 * - Service area (maintenance window missed): 90 days — maintenance sequence runs days 30–60 only.
 */
export function getGeneralFirstReminderMinDays({ city }) {
  if (isEligibleCity(city)) {
    return GENERAL_AFTER_MAINTENANCE_MISS_DAYS;
  }
  return GENERAL_REMINDER_START_DAYS;
}

export function isWaitingForGeneralStart({ city, daysSinceLastDetail, smsTrack }) {
  if (smsTrack !== TRACKS.GENERAL || daysSinceLastDetail == null) return false;

  const minDays = getGeneralFirstReminderMinDays({ city });
  return daysSinceLastDetail < minDays;
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
  return TRACKS.GENERAL;
}

export { isEligibleCity, getEligibleCityLabels } from "./service-area.js";
