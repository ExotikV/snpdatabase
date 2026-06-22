import { BUSINESS_TIMEZONE } from "./dates.js";

/** First allowed send: 1:00 PM Eastern. Last allowed: 6:59 PM Eastern (7 PM is blocked). */
export const SMS_SEND_WINDOW_START_HOUR = 13;
export const SMS_SEND_WINDOW_END_HOUR = 19;

export function getEasternClockParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const read = (type) => Number(parts.find((part) => part.type === type)?.value);

  return {
    hour: read("hour") % 24,
    minute: read("minute"),
  };
}

export function isWithinSmsSendWindow(now = new Date()) {
  const { hour, minute } = getEasternClockParts(now);
  const minutesOfDay = hour * 60 + minute;
  const start = SMS_SEND_WINDOW_START_HOUR * 60;
  const end = SMS_SEND_WINDOW_END_HOUR * 60;
  return minutesOfDay >= start && minutesOfDay < end;
}

export function getSmsSendWindowLabel() {
  return "1:00 PM – 7:00 PM Eastern";
}

export function getSmsSendWindowBlockReason(now = new Date()) {
  const { hour, minute } = getEasternClockParts(now);
  const clock = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  return `SMS only go out ${getSmsSendWindowLabel()} (now ${clock} Eastern).`;
}

export function assertSmsSendWindow(now = new Date()) {
  if (isWithinSmsSendWindow(now)) {
    return { ok: true };
  }

  return {
    ok: false,
    outsideSendWindow: true,
    reason: getSmsSendWindowBlockReason(now),
  };
}
