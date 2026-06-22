import { buildBookingUrl } from "./booking-url.js";
import { buildMessageVariableMap } from "./message-variables.js";

export { formatDetailDate } from "./dates.js";
export { toDateInputValue, getTorontoDateParts } from "./dates.js";
export { buildBookingUrl } from "./booking-url.js";

export function getFirstName(fullName) {
  if (!fullName?.trim()) {
    return "there";
  }
  return fullName.trim().split(/\s+/)[0];
}

/**
 * Replace {variable} placeholders in a custom message body.
 * English and French variable names are supported (see lib/message-variables.js).
 */
export function renderMessageTemplate(template, vars) {
  const map = buildMessageVariableMap({
    name: vars.name ?? "",
    firstName: vars.firstName ?? "",
    serviceType: vars.serviceType,
    lastDetailDate: vars.lastDetailDate,
    daysSince: vars.daysSince,
    bookingUrl: vars.bookingUrl ?? "",
  });

  return template.replace(/\{([\w]+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : `{${key}}`,
  );
}

export function buildMaintenanceReminderMessage({
  messageBody,
  clientName,
  smsLogId,
  shortRef,
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
    serviceType,
    lastDetailDate,
    daysSince,
    bookingUrl: buildBookingUrl({
      shortRef,
      smsLogId,
      domain,
      source: bookingSource,
    }),
  });
}
