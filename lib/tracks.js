export const MAINTENANCE_WINDOW_DAYS = 60;

export const TRACKS = {
  MAINTENANCE: "maintenance",
  GENERAL: "general",
};

export const TRIGGER_BY_TRACK = {
  maintenance: "maintenance_reminder",
  general: "general_reminder",
};

export const TRACK_LABELS = {
  maintenance: "Maintenance",
  general: "General",
};

export function getTriggerTypeForTrack(track) {
  return TRIGGER_BY_TRACK[track] ?? TRIGGER_BY_TRACK.general;
}

export function getBookingSourceForTrack(track) {
  return track === TRACKS.MAINTENANCE ? "sms_reminder" : "general_reminder";
}
