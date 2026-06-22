export const MAINTENANCE_WINDOW_DAYS = 60;
/** First general reminder for clients who were never in the maintenance window. */
export const GENERAL_REMINDER_START_DAYS = 60;
/** First general reminder for service-area clients who did not book during the maintenance window. */
export const GENERAL_AFTER_MAINTENANCE_MISS_DAYS = 90;

export const TRACKS = {
  MAINTENANCE: "maintenance",
  GENERAL: "general",
  GENERAL_AFTER_MAINTENANCE: "general_after_maintenance",
};

export const TRIGGER_BY_TRACK = {
  maintenance: "maintenance_reminder",
  general: "general_reminder",
  general_after_maintenance: "general_after_maintenance_reminder",
};

export const TRACK_LABELS = {
  maintenance: "Maintenance",
  general: "General",
  general_after_maintenance: "General (after maintenance)",
};

export const GENERAL_TRACKS = [TRACKS.GENERAL, TRACKS.GENERAL_AFTER_MAINTENANCE];

export function isGeneralTrack(track) {
  return track === TRACKS.GENERAL || track === TRACKS.GENERAL_AFTER_MAINTENANCE;
}

export function getTriggerTypeForTrack(track) {
  return TRIGGER_BY_TRACK[track] ?? TRIGGER_BY_TRACK.general;
}

export function getBookingSourceForTrack(track) {
  if (track === TRACKS.MAINTENANCE) return "sms_reminder";
  if (track === TRACKS.GENERAL_AFTER_MAINTENANCE) return "general_after_maintenance_reminder";
  return "general_reminder";
}
