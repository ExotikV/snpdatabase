import { syncSquareAppointments, hasAppointmentsTable } from "./appointment-sync.js";
import { formatWeekRangeLabel } from "./booking-revenue.js";
import { toDateInputValue } from "./dates.js";
import { probeExpensesTables } from "./expenses.js";
import { hasRevenueColumns, sumRevenueCents } from "./revenue.js";
import { resolveTipPeriodBounds } from "./tips.js";
import { isCancelledBookingStatus } from "./square-bookings.js";

const PAGE_SIZE = 1000;

function getYmdRangeFromBounds(bounds) {
  if (!bounds?.start || !bounds?.end) return null;
  return {
    startYmd: toDateInputValue(bounds.start),
    endExclusiveYmd: toDateInputValue(bounds.end),
  };
}

function isInstantInBounds(iso, bounds) {
  if (!bounds?.start || !bounds?.end || !iso) return false;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return time >= new Date(bounds.start).getTime() && time < new Date(bounds.end).getTime();
}

/** Completed = appointment end time is in the past. */
function isAppointmentCompleted(row, now) {
  if (!row.end_at) return false;
  const endAt = new Date(row.end_at);
  if (Number.isNaN(endAt.getTime())) return false;
  return endAt <= now;
}

function getAppointmentPriceCents(attempt) {
  if (
    attempt?.revenue_status === "realized" &&
    Number.isFinite(attempt.actual_revenue_cents)
  ) {
    return attempt.actual_revenue_cents;
  }
  if (Number.isFinite(attempt?.booked_revenue_cents)) {
    return attempt.booked_revenue_cents;
  }
  return null;
}

