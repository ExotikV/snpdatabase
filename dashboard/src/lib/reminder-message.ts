const BOOKING_WEBSITE_DOMAIN =
  process.env.BOOKING_WEBSITE_DOMAIN ?? "www.snpdetailing.ca";

export const DEFAULT_REMINDER_MESSAGE_BODY =
  "Hi {name}, it's time to book your next maintenance detail with SNP Detailing. Your last {service} was on {last_detail_date} ({days_since} days ago). Book here: {booking_url}";

export const REMINDER_MESSAGE_VARIABLES = [
  { key: "name", description: 'Client name (or "there" if missing)' },
  { key: "first_name", description: "First word of the client name" },
  { key: "service", description: "Service from their last completed detail" },
  { key: "last_detail_date", description: "Date of last detail (YYYY-MM-DD)" },
  { key: "days_since", description: "Days since last detail" },
  { key: "step", description: "Reminder schedule step number (1, 2, 3…)" },
  { key: "booking_url", description: "Tracked booking link for this SMS" },
] as const;

export const REMINDER_MESSAGE_SAMPLE = {
  name: "Alex",
  first_name: "Alex",
  service: "Essential Detail",
  last_detail_date: "2026-05-15",
  days_since: "38",
  step: "1",
};

export type ReminderMessageVariables = {
  name: string;
  first_name: string;
  service: string;
  last_detail_date: string;
  days_since: string;
  step: string;
  booking_url: string;
};

export function formatDetailDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function getFirstName(fullName: string | null | undefined): string {
  const trimmed = fullName?.trim();
  if (!trimmed) {
    return "there";
  }
  return trimmed.split(/\s+/)[0] ?? "there";
}

export function buildMaintenanceReminderBookingUrl(smsLogId: string): string {
  const params = new URLSearchParams({
    ref: smsLogId,
    source: "sms_reminder",
  });
  return `https://${BOOKING_WEBSITE_DOMAIN}/book?${params.toString()}`;
}

export function renderReminderMessage(
  template: string,
  variables: Partial<ReminderMessageVariables>,
): string {
  const body = template.trim();
  if (!body) {
    throw new Error("Message body cannot be empty");
  }

  return body.replace(/\{([a-z_]+)\}/gi, (match, key: string) => {
    const normalized = key.toLowerCase() as keyof ReminderMessageVariables;
    const value = variables[normalized];
    if (value != null && value !== "") {
      return String(value);
    }
    return match;
  });
}

export function buildReminderMessageVariables({
  clientName,
  smsLogId,
  serviceType,
  lastDetailDate,
  daysSince,
  sequenceNumber,
}: {
  clientName: string | null | undefined;
  smsLogId: string;
  serviceType: string | null | undefined;
  lastDetailDate: Date | string;
  daysSince: number;
  sequenceNumber: number;
}): ReminderMessageVariables {
  return {
    name: clientName?.trim() || "there",
    first_name: getFirstName(clientName),
    service: serviceType?.trim() || "detail",
    last_detail_date: formatDetailDate(lastDetailDate),
    days_since: String(daysSince),
    step: String(sequenceNumber),
    booking_url: buildMaintenanceReminderBookingUrl(smsLogId),
  };
}

export function buildMaintenanceReminderMessage({
  messageBody,
  clientName,
  smsLogId,
  serviceType,
  lastDetailDate,
  daysSince,
  sequenceNumber,
}: {
  messageBody: string;
  clientName: string | null | undefined;
  smsLogId: string;
  serviceType: string | null | undefined;
  lastDetailDate: Date | string;
  daysSince: number;
  sequenceNumber: number;
}): string {
  return renderReminderMessage(
    messageBody,
    buildReminderMessageVariables({
      clientName,
      smsLogId,
      serviceType,
      lastDetailDate,
      daysSince,
      sequenceNumber,
    }),
  );
}

export function previewReminderMessage(
  messageBody: string,
  smsLogId = "00000000-0000-0000-0000-000000000000",
): string {
  return buildMaintenanceReminderMessage({
    messageBody: messageBody.trim() || DEFAULT_REMINDER_MESSAGE_BODY,
    clientName: REMINDER_MESSAGE_SAMPLE.name,
    smsLogId,
    serviceType: REMINDER_MESSAGE_SAMPLE.service,
    lastDetailDate: new Date(`${REMINDER_MESSAGE_SAMPLE.last_detail_date}T12:00:00Z`),
    daysSince: Number(REMINDER_MESSAGE_SAMPLE.days_since),
    sequenceNumber: Number(REMINDER_MESSAGE_SAMPLE.step),
  });
}

export function getDefaultMessageBodyForStep(sequenceNumber: number): string {
  const defaults: Record<number, string> = {
    1: "Hi {name}, hope you're still enjoying your {service} from {last_detail_date}. When you're ready for your next SNP Detailing visit, book here: {booking_url}",
    2: "Hi {name}, it's been {days_since} days since your {service} on {last_detail_date}. Time to book your next maintenance detail: {booking_url}",
    3: "Hi {name}, your vehicle is due for maintenance ({days_since} days since your last {service}). Reserve your spot: {booking_url}",
    4: "Hi {name}, last reminder from SNP Detailing — please book your next detail soon ({days_since} days since {last_detail_date}): {booking_url}",
  };

  return defaults[sequenceNumber] ?? DEFAULT_REMINDER_MESSAGE_BODY;
}

export function insertVariableIntoMessage(current: string, variableKey: string): string {
  const token = `{${variableKey}}`;
  if (!current.trim()) {
    return token;
  }
  return `${current}${current.endsWith(" ") ? "" : " "}${token}`;
}
