import { getBookingCompletedAtIso, getBookingEndAt, isBookingCompleted } from "./booking-timing.js";
import { correctRealizedRevenue, syncBookingAttemptRevenue } from "./revenue.js";
import { markBookingAttemptCancelled, syncSquareBookingAttempt } from "./square-booking-attempts.js";
import { resolveSquareBookingRevenue } from "./square-order-revenue.js";
import {
  BOOKINGS_LOOKAHEAD_DAYS,
  createSquareClient,
  fetchBookingsByIds,
  fetchBookingsInRange,
  getServiceDurationMinutes,
  getServiceType,
  isCancelledBookingStatus,
  mergeBookingsById,
  resolveCatalogById,
} from "./square-bookings.js";

const HOURLY_LOOKBACK_DAYS = 7;
const FULL_LOOKBACK_DAYS = 365;

let appointmentsTableExists = null;

export async function hasAppointmentsTable(supabase) {
  if (appointmentsTableExists !== null) {
    return appointmentsTableExists;
  }

  const { error } = await supabase.from("square_appointments").select("square_booking_id").limit(1);
  appointmentsTableExists = !error;
  return appointmentsTableExists;
}

async function loadClientMap(supabase) {
  const clientMap = new Map();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, square_customer_id, phone, preferred_language")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (row.square_customer_id) {
        clientMap.set(row.square_customer_id, row);
      }
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return clientMap;
}