async function fetchBookingAttemptsForOverview(supabase, includeRevenue) {
  const select = includeRevenue
    ? "id, phone, booked_at, booked_revenue_cents, actual_revenue_cents, revenue_status"
    : "id, phone, booked_at";

  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select(select)
      .order("booked_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function sumExpensesForBounds(supabase, bounds) {
  const probe = await probeExpensesTables(supabase);
  if (!probe.ready) {
    return { totalCents: 0, expenseCount: 0, migrationRequired: probe.missing !== false };
  }

  const range = getYmdRangeFromBounds(bounds);
  if (!range) {
    return { totalCents: 0, expenseCount: 0, migrationRequired: false };
  }

  const { data, error } = await supabase
    .from("expenses")
    .select("amount_cents")
    .gte("expense_date", range.startYmd)
    .lt("expense_date", range.endExclusiveYmd);

  if (error) throw error;

  const expenseCount = data?.length ?? 0;
  const totalCents = (data ?? []).reduce((sum, row) => sum + (row.amount_cents ?? 0), 0);
  return { totalCents, expenseCount, migrationRequired: false };
}

async function loadAttemptsBySquareId(supabase) {
  const includeRevenue = await hasRevenueColumns(supabase);
  if (!includeRevenue) return new Map();

  const bySquareId = new Map();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select("square_booking_id, booked_revenue_cents, actual_revenue_cents, revenue_status")
      .not("square_booking_id", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (row.square_booking_id) {
        bySquareId.set(row.square_booking_id, row);
      }
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return bySquareId;
}

async function getCompletedWeekRevenue(supabase, bounds, now = new Date()) {
  const { data, error } = await supabase
    .from("details_completed")
    .select("square_booking_id, completed_at")
    .gte("completed_at", bounds.start)
    .lt("completed_at", bounds.end);

  if (error) throw error;

  const attemptsBySquareId = await loadAttemptsBySquareId(supabase);
  const seenBookingIds = new Set();
  let actualRevenueCents = 0;
  let completedCount = 0;

  for (const row of data ?? []) {
    const completedAt = row.completed_at ? new Date(row.completed_at) : null;
    if (!completedAt || Number.isNaN(completedAt.getTime()) || completedAt > now) continue;

    if (row.square_booking_id) {
      if (seenBookingIds.has(row.square_booking_id)) continue;
      seenBookingIds.add(row.square_booking_id);
    }

    completedCount += 1;
    const attempt = row.square_booking_id
      ? attemptsBySquareId.get(row.square_booking_id)
      : null;
    const priceCents = getAppointmentPriceCents(attempt);
    if (priceCents != null) actualRevenueCents += priceCents;
  }

  return { actualRevenueCents, completedCount };
}

async function getRemainingWeekRevenue(supabase, bounds, now = new Date()) {
  if (!(await hasAppointmentsTable(supabase))) {
    return { remainingRevenueCents: 0, remainingCount: 0 };
  }

  const { data, error } = await supabase
    .from("square_appointments")
    .select("square_booking_id, start_at, end_at, status")
    .gte("start_at", bounds.start)
    .lt("start_at", bounds.end)
    .order("start_at", { ascending: true });

  if (error) throw error;

  const attemptsBySquareId = await loadAttemptsBySquareId(supabase);
  let remainingRevenueCents = 0;
  let remainingCount = 0;

  for (const row of data ?? []) {
    if (isCancelledBookingStatus(row.status)) continue;
    if (isAppointmentCompleted(row, now)) continue;

    remainingCount += 1;
    const attempt = attemptsBySquareId.get(row.square_booking_id);
    const priceCents = getAppointmentPriceCents(attempt);
    if (priceCents != null) remainingRevenueCents += priceCents;
  }

  return { remainingRevenueCents, remainingCount };
}

async function getWeekAppointmentRevenue(supabase, bounds, now = new Date()) {
  const [completed, remaining] = await Promise.all([
    getCompletedWeekRevenue(supabase, bounds, now),
    getRemainingWeekRevenue(supabase, bounds, now),
  ]);

  return {
    actualRevenueCents: completed.actualRevenueCents,
    completedCount: completed.completedCount,
    remainingRevenueCents: remaining.remainingRevenueCents,
    remainingCount: remaining.remainingCount,
  };
}

export async function getWeeklyOverview(supabase, { syncFirst = true } = {}) {
  if (syncFirst) {
    try {
      await syncSquareAppointments(supabase, { mode: "hourly" });
    } catch (error) {
      console.error(
        "[weekly-overview] Appointment sync failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const now = new Date();
  const bounds = resolveTipPeriodBounds("this_week", now);
  const includeRevenue = await hasRevenueColumns(supabase);
  const attempts = await fetchBookingAttemptsForOverview(supabase, includeRevenue);

  const newBookingsThisWeek = attempts.filter((row) => isInstantInBounds(row.booked_at, bounds));
  const bookedRevenueCents = includeRevenue
    ? sumRevenueCents(newBookingsThisWeek, "booked_revenue_cents")
    : 0;
  const bookingsCount = newBookingsThisWeek.length;
  const clientsBookedCount = new Set(newBookingsThisWeek.map((row) => row.phone).filter(Boolean))
    .size;

  const appointmentStats = includeRevenue
    ? await getWeekAppointmentRevenue(supabase, bounds, now)
    : {
        actualRevenueCents: 0,
        completedCount: 0,
        remainingRevenueCents: 0,
        remainingCount: 0,
      };

  const expenses = await sumExpensesForBounds(supabase, bounds);
  const netAfterExpensesCents = appointmentStats.actualRevenueCents - expenses.totalCents;

  return {
    generatedAt: now.toISOString(),
    weekLabel: formatWeekRangeLabel(bounds),
    periodStart: bounds.start,
    periodEnd: bounds.end,
    revenueMigrationRequired: !includeRevenue,
    expensesMigrationRequired: expenses.migrationRequired,
    stats: {
      actualRevenueCents: appointmentStats.actualRevenueCents,
      remainingRevenueCents: appointmentStats.remainingRevenueCents,
      appointmentsRemainingCount: appointmentStats.remainingCount,
      completedAppointmentsCount: appointmentStats.completedCount,
      bookingsCount,
      clientsBookedCount,
      bookedRevenueCents,
      expensesCents: expenses.totalCents,
      expenseCount: expenses.expenseCount,
      netAfterExpensesCents,
    },
  };
}
