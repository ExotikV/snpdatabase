export const MAINTENANCE_WINDOW_DAYS = 60;
/** Default first maintenance step when adding a new schedule row (editable in dashboard). */
export const MAINTENANCE_REMINDER_START_DAYS = 1;
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

export const BOOKING_SOURCE_TO_TRIGGER = {
  sms_reminder: TRIGGER_BY_TRACK.maintenance,
  general_reminder: TRIGGER_BY_TRACK.general,
  general_after_maintenance_reminder: TRIGGER_BY_TRACK.general_after_maintenance,
};

export const TRIGGER_TO_BOOKING_SOURCE = Object.fromEntries(
  Object.entries(BOOKING_SOURCE_TO_TRIGGER).map(([source, trigger]) => [trigger, source]),
);

export const TRIGGER_LABELS = {
  maintenance_reminder: TRACK_LABELS.maintenance,
  general_reminder: TRACK_LABELS.general,
  general_after_maintenance_reminder: TRACK_LABELS.general_after_maintenance,
  manual: "Manual",
};

/** All reminder rows written to sms_log. */
export const ALL_SMS_TRIGGER_TYPES = Object.values(TRIGGER_BY_TRACK);

export const MANUAL_SMS_TRIGGER_TYPE = "manual";

/** Rows shown on the dashboard SMS log page. */
export const SMS_LOG_TRIGGER_TYPES = [...ALL_SMS_TRIGGER_TYPES, MANUAL_SMS_TRIGGER_TYPE];

export const MANUAL_SQUARE_BOOKING_SOURCE = "manual_square";

export const BOOKING_SOURCE_LABELS = {
  direct: "Website (direct)",
  sms_reminder: "Maintenance SMS",
  general_reminder: "General SMS",
  general_after_maintenance_reminder: "After maintenance SMS",
  qr_maintenance: "QR — Maintenance",
  qr_general: "QR — General",
  manual_square: "Phone / Square",
};

export const QR_BOOKING_SOURCES = ["qr_maintenance", "qr_general"];

/** Bookings attributed from the website, SMS links, or QR — not Square phone bookings. */
export const WEBSITE_BOOKING_SOURCES = [
  "direct",
  "sms_reminder",
  "general_reminder",
  "general_after_maintenance_reminder",
  ...QR_BOOKING_SOURCES,
];

export const TRACKED_BOOKING_SOURCES = [...WEBSITE_BOOKING_SOURCES, MANUAL_SQUARE_BOOKING_SOURCE];

export function isWebsiteBookingSource(source) {
  return WEBSITE_BOOKING_SOURCES.includes((source ?? "").toLowerCase());
}

export function isQrBookingSource(source) {
  return QR_BOOKING_SOURCES.includes((source ?? "").toLowerCase());
}

export function emptyBookingTrendRow() {
  return {
    direct: 0,
    sms_reminder: 0,
    general_reminder: 0,
    general_after_maintenance_reminder: 0,
    qr_maintenance: 0,
    qr_general: 0,
    manual_square: 0,
    other: 0,
  };
}

export function normalizeBookingSource(source) {
  const normalized = (source ?? "direct").toLowerCase();
  if (TRACKED_BOOKING_SOURCES.includes(normalized)) {
    return normalized;
  }
  return "other";
}
