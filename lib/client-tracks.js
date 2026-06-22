import { isEligibleCity } from "./service-area.js";
import { MAINTENANCE_WINDOW_DAYS, TRACKS } from "./tracks.js";

/**
 * Maintenance detail reminders: service-area cities only, last detail within 60 days.
 * General reminders: past clients with a completed detail — all cities.
 */
export function isMaintenanceProgramEligible({ city, daysSinceLastDetail, hasCompletedDetail }) {
  if (!hasCompletedDetail) return false;
  if (daysSinceLastDetail == null || daysSinceLastDetail > MAINTENANCE_WINDOW_DAYS) return false;
  return isEligibleCity(city);
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
