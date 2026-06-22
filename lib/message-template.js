import { formatServiceLabel } from "./service-labels.js";
import { formatDetailDate } from "./dates.js";

const DEFAULT_BOOKING_DOMAIN = "www.snpdetailing.ca";

export { formatDetailDate } from "./dates.js";
export { toDateInputValue, getTorontoDateParts } from "./dates.js";

export function getFirstName(fullName) {
  if (!fullName?.trim()) {
    return "there";
  }
  return fullName.trim().split(/\s+/)[0];
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
