const TOKEN_KEY = "snp_dashboard_token";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function extractApiError(data: unknown, status: number): string {
  if (data && typeof data === "object" && "error" in data) {
    const err = (data as { error: unknown }).error;
    if (typeof err === "string" && err.trim()) return err;
    if (err && typeof err === "object" && "message" in err) {
      const message = (err as { message: unknown }).message;
      if (typeof message === "string" && message.trim()) return message;
    }
  }
  return `Request failed (${status})`;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error(extractApiError(data, res.status));
  }

  if (!res.ok) {
    throw new Error(extractApiError(data, res.status));
  }
  return data as T;
}

export function login(password: string) {
  return apiFetch<{ ok: boolean }>("api-auth", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function fetchAuthStatus() {
  return apiFetch<{ configured: boolean }>("api-auth");
}

export function fetchStats() {
  return apiFetch<StatsResponse>("api-stats");
}

export function fetchBookings() {
  return apiFetch<{ bookings: BookingRow[] }>("api-bookings");
}

export function fetchBookingRevenue(period = "this_month", year?: number) {
  const params = new URLSearchParams({ period });
  if (year != null) params.set("year", String(year));
  return apiFetch<BookingRevenueDashboardResponse>(`api-booking-revenue?${params.toString()}`);
}

export function fetchWeeklyOverview() {
  return apiFetch<WeeklyOverviewResponse>("api-weekly-overview");
}

export function fetchUpcomingAppointments() {
  return apiFetch<UpcomingAppointmentsResponse>("api-upcoming-appointments");
}

export function fetchTips(period = "this_month", year?: number) {
  const params = new URLSearchParams({ period });
  if (year != null) params.set("year", String(year));
  return apiFetch<TipsDashboardResponse>(`api-tips?${params.toString()}`);
}

export function fetchClientTipDetails(clientId: string) {
  return apiFetch<{ details: TipJobOption[] }>(`api-tips?clientId=${encodeURIComponent(clientId)}`);
}

export function createTip(payload: {
  clientId: string;
  detailId?: string | null;
  squareBookingId?: string | null;
  amountCents: number;
  tippedAt?: string;
  notes?: string;
}) {
  return apiFetch<{ ok: boolean; tip: TipRow }>("api-tips", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchExpenses(period = "this_month", year?: number) {
  const params = new URLSearchParams({ period });
  if (year != null) params.set("year", String(year));
  return apiFetch<ExpensesDashboardResponse>(`api-expenses?${params.toString()}`);
}

export function createExpenseStore(name: string) {
  return apiFetch<{ ok: boolean; store: ExpenseStoreRow }>("api-expenses", {
    method: "POST",
    body: JSON.stringify({ action: "create_store", name }),
  });
}

export function createExpense(payload: {
  storeId: string;
  description: string;
  amountCents: number;
  expenseDate: string;
}) {
  return apiFetch<{ ok: boolean; expense: ExpenseRow }>("api-expenses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchSmsLog() {
  return apiFetch<{ smsLog: SmsLogRow[] }>("api-sms-log");
}

export type ScheduleTrack = "maintenance" | "general" | "general_after_maintenance";

export function fetchSchedule(
  track: ScheduleTrack = "maintenance",
  language: "en" | "fr" = "en",
) {
  return apiFetch<{
    steps: ScheduleStep[];
    migrationRequired?: boolean;
    languageMigrationRequired?: boolean;
    delayUnitMigrationRequired?: boolean;
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

export function fetchSmsQueue() {
  return apiFetch<SmsQueuePreview>("api-sms-queue");
}

export function sendReminder(clientId?: string) {
  return apiFetch<SendResult>("send-reminder", {
    method: "POST",
    body: JSON.stringify(clientId ? { clientId } : {}),
  });
}

export function fetchManualSmsClients(search = "") {
  const query = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
  return apiFetch<ManualSmsClientsResponse>(`api-manual-sms${query}`);
}

export function sendManualBulkSms(
  messageBodyEn: string,
  messageBodyFr: string,
  clientIds: string[],
) {
  return apiFetch<ManualBulkSmsResult>("api-manual-sms", {
    method: "POST",
    body: JSON.stringify({ messageBodyEn, messageBodyFr, clientIds }),
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
  track?: ScheduleTrack;
  client_id?: string;
  client_name?: string;
  service_type?: string;
  last_detail_date?: string;
  preferred_language?: "en" | "fr";
  sequence_number?: number;
  days_since?: number;
  days_since_last_detail?: number;
}) {
  return apiFetch<TestSmsResult>("api-test-sms", {
    method: "POST",
    body: JSON.stringify({
      message_body: payload.message_body,
      track: payload.track,
      client_id: payload.client_id,
      client_name: payload.client_name,
      service_type: payload.service_type,
      last_detail_date: payload.last_detail_date,
      preferred_language: payload.preferred_language,
      sequence_number: payload.sequence_number,
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
  return apiFetch<{
    ok: boolean;
    opted_out: boolean;
    opted_out_at: string | null;
    opted_out_source: "manual" | "stop_reply" | null;
  }>("api-enrollment", {
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
  smsTrack: ScheduleTrack | null;
  smsTrackLabel: string;
  optedOut: boolean;
  optedOutAt: string | null;
  optedOutSource: "manual" | "stop_reply" | null;
  optedOutLabel: string | null;
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
  smsLogId?: string;
  shortRef?: string;
  bookingUrl?: string;
}

export interface StatsResponse {
  totalBookings: number;
  bySource: {
    source: string;
    label: string;
    count: number;
    percentage: number;
    bookedCents: number;
    actualCents: number;
  }[];
  trend: {
    date: string;
    direct: number;
    sms_reminder: number;
    general_reminder: number;
    general_after_maintenance_reminder: number;
    qr_maintenance: number;
    qr_general: number;
    other: number;
  }[];
  revenue: {
    bookedCents: number;
    actualCents: number;
    pendingBookedCents: number;
    migrationRequired: boolean;
  };
  sms: {
    sent: number;
    failed: number;
    converted: number;
    conversionRate: number;
    byTrack: {
      triggerType: string;
      label: string;
      sent: number;
      failed: number;
      converted: number;
      bookings: number;
      conversionRate: number | null;
      bookedCents: number;
      actualCents: number;
    }[];
  };
  qr: {
    trackingStartDate: string;
    cardsHandedOut: number;
    bookings: number;
    conversionRate: number | null;
    byTrack: {
      source: string;
      label: string;
      cardsHandedOut: number;
      bookings: number;
      conversionRate: number | null;
      bookedCents: number;
      actualCents: number;
    }[];
  };
  smsSubscribers: {
    total: number;
    receiving: number;
    unsubscribedStop: number;
    excludedManual: number;
    optedOut: number;
  };
}

export interface UpcomingAppointmentRow {
  squareBookingId: string;
  clientId: string | null;
  clientName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  startAt: string;
  daysUntil: number | null;
  daysUntilLabel: string;
  serviceType: string | null;
  durationMinutes: number | null;
  status: string;
  statusLabel: string;
  bookedRevenueCents: number | null;
  catalogPriceCents: number | null;
  priceCents: number | null;
  priceSource: "website" | "catalog" | null;
  bookingSource: string | null;
  bookingSourceLabel: string | null;
  customerNote: string | null;
  sellerNote: string | null;
}

export interface UpcomingAppointmentsResponse {
  generatedAt: string;
  syncedAt: string;
  lookaheadDays: number;
  syncStats: Record<string, unknown> | null;
  summary: {
    total: number;
    totalPriceCents: number;
    pricedCount: number;
    thisWeek: number;
    today: number;
    tomorrow: number;
  };
  appointments: UpcomingAppointmentRow[];
}

export interface TipRow {
  id: string;
  clientId: string;
  clientName: string | null;
  clientPhone: string | null;
  detailId: string | null;
  amountCents: number;
  tippedAt: string;
  notes: string | null;
  jobCompletedAt: string | null;
  jobServiceType: string | null;
  squareBookingId: string | null;
  createdAt: string;
}

export interface TipJobOption {
  detailId: string;
  completedAt: string;
  serviceType: string | null;
  squareBookingId: string | null;
}

export interface TipTodayJob {
  detailId: string | null;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientCity: string | null;
  completedAt: string;
  serviceType: string | null;
  squareBookingId: string | null;
  source: "completed" | "appointment";
}

export interface TipMonthBucket {
  month: number;
  label: string;
  totalCents: number;
  tipCount: number;
}

export interface TipsDashboardResponse {
  migrationRequired?: boolean;
  setupError?: string | null;
  period: string;
  periodLabel: string;
  stats: {
    totalCents: number;
    tipCount: number;
    averageCents: number;
  };
  monthlyBreakdown: TipMonthBucket[];
  tips: TipRow[];
  todayJobs: TipTodayJob[];
  availablePeriods: { id: string; label: string }[];
  year: number;
}

export interface ExpenseStoreRow {
  id: string;
  name: string;
  createdAt: string;
}

export interface ExpenseRow {
  id: string;
  storeId: string;
  storeName: string | null;
  description: string;
  amountCents: number;
  expenseDate: string;
  createdAt: string;
}

export interface ExpenseMonthBucket {
  month: number;
  label: string;
  totalCents: number;
  expenseCount: number;
}

export interface ExpensesDashboardResponse {
  migrationRequired?: boolean;
  setupError?: string | null;
  period: string;
  periodLabel: string;
  stats: {
    totalCents: number;
    expenseCount: number;
    averageCents: number;
  };
  monthlyBreakdown: ExpenseMonthBucket[];
  expenses: ExpenseRow[];
  stores: ExpenseStoreRow[];
  availablePeriods: { id: string; label: string }[];
  year: number;
}

export interface BookingRevenueMonthBucket {
  month: number;
  label: string;
  bookedCents: number;
  actualCents: number;
  bookingCount: number;
  squareOrderCount?: number;
}

export interface BookingRevenueDashboardResponse {
  migrationRequired: boolean;
  squareRevenueUnavailable?: boolean;
  period: string;
  periodLabel: string;
  stats: {
    bookingCount: number;
    uniqueClients: number;
    bookedCents: number;
    actualCents: number;
    pendingBookedCents: number;
    cancelledCount: number;
    squareOrderCount?: number;
  };
  monthlyBreakdown: BookingRevenueMonthBucket[];
  bookings: BookingRow[];
  availablePeriods: { id: string; label: string }[];
  year: number;
}

export interface WeeklyOverviewResponse {
  generatedAt: string;
  weekLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  revenueMigrationRequired: boolean;
  expensesMigrationRequired: boolean;
  stats: {
    actualRevenueCents: number;
    remainingRevenueCents: number;
    appointmentsRemainingCount: number;
    completedAppointmentsCount: number;
    bookingsCount: number;
    clientsBookedCount: number;
    bookedRevenueCents: number;
    expensesCents: number;
    expenseCount: number;
    netAfterExpensesCents: number;
  };
}

export interface BookingRow {
  id: string;
  source: string;
  sourceLabel: string;
  phone: string | null;
  bookedAt: string;
  processed: boolean;
  rawNote: string | null;
  bookedRevenueCents: number | null;
  actualRevenueCents: number | null;
  revenueStatus: string | null;
  squareBookingId: string | null;
  linkedSms: {
    status: string;
    sentAt: string | null;
    converted: boolean;
    trackLabel?: string;
  } | null;
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
  track: ScheduleTrack;
  language: "en" | "fr";
  sequence_number: number;
  days_since_last_detail: number;
  delay_unit: "hours" | "days";
  active: boolean;
  message_body: string | null;
  created_at?: string;
}

export interface EligibleClient {
  clientId: string;
  name: string;
  phone: string | null;
  city: string | null;
  track: ScheduleTrack;
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
  generalAfterMaintenance: EligibleClient[];
}

export interface SmsQueueRow {
  clientId: string;
  name: string;
  phone: string | null;
  city: string | null;
  track: ScheduleTrack;
  trackLabel: string;
  triggerType: string;
  preferredLanguage: "en" | "fr";
  sequenceNumber: number;
  daysSinceLastDetail: number;
  hoursSince?: number;
  elapsedSinceDetail?: string;
  requiredAmount: number;
  delayUnit: "hours" | "days";
  requiredDelayLabel: string;
  requiredDays: number | null;
  daysUntilSend: number | null;
  timeUntilSend: number;
  lastDetailDate: string;
  lastDetailDateFormatted: string;
  lastServiceType: string | null;
  messagePreview: string;
  status: "due_now" | "upcoming";
  sendTiming: string;
  estimatedSendAt: string | null;
  estimatedSendAtLabel: string | null;
}

export interface SmsQueuePreview {
  generatedAt: string;
  inSendWindow: boolean;
  rules: {
    sendWindow: string;
    maxPerHour: number;
    note: string;
  };
  summary: {
    dueNow: number;
    dueNowWillSendThisHour: number;
    upcoming: number;
    eligibleConfirmed: number;
    pausedForAppointments: number;
  };
  dueNow: SmsQueueRow[];
  upcoming: SmsQueueRow[];
}

export interface SendResult {
  ok: boolean;
  result?: { ok: boolean; name: string; reason?: string; smsLogId?: string };
  sentCount?: number;
  failedCount?: number;
}

export interface ManualSmsClient {
  clientId: string;
  name: string | null;
  phone: string | null;
  city: string | null;
  preferredLanguage: "en" | "fr";
  lastServiceType: string | null;
  lastDetailDate: string | null;
  daysSince: number | null;
  smsTrack: "maintenance" | "general" | "general_after_maintenance" | null;
  smsTrackLabel: string;
}

export interface ManualSmsClientsResponse {
  clients: ManualSmsClient[];
  productionSendsEnabled: boolean;
  testPhone: string;
}

export interface ManualBulkSmsResult {
  ok: boolean;
  requested: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  sent: { clientId: string; name: string | null; phone?: string }[];
  failed: { clientId: string; name: string | null; reason?: string }[];
}

export const REFRESH_MS = 60 * 60 * 1000;

/** Appointments tab — syncs from Square on each load; poll more often. */
export const APPOINTMENTS_REFRESH_MS = 15 * 60 * 1000;

export {
  MESSAGE_VARIABLES,
  MESSAGE_VARIABLES_EN,
  MESSAGE_VARIABLES_FR,
} from "../../../lib/message-variables.js";
