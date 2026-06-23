import { getBookingCompletedAtIso, isBookingCompleted } from "./booking-timing.js";
import { isCancelledBookingStatus } from "./square-bookings.js";

const PAGE_SIZE = 1000;

const SMS_BOOKING_SOURCES = [
  "sms_reminder",
  "general_reminder",
  "general_after_maintenance_reminder",
];

let revenueColumnsExist = null;
let revenueUpdatedColumnExists = null;

async function hasRevenueUpdatedColumn(supabase) {
  if (revenueUpdatedColumnExists !== null) {
    return revenueUpdatedColumnExists;
  }

  const { error } = await supabase.from("booking_attempts").select("revenue_updated_at").limit(1);
  revenueUpdatedColumnExists = !error;
  return revenueUpdatedColumnExists;
}

function revenueStatusPatch(status, now) {
  const patch = { revenue_status: status };
  if (status === "cancelled") {
    patch.actual_revenue_cents = null;
    patch.revenue_realized_at = null;
  }
  return patch;
}

async function applyRevenuePatch(supabase, attemptId, patch, now) {
  const fullPatch = { ...patch };
  if (await hasRevenueUpdatedColumn(supabase)) {
    fullPatch.revenue_updated_at = now.toISOString();
  }

  const { error } = await supabase.from("booking_attempts").update(fullPatch).eq("id", attemptId);
  return !error;
}

export async function hasRevenueColumns(supabase) {
  if (revenueColumnsExist !== null) {
    return revenueColumnsExist;
  }

  const { error } = await supabase.from("booking_attempts").select("booked_revenue_cents").limit(1);
  revenueColumnsExist = !error;
  return revenueColumnsExist;
}

function isPastBooking(booking, now) {
  return isBookingCompleted(booking, now);
}

async function fetchPendingRevenueAttempts(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select("id, square_booking_id, booked_revenue_cents, revenue_status")
      .not("square_booking_id", "is", null)
      .in("revenue_status", ["booked"])
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

/**
 * After Square booking pull, mark booking_attempts as realized or cancelled.
 * When cancelMissingPending is true, pending rows with no Square booking are cancelled (deleted in Square).
 */
export async function syncBookingAttemptRevenue(
  supabase,
  squareBookings,
  now = new Date(),
  { cancelMissingPending = false } = {},
) {
  if (!(await hasRevenueColumns(supabase))) {
    return { updated: 0, realized: 0, cancelled: 0, skipped: true };
  }

  const bookingById = new Map(
    (squareBookings ?? []).filter((booking) => booking?.id).map((booking) => [booking.id, booking]),
  );
  const attempts = await fetchPendingRevenueAttempts(supabase);

  let realized = 0;
  let cancelled = 0;

  for (const attempt of attempts) {
    const booking = bookingById.get(attempt.square_booking_id);

    if (!booking) {
      if (!cancelMissingPending) continue;

      const ok = await applyRevenuePatch(
        supabase,
        attempt.id,
        revenueStatusPatch("cancelled", now),
        now,
      );
      if (ok) cancelled += 1;
      continue;
    }

    if (isCancelledBookingStatus(booking.status)) {
      const ok = await applyRevenuePatch(
        supabase,
        attempt.id,
        revenueStatusPatch("cancelled", now),
        now,
      );
      if (ok) cancelled += 1;
      continue;
    }

    if (!isPastBooking(booking, now)) continue;

    const bookedRevenue = Number.isFinite(attempt.booked_revenue_cents)
      ? attempt.booked_revenue_cents
      : null;

    const ok = await applyRevenuePatch(
      supabase,
      attempt.id,
      {
        revenue_status: "realized",
        actual_revenue_cents: bookedRevenue,
        revenue_realized_at: getBookingCompletedAtIso(booking) ?? now.toISOString(),
      },
      now,
    );

    if (ok) realized += 1;
  }

  return { updated: realized + cancelled, realized, cancelled, skipped: false };
}

export function isSmsBookingSource(source) {
  return SMS_BOOKING_SOURCES.includes((source ?? "").toLowerCase());
}

export function sumRevenueCents(rows, field, { realizedOnly = false } = {}) {
  let total = 0;
  for (const row of rows) {
    if (realizedOnly && row.revenue_status !== "realized") continue;
    const value = row[field];
    if (Number.isFinite(value)) total += value;
  }
  return total;
}

export { SMS_BOOKING_SOURCES };
