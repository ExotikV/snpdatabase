import {
  BUSINESS_TIMEZONE,
  getTorontoDateParts,
  torontoCalendarToInstant,
} from "./dates.js";
import { DELAY_UNITS } from "./schedule-rules.js";
import {
  SMS_SEND_WINDOW_START_HOUR,
  getEasternClockParts,
  isWithinSmsSendWindow,
} from "./sms-send-window.js";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function addCalendarDays(parts, days) {
  const anchor = torontoCalendarToInstant(parts, 12);
  return getTorontoDateParts(new Date(anchor.getTime() + days * MS_PER_DAY));
}

/** Next Netlify hourly cron run (:00 UTC). */
export function getNextHourlyCronRun(from = new Date()) {
  const hourMs = MS_PER_HOUR;
  const nextMs = Math.ceil(from.getTime() / hourMs) * hourMs;
  return new Date(nextMs <= from.getTime() ? nextMs + hourMs : nextMs);
}

function getNextSendWindowOpen(from = new Date()) {
  const parts = getTorontoDateParts(from);
  if (!parts) return getNextHourlyCronRun(from);

  const { hour, minute } = getEasternClockParts(from);
  const minutesOfDay = hour * 60 + minute;
  const windowStartMinutes = SMS_SEND_WINDOW_START_HOUR * 60;

  if (minutesOfDay < windowStartMinutes) {
    return torontoCalendarToInstant(parts, SMS_SEND_WINDOW_START_HOUR, 0);
  }

  const tomorrow = addCalendarDays(parts, 1);
  return torontoCalendarToInstant(tomorrow, SMS_SEND_WINDOW_START_HOUR, 0);
}

function firstSendOnEligibleDay(eligibleDayParts, now) {
  const windowOpen = torontoCalendarToInstant(eligibleDayParts, SMS_SEND_WINDOW_START_HOUR, 0);
  const nowParts = getTorontoDateParts(now);
  const isSameDay =
    nowParts &&
    eligibleDayParts.year === nowParts.year &&
    eligibleDayParts.month === nowParts.month &&
    eligibleDayParts.day === nowParts.day;

  if (!isSameDay) {
    return windowOpen;
  }

  if (isWithinSmsSendWindow(now)) {
    return getNextHourlyCronRun(now);
  }

  if (now.getTime() < windowOpen.getTime()) {
    return windowOpen;
  }

  return getNextSendWindowOpen(now);
}

/**
 * Best-effort send datetime for the scheduled SMS queue UI.
 */
export function estimateScheduledSendAt({
  lastDetailDate,
  requiredAmount,
  delayUnit,
  status,
  now = new Date(),
}) {
  const detailInstant =
    lastDetailDate instanceof Date ? lastDetailDate : new Date(String(lastDetailDate));
  if (Number.isNaN(detailInstant.getTime())) return null;

  const amount = Number(requiredAmount);
  if (!Number.isFinite(amount)) return null;

  if (delayUnit === DELAY_UNITS.HOURS) {
    const eligibleAt = new Date(detailInstant.getTime() + amount * MS_PER_HOUR);

    if (status === "due_now") {
      return getNextHourlyCronRun(now);
    }

    if (eligibleAt.getTime() > now.getTime()) {
      return getNextHourlyCronRun(eligibleAt);
    }

    return getNextHourlyCronRun(now);
  }

  const detailParts = getTorontoDateParts(detailInstant);
  if (!detailParts) return null;

  const eligibleDayParts = addCalendarDays(detailParts, amount);

  if (status === "due_now") {
    if (isWithinSmsSendWindow(now)) {
      return getNextHourlyCronRun(now);
    }
    return getNextSendWindowOpen(now);
  }

  return firstSendOnEligibleDay(eligibleDayParts, now);
}

export function formatEstimatedSendAt(instant, now = new Date()) {
  if (!instant || Number.isNaN(instant.getTime())) return null;

  const instantYear = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIMEZONE,
      year: "numeric",
    }).format(instant),
  );
  const nowYear = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: BUSINESS_TIMEZONE,
      year: "numeric",
    }).format(now),
  );

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(instantYear !== nowYear ? { year: "numeric" } : {}),
  }).format(instant);

  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);

  return `${dateLabel} at ${timeLabel} ET`;
}
