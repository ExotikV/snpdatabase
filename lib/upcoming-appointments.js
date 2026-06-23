import { getSupabase } from "./supabase.js";
import { syncSquareAppointments, hasAppointmentsTable } from "./appointment-sync.js";
import { hasRevenueColumns } from "./revenue.js";
import { BOOKING_SOURCE_LABELS, normalizeBookingSource } from "./tracks.js";
import {
  BOOKINGS_LOOKAHEAD_DAYS,
  createSquareClient,
  fetchBookingsInRange,
  getServiceDurationMinutes,
  getServiceType,
  isCancelledBookingStatus,
  resolveServiceNames,
} from "./square-bookings.js";
import { isBookingCompleted } from "./booking-timing.js";

const STATUS_LABELS = {
  ACCEPTED: "Confirmed",
  PENDING: "Pending",
  CANCELLED_BY_CUSTOMER: "Cancelled (client)",
  CANCELLED_BY_SELLER: "Cancelled (seller)",
  DECLINED: "Declined",
  NO_SHOW: "No show",
};

function computeDaysUntil(startAt, now = new Date()) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) return null;
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((startDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)));
}

function formatDaysUntilLabel(daysUntil) {
  if (daysUntil == null) return "—";
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

async function loadClientsById(supabase) {
  const byId = new Map();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, square_customer_id, name, phone, email, city")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      byId.set(row.id, row);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return byId;
}

async function loadBookingAttemptsBySquareId(supabase) {
  const includeRevenue = await hasRevenueColumns(supabase);
  if (!includeRevenue) return new Map();

  const bySquareId = new Map();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select("square_booking_id, source, booked_revenue_cents, revenue_status, phone, booked_at")
      .not("square_booking_id", "is", null)
      .eq("revenue_status", "booked")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (row.square_booking_id) {
        bySquareId.set(row.square_booking_id, row);
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return bySquareId;
}

function mapAppointmentRow({
  squareBookingId,
  client,
  attempt,
  startAt,
  endAt,
  serviceType,
  durationMinutes,
  status,
  customerNote,
  sellerNote,
  catalogPriceCents,
  now,
}) {
  const daysUntil = computeDaysUntil(startAt, now);
  const bookedRevenueCents = attempt?.booked_revenue_cents ?? null;
  const priceCents = bookedRevenueCents ?? catalogPriceCents ?? null;
  const source = attempt?.source ? normalizeBookingSource(attempt.source) : null;

  return {
    squareBookingId,
    clientId: client?.id ?? null,
    clientName: client?.name ?? null,
    phone: client?.phone ?? attempt?.phone ?? null,
    email: client?.email ?? null,
    city: client?.city ?? null,
    startAt,
    endAt: endAt ?? null,
    daysUntil,
    daysUntilLabel: formatDaysUntilLabel(daysUntil),
    serviceType,
    durationMinutes,
    status,
    statusLabel: STATUS_LABELS[status] ?? status ?? "—",
    bookedRevenueCents,
    catalogPriceCents,
    priceCents,
    priceSource: bookedRevenueCents != null ? "website" : catalogPriceCents != null ? "catalog" : null,
    bookingSource: source,
    bookingSourceLabel: source ? (BOOKING_SOURCE_LABELS[source] ?? source) : null,
    customerNote: customerNote ?? null,
    sellerNote: sellerNote ?? null,
  };
}

function buildSummary(appointments, now) {
  const totalPriceCents = appointments.reduce((sum, row) => sum + (row.priceCents ?? 0), 0);
  const withPrice = appointments.filter((row) => row.priceCents != null);
  const thisWeekEnd = new Date(now);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);

  return {
    total: appointments.length,
    totalPriceCents,
    pricedCount: withPrice.length,
    thisWeek: appointments.filter((row) => new Date(row.startAt) < thisWeekEnd).length,
    today: appointments.filter((row) => row.daysUntil === 0).length,
    tomorrow: appointments.filter((row) => row.daysUntil === 1).length,
  };
}

async function getUpcomingFromDatabase(supabase, syncStats) {
  const now = new Date();
  const { data: rows, error } = await supabase
    .from("square_appointments")
    .select(
      "square_booking_id, client_id, start_at, end_at, status, service_type, duration_minutes, customer_note, seller_note, synced_at",
    )
    .order("start_at", { ascending: true });

  if (error) throw error;

  const [clientsById, attemptsBySquareId] = await Promise.all([
    loadClientsById(supabase),
    loadBookingAttemptsBySquareId(supabase),
  ]);

  const appointments = (rows ?? [])
    .filter((row) => {
      if (isCancelledBookingStatus(row.status)) return false;
      if (row.end_at && new Date(row.end_at) <= now) return false;
      return true;
    })
    .map((row) => {
      const client = row.client_id ? clientsById.get(row.client_id) : null;
      const attempt = attemptsBySquareId.get(row.square_booking_id);

      return mapAppointmentRow({
        squareBookingId: row.square_booking_id,
        client,
        attempt,
        startAt: row.start_at,
        endAt: row.end_at,
        serviceType: row.service_type,
        durationMinutes: row.duration_minutes,
        status: row.status,
        customerNote: row.customer_note,
        sellerNote: row.seller_note,
        catalogPriceCents: null,
        now,
      });
    });

  return {
    generatedAt: now.toISOString(),
    syncedAt: syncStats?.syncedAt ?? now.toISOString(),
    lookaheadDays: BOOKINGS_LOOKAHEAD_DAYS,
    syncStats,
    summary: buildSummary(appointments, now),
    appointments,
  };
}

async function getUpcomingFromSquareLive() {
  const squareClient = createSquareClient();
  const supabase = getSupabase();
  const now = new Date();

  const bookings = await fetchBookingsInRange(squareClient, {
    lookbackDays: 0,
    lookaheadDays: BOOKINGS_LOOKAHEAD_DAYS,
    now,
  });

  const activeBookings = bookings.filter(
    (booking) =>
      booking.startAt &&
      !isCancelledBookingStatus(booking.status) &&
      !isBookingCompleted(booking, now),
  );

  const [clientsResult, attemptsBySquareId] = await Promise.all([
    supabase.from("clients").select("id, square_customer_id, name, phone, email, city"),
    loadBookingAttemptsBySquareId(supabase),
  ]);

  if (clientsResult.error) throw clientsResult.error;

  const clientsBySquareId = new Map(
    (clientsResult.data ?? [])
      .filter((row) => row.square_customer_id)
      .map((row) => [row.square_customer_id, row]),
  );

  const catalogById = await resolveServiceNames(
    squareClient,
    activeBookings.flatMap((booking) =>
      (booking.appointmentSegments ?? []).map((segment) => segment.serviceVariationId),
    ),
  );

  const appointments = activeBookings
    .map((booking) => {
      const client = booking.customerId ? clientsBySquareId.get(booking.customerId) : null;
      const attempt = booking.id ? attemptsBySquareId.get(booking.id) : null;

      return mapAppointmentRow({
        squareBookingId: booking.id,
        client,
        attempt,
        startAt: booking.startAt,
        endAt: null,
        serviceType: getServiceType(booking, catalogById),
        durationMinutes: getServiceDurationMinutes(booking),
        status: booking.status,
        customerNote: booking.customerNote,
        sellerNote: booking.sellerNote,
        catalogPriceCents: null,
        now,
      });
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  return {
    generatedAt: now.toISOString(),
    syncedAt: now.toISOString(),
    lookaheadDays: BOOKINGS_LOOKAHEAD_DAYS,
    syncStats: null,
    summary: buildSummary(appointments, now),
    appointments,
  };
}

/**
 * Sync Square appointments then return upcoming rows from the database.
 */
export async function getUpcomingAppointments({ syncMode = "hourly" } = {}) {
  const supabase = getSupabase();
  let syncStats = null;

  try {
    syncStats = await syncSquareAppointments(supabase, { mode: syncMode });
  } catch (error) {
    console.error(
      "[upcoming-appointments] Sync failed:",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (await hasAppointmentsTable(supabase)) {
    return getUpcomingFromDatabase(supabase, syncStats);
  }

  return getUpcomingFromSquareLive();
}

export { syncSquareAppointments };
