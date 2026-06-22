const PAGE_SIZE = 1000;

const CANCELLED_BOOKING_STATUSES = new Set([
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
  "DECLINED",
  "NO_SHOW",
]);

const SMS_BOOKING_SOURCES = [
  "sms_reminder",
  "general_reminder",
  "general_after_maintenance_reminder",
];

let revenueColumnsExist = null;

export async function hasRevenueColumns(supabase) {
  if (revenueColumnsExist !== null) {
    return revenueColumnsExist;
  }

  const { error } = await supabase.from("booking_attempts").select("booked_revenue_cents").limit(1);
  revenueColumnsExist = !error;
  return revenueColumnsExist;
}

function isCancelledBookingStatus(status) {
  return CANCELLED_BOOKING_STATUSES.has(status);
}

function getBookingStartAt(booking) {
  if (!booking?.startAt) return null;
  const startAt = new Date(booking.startAt);
  return Number.isNaN(startAt.getTime()) ? null : startAt;
}

function isPastBooking(booking, now) {
  const startAt = getBookingStartAt(booking);
  return startAt != null && startAt < now;
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
 * Actual revenue uses booked_revenue_cents once the detail is in the past and not cancelled.
 */
export async function syncBookingAttemptRevenue(supabase, squareBookings, now = new Date()) {
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
    if (!booking) continue;

    if (isCancelledBookingStatus(booking.status)) {
      const { error } = await supabase
        .from("booking_attempts")
        .update({
          revenue_status: "cancelled",
          actual_revenue_cents: null,
          revenue_realized_at: null,
        })
        .eq("id", attempt.id);

      if (!error) cancelled += 1;
      continue;
    }

    if (!isPastBooking(booking, now)) continue;

    const bookedRevenue = Number.isFinite(attempt.booked_revenue_cents)
      ? attempt.booked_revenue_cents
      : null;

    const { error } = await supabase
      .from("booking_attempts")
      .update({
        revenue_status: "realized",
        actual_revenue_cents: bookedRevenue,
        revenue_realized_at: booking.startAt ?? now.toISOString(),
      })
      .eq("id", attempt.id);

    if (!error) realized += 1;
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
