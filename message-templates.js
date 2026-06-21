// Replace with your real booking page domain (no trailing slash), e.g. "www.detailingsnp.com"
const BOOKING_WEBSITE_DOMAIN = "www.snpdetailing.ca";

export function buildMaintenanceReminderBookingUrl(smsLogId) {
  const params = new URLSearchParams({
    ref: smsLogId,
    source: "sms_reminder",
  });
  return `https://${BOOKING_WEBSITE_DOMAIN}/book?${params.toString()}`;
}

export function buildMaintenanceReminderMessage(clientName, smsLogId) {
  const greetingName = clientName?.trim() || "there";
  const bookingUrl = buildMaintenanceReminderBookingUrl(smsLogId);

  return `Hi ${greetingName}, this is a placeholder maintenance reminder message. Book here: ${bookingUrl}`;
}