async function fetchPendingAttemptBookingIds(supabase) {
  const ids = new Set();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select("square_booking_id")
      .not("square_booking_id", "is", null)
      .eq("revenue_status", "booked")
      .range(from, from + pageSize - 1);

    if (error) {
      if (error.code === "42703") return [];
      throw error;
    }
    if (!data?.length) break;

    for (const row of data) {
      if (row.square_booking_id) ids.add(row.square_booking_id);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return [...ids];
}

async function removeAppointmentArtifacts(supabase, squareBookingId) {
  const stats = { upcomingRemoved: 0, detailsRemoved: 0 };

  if (await hasAppointmentsTable(supabase)) {
    const { error, count } = await supabase
      .from("square_appointments")
      .delete({ count: "exact" })
      .eq("square_booking_id", squareBookingId);

    if (!error && count) stats.upcomingRemoved = count;
  }

  const { error: detailError, count: detailCount } = await supabase
    .from("details_completed")
    .delete({ count: "exact" })
    .eq("square_booking_id", squareBookingId);

  if (!detailError && detailCount) stats.detailsRemoved = detailCount;

  return stats;
}

async function upsertUpcomingAppointment(
  supabase,
  booking,
  clientId,
  serviceType,
  syncedAt,
) {
  if (!(await hasAppointmentsTable(supabase))) {
    return false;
  }

  const endAt = getBookingEndAt(booking);
  const { error } = await supabase.from("square_appointments").upsert(
    {
      square_booking_id: booking.id,
      client_id: clientId,
      square_customer_id: booking.customerId ?? null,
      start_at: booking.startAt,
      end_at: endAt?.toISOString() ?? null,
      status: booking.status ?? "UNKNOWN",
      service_type: serviceType,
      duration_minutes: getServiceDurationMinutes(booking),
      customer_note: booking.customerNote ?? null,
      seller_note: booking.sellerNote ?? null,
      synced_at: syncedAt,
    },
    { onConflict: "square_booking_id" },
  );

  if (error) throw error;
  return true;
}

async function upsertCompletedDetail(supabase, booking, clientId, serviceType) {
  const { error } = await supabase.from("details_completed").upsert(
    {
      client_id: clientId,
      square_booking_id: booking.id,
      service_type: serviceType,
      completed_at: getBookingCompletedAtIso(booking),
    },
    { onConflict: "square_booking_id" },
  );

  if (error) throw error;
}

async function removeUpcomingAppointment(supabase, squareBookingId) {
  if (!(await hasAppointmentsTable(supabase))) return 0;

  const { error, count } = await supabase
    .from("square_appointments")
    .delete({ count: "exact" })
    .eq("square_booking_id", squareBookingId);

  if (error) throw error;
  return count ?? 0;
}

async function removeStaleUpcomingAppointments(supabase, activeUpcomingIds, syncedAt) {
  if (!(await hasAppointmentsTable(supabase))) return 0;

  const { data, error } = await supabase
    .from("square_appointments")
    .select("square_booking_id");

  if (error) throw error;

  const staleIds = (data ?? [])
    .map((row) => row.square_booking_id)
    .filter((id) => id && !activeUpcomingIds.has(id));

  if (staleIds.length === 0) return 0;

  const { error: deleteError, count } = await supabase
    .from("square_appointments")
    .delete({ count: "exact" })
    .in("square_booking_id", staleIds);

  if (deleteError) throw deleteError;
  return count ?? 0;
}

/**
 * Reconcile Square bookings with upcoming appointments, completed details, and revenue.
 * @param {{ mode?: 'hourly' | 'full' }} options
 */
export async function syncSquareAppointments(supabase, { mode = "hourly" } = {}) {
  const squareClient = createSquareClient();
  const now = new Date();
  const syncedAt = now.toISOString();
  const lookbackDays = mode === "full" ? FULL_LOOKBACK_DAYS : HOURLY_LOOKBACK_DAYS;

  const stats = {
    mode,
    lookbackDays,
    lookaheadDays: BOOKINGS_LOOKAHEAD_DAYS,
    bookingsFetched: 0,
    bookingsSupplemental: 0,
    cancelledCleaned: 0,
    upcomingUpserted: 0,
    upcomingRemoved: 0,
    staleUpcomingRemoved: 0,
    detailsUpserted: 0,
    detailsRemoved: 0,
    bookingErrors: 0,
    revenueRealized: 0,
    revenueCancelled: 0,
    revenueCorrected: 0,
    revenueMatched: 0,
    manualBookingsCreated: 0,
    manualBookingsUpdated: 0,
    syncedAt,
  };

  let bookings = await fetchBookingsInRange(squareClient, {
    lookbackDays,
    lookaheadDays: BOOKINGS_LOOKAHEAD_DAYS,
    now,
  });
  stats.bookingsFetched = bookings.length;

  const bookingIds = new Set(bookings.map((booking) => booking.id).filter(Boolean));
  const pendingAttemptIds = await fetchPendingAttemptBookingIds(supabase);
  const missingIds = pendingAttemptIds.filter((id) => !bookingIds.has(id));

  if (missingIds.length > 0) {
    const supplemental = await fetchBookingsByIds(squareClient, missingIds);
    stats.bookingsSupplemental = supplemental.length;
    bookings = mergeBookingsById(bookings, supplemental);
  }

  const clientMap = await loadClientMap(supabase);
  const catalogById = await resolveCatalogById(
    squareClient,
    bookings.flatMap((booking) =>
      (booking.appointmentSegments ?? []).map((segment) => segment.serviceVariationId),
    ),
  );

  const revenueByBookingId = await resolveSquareBookingRevenue(squareClient, bookings);
  stats.revenueMatched = revenueByBookingId.size;

  const activeUpcomingIds = new Set();

  for (const booking of bookings) {
    if (!booking.id) continue;

    const serviceType = getServiceType(booking, catalogById);
    const clientRecord = booking.customerId ? clientMap.get(booking.customerId) : null;
    const clientId = clientRecord?.id ?? null;

    if (isCancelledBookingStatus(booking.status)) {
      try {
        await markBookingAttemptCancelled(supabase, booking.id, now);
        const removed = await removeAppointmentArtifacts(supabase, booking.id);
        stats.cancelledCleaned += 1;
        stats.upcomingRemoved += removed.upcomingRemoved;
        stats.detailsRemoved += removed.detailsRemoved;
      } catch (error) {
        stats.bookingErrors += 1;
        console.error(
          `[appointment-sync] Cancel cleanup error (${booking.id}):`,
          error instanceof Error ? error.message : String(error),
        );
      }
      continue;
    }

    if (isBookingCompleted(booking, now)) {
      if (!clientId) {
        stats.bookingErrors += 1;
        continue;
      }

      try {
        await upsertCompletedDetail(supabase, booking, clientId, serviceType);
        stats.detailsUpserted += 1;
        stats.upcomingRemoved += await removeUpcomingAppointment(supabase, booking.id);
        const attemptResult = await syncSquareBookingAttempt(supabase, booking, {
          client: clientRecord,
          catalogById,
          revenueByBookingId,
          now,
        });
        if (attemptResult.action === "created") stats.manualBookingsCreated += 1;
        if (attemptResult.action === "updated") stats.manualBookingsUpdated += 1;
      } catch (error) {
        stats.bookingErrors += 1;
        console.error(
          `[appointment-sync] Completed detail error (${booking.id}):`,
          error instanceof Error ? error.message : String(error),
        );
      }
      continue;
    }

    activeUpcomingIds.add(booking.id);

    try {
      const upserted = await upsertUpcomingAppointment(
        supabase,
        booking,
        clientId,
        serviceType,
        syncedAt,
      );
      if (upserted) stats.upcomingUpserted += 1;

      const attemptResult = await syncSquareBookingAttempt(supabase, booking, {
        client: clientRecord,
        catalogById,
        revenueByBookingId,
        now,
      });
      if (attemptResult.action === "created") stats.manualBookingsCreated += 1;
      if (attemptResult.action === "updated") stats.manualBookingsUpdated += 1;
    } catch (error) {
      stats.bookingErrors += 1;
      console.error(
        `[appointment-sync] Upcoming upsert error (${booking.id}):`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  try {
    stats.staleUpcomingRemoved = await removeStaleUpcomingAppointments(
      supabase,
      activeUpcomingIds,
      syncedAt,
    );
    stats.upcomingRemoved += stats.staleUpcomingRemoved;
  } catch (error) {
    stats.bookingErrors += 1;
    console.error(
      "[appointment-sync] Stale upcoming cleanup error:",
      error instanceof Error ? error.message : String(error),
    );
  }

  const revenueStats = await syncBookingAttemptRevenue(supabase, bookings, now, {
    cancelMissingPending: true,
    revenueByBookingId,
  });
  stats.revenueRealized = revenueStats.realized ?? 0;
  stats.revenueCancelled = revenueStats.cancelled ?? 0;

  const correctionStats = await correctRealizedRevenue(supabase, revenueByBookingId, now);
  stats.revenueCorrected = correctionStats.corrected ?? 0;

  return stats;
}

export { HOURLY_LOOKBACK_DAYS, FULL_LOOKBACK_DAYS, BOOKINGS_LOOKAHEAD_DAYS };
