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

export function fetchSchedule() {
  return apiFetch<{ steps: ScheduleStep[] }>("api-schedule");
}

export function saveSchedule(steps: ScheduleStep[]) {
  return apiFetch<{ ok: boolean; activeSteps: number }>("api-schedule", {
    method: "PUT",
    body: JSON.stringify({ steps }),
  });
}

export function createScheduleStep(step: Partial<ScheduleStep>) {
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
  return apiFetch<{ eligible: EligibleClient[] }>("api-eligible");
}

export function sendReminder(clientId?: string) {
  return apiFetch<SendResult>("send-reminder", {
    method: "POST",
    body: JSON.stringify(clientId ? { clientId } : {}),
  });
}

export function fetchTestPhone() {
  return apiFetch<{ testPhone: string }>("api-test-sms");
}

export function sendTestSms(payload: {
  message_body: string;
  days_since_last_detail: number;
}) {
  return apiFetch<TestSmsResult>("api-test-sms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchEnrollments() {
  return apiFetch<EnrollmentResponse>("api-enrollment");
}

export function enrollClient(clientId: string) {
  return apiFetch<{ ok: boolean; error?: string }>("api-enrollment", {
    method: "POST",
    body: JSON.stringify({ clientId }),
  });
}

export function unenrollClient(clientId: string) {
  return apiFetch<{ ok: boolean }>("api-enrollment", {
    method: "DELETE",
    body: JSON.stringify({ clientId }),
  });
}

export function updateClientCity(clientId: string, city: string) {
  return apiFetch<{ ok: boolean; cityEligible: boolean }>("api-enrollment", {
    method: "PATCH",
    body: JSON.stringify({ clientId, city }),
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
  cityEligible: boolean;
  enrolled: boolean;
  enrolledAt: string | null;
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
  status: string;
  sentAt: string | null;
  converted: boolean;
  sequenceNumber: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ScheduleStep {
  id: string;
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
  daysSince: number;
  sequenceNumber: number;
  lastDetailDate: string;
  lastServiceType: string | null;
  messageBody: string | null;
}

export interface SendResult {
  ok: boolean;
  result?: { ok: boolean; name: string; reason?: string; smsLogId?: string };
  sentCount?: number;
  failedCount?: number;
}

export const REFRESH_MS = 60 * 60 * 1000;

export const MESSAGE_VARIABLES = [
  "{first_name}",
  "{name}",
  "{service}",
  "{last_detail_date}",
  "{days_since}",
  "{booking_url}",
];
