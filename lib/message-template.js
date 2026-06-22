import { formatServiceLabel } from "./service-labels.js";

const DEFAULT_BOOKING_DOMAIN = "www.snpdetailing.ca";
const DETAIL_DATE_TIMEZONE = "America/Toronto";

export function getFirstName(fullName) {
  if (!fullName?.trim()) {
    return "there";
  }
  return fullName.trim().split(/\s+/)[0];
}

function parseDetailDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const str = String(value).trim();
  const dateOnly = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function detailDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DETAIL_DATE_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function ordinalSuffix(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";

  const mod10 = day % 10;
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}

/** Human-friendly date for SMS, e.g. "January 15th" or "January 15th, 2025". */
export function formatDetailDate(value) {
  const date = parseDetailDate(value);
  if (!date) return "";

  const { year, month, day } = detailDateParts(date);
  const localDate = new Date(year, month - 1, day);
  const nowYear = detailDateParts(new Date()).year;
  const sameYear = year === nowYear;
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long" }).format(localDate);
  const dayWithOrdinal = `${day}${ordinalSuffix(day)}`;

  return sameYear
    ? `${monthName} ${dayWithOrdinal}`
    : `${monthName} ${dayWithOrdinal}, ${year}`;
}

export function buildBookingUrl({ smsLogId, domain, source = "sms_reminder" }) {
  const host = (domain ?? process.env.BOOKING_WEBSITE_DOMAIN ?? DEFAULT_BOOKING_DOMAIN)
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const ref = encodeURIComponent(smsLogId);
  const sourceParam = encodeURIComponent(source);
  return `https://${host}/book?ref=${ref}&source=${sourceParam}`;
}

/**
 * Replace {variable} placeholders in a custom message body.
 * Supported: name, first_name, service, last_detail_date, days_since, booking_url
 */
export function renderMessageTemplate(template, vars) {
  const map = {
    name: vars.name ?? "",
    first_name: vars.firstName ?? "",
    service: vars.service ?? "detail",
    last_detail_date: vars.lastDetailDate ?? "",
    days_since: String(vars.daysSince ?? ""),
    booking_url: vars.bookingUrl ?? "",
  };

  return template.replace(/\{(\w+)\}/g, (_, key) => map[key] ?? `{${key}}`);
}

export function buildMaintenanceReminderMessage({
  messageBody,
  clientName,
  smsLogId,
  serviceType,
  lastDetailDate,
  daysSince,
  domain,
  bookingSource,
}) {
  const template =
    messageBody?.trim() ||
    "Hi {first_name}, it has been {days_since} days since your last {service} on {last_detail_date}. Book your maintenance detail here: {booking_url}";

  return renderMessageTemplate(template, {
    name: clientName ?? "there",
    firstName: getFirstName(clientName),
    service: formatServiceLabel(serviceType),
    lastDetailDate: formatDetailDate(lastDetailDate),
    daysSince,
    bookingUrl: buildBookingUrl({ smsLogId, domain, source: bookingSource }),
  });
}
