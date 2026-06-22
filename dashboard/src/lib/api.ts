async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export function fetchStats() {
  return apiFetch<StatsResponse>("api-stats");
}

export function fetchBookings() {
  return apiFetch<{ bookings: BookingRow[] }>("api-bookings");
}

export function fetchSmsLog() {
  return apiFetch<{ smsLog: SmsLogRow[] }>("api-sms-log");
}

export function fetchSchedule(
  track: "maintenance" | "general" = "maintenance",
  language: "en" | "fr" = "en",
) {
  return apiFetch<{
    steps: ScheduleStep[];
    migrationRequired?: boolean;
    languageMigrationRequired?: boolean;
  }>(`api-schedule?track=${track}&language=${language}`);
}

export function saveSchedule(steps: ScheduleStep[]) {
  return apiFetch<{ ok: boolean; activeSteps: number }>("api-schedule", {
    method: "PUT",
    body: JSON.stringify({ steps }),
  });
}

export function createScheduleStep(
  step: Partial<ScheduleStep> & { track?: string; language?: "en" | "fr" },
) {
  return apiFetch<{ step: ScheduleStep }>("api-schedule", {
    method: "POST",
    body: JSON.stringify(step),
  });
}

export function deleteScheduleStep(id: string) {
  return apiFetch<{ ok: boolean }>("api-schedule", {
    method: "DELETE",
    body: JSON.stringify({ id }),
  });
}

export function fetchEligible() {
  return apiFetch<EligibleResponse>("api-eligible");
}

export function sendReminder(clientId?: string) {
  return apiFetch<SendResult>("send-reminder", {
    method: "POST",
    body: JSON.stringify(clientId ? { clientId } : {}),
  });
}

export function fetchTestSmsOptions(search = "") {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
  return apiFetch<TestSmsOptionsResponse>(`api-test-sms${query}`);
}

/** @deprecated use fetchTestSmsOptions */
export function fetchTestPhone() {
  return fetchTestSmsOptions().then((data) => ({ testPhone: data.testPhone }));
}

export function sendTestSms(payload: {
  message_body: string;
  track?: "maintenance" | "general";
  client_name?: string;
  service_type?: string;
  last_detail_date?: string;
  days_since?: number;
  days_since_last_detail?: number;
}) {
  return apiFetch<TestSmsResult>("api-test-sms", {
    method: "POST",
    body: JSON.stringify({
      message_body: payload.message_body,
      track: payload.track,
      client_name: payload.client_name,
      service_type: payload.service_type,
      last_detail_date: payload.last_detail_date,
      days_since: payload.days_since ?? payload.days_since_last_detail,
    }),
  });
}

export interface TestSmsClient {
  clientId: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  lastServiceType: string | null;
  lastDetailDate: string | null;
  daysSince: number | null;
}

export interface TestSmsOptionsResponse {
  testPhone: string;
  productionSendsEnabled: boolean;
  clients: TestSmsClient[];
}

export function fetchEnrollments() {
  return apiFetch<EnrollmentResponse>("api-enrollment");
}

export function updateClientCity(clientId: string, city: string) {
  return apiFetch<{ ok: boolean; cityEligible: boolean }>("api-enrollment", {
    method: "PATCH",
    body: JSON.stringify({ clientId, city }),
  });
}

export function updateClientLanguage(clientId: string, preferredLanguage: "en" | "fr") {
  return apiFetch<{ ok: boolean; preferred_language: "en" | "fr" }>("api-enrollment", {
    method: "PATCH",
    body: JSON.stringify({ clientId, preferredLanguage }),
  });
}

export function updateClientSmsExclusion(clientId: string, excludedFromSms: boolean) {
  return apiFetch<{ ok: boolean; opted_out: boolean }>("api-enrollment", {
    method: "PATCH",
    body: JSON.stringify({ clientId, excludedFromSms }),
  });
}

export function syncFromSquare(customersOnly = false) {
  return apiFetch<SquareSyncResult>("api-square-sync", {
    method: "POST",
    body: JSON.stringify({ customersOnly }),
  });
}

export interface SquareSyncResult {
  ok: boolean;
  stats: {
    customersFetched: number;
    clientsProcessed: number;
    clientsWithCity: number;
    clientErrors: number;
    bookingsFetched?: number;
    bookingsProcessed?: number;
    bookingErrors?: number;
  };
}

export interface EnrollmentClient {
  clientId: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  preferredLanguage: "en" | "fr";
  preferredLanguageLabel: string;
  cityEligible: boolean;
  maintenanceEligible: boolean;
  smsTrack: "maintenance" | "general" | null;
  smsTrackLabel: string;
  optedOut: boolean;
  smsEnrolled: boolean;
  daysSinceLastDetail: number | null;
  daysSinceAnchor: number;
}

export interface EnrollmentResponse {
  clients: EnrollmentClient[];
  eligibleCities: string[];
}

export interface TestSmsResult {
  ok: boolean;
  to?: string;
  body?: string;
  reason?: string;
}

export interface StatsResponse {
  totalBookings: number;
  bySource: { source: string; label: string; count: number; percentage: number }[];
  trend: { date: string; direct: number; sms_reminder: number; qr_code: number; other: number }[];
  sms: { sent: number; failed: number; converted: number; conversionRate: number };
}

export interface BookingRow {
  id: string;
  source: string;
  sourceLabel: string;
  phone: string | null;
  bookedAt: string;
  processed: boolean;
  rawNote: string | null;
  linkedSms: { status: string; sentAt: string | null; converted: boolean } | null;
}

export interface SmsLogRow {
  id: string;
  clientId: string;
  clientName: string | null;
  phone: string | null;
  triggerType: string;
  trackLabel: string;
  status: string;
  sentAt: string | null;
  converted: boolean;
  sequenceNumber: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ScheduleStep {
  id: string;
  track: "maintenance" | "general";
  language: "en" | "fr";
  sequence_number: number;
  days_since_last_detail: number;
  active: boolean;
  message_body: string | null;
  created_at?: string;
}

export interface EligibleClient {
  clientId: string;
  name: string;
  phone: string | null;
  city: string | null;
  track: "maintenance" | "general";
  preferredLanguage: "en" | "fr";
  maintenanceEligible: boolean;
  daysSince: number;
  sequenceNumber: number;
  lastDetailDate: string;
  lastServiceType: string | null;
  messageBody: string | null;
}

export interface EligibleResponse {
  eligible: EligibleClient[];
  maintenance: EligibleClient[];
  general: EligibleClient[];
}

export interface SendResult {
  ok: boolean;
  result?: { ok: boolean; name: string; reason?: string; smsLogId?: string };
  sentCount?: number;
  failedCount?: number;
}

export const REFRESH_MS = 60 * 60 * 1000;

export {
  MESSAGE_VARIABLES,
  MESSAGE_VARIABLES_EN,
  MESSAGE_VARIABLES_FR,
} from "../../../lib/message-variables.js";
