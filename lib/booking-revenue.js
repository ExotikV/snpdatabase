import { resolveSmsLogId } from "./booking-url.js";
import { toDateInputValue } from "./dates.js";
import { hasRevenueColumns } from "./revenue.js";
import { createSquareClient } from "./square-bookings.js";
import { fetchSquareMonthlyRevenue, fetchSquarePeriodRevenue } from "./square-order-revenue.js";
import { resolveTipPeriodBounds, TIP_PERIOD_OPTIONS } from "./tips.js";
import { BOOKING_SOURCE_LABELS, TRIGGER_LABELS, normalizeBookingSource } from "./tracks.js";

const PAGE_SIZE = 1000;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function isInstantInBounds(iso, bounds) {
  if (!bounds?.start || !bounds?.end || !iso) return true;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  return time >= new Date(bounds.start).getTime() && time < new Date(bounds.end).getTime();
}

async function fetchAllBookingAttempts(supabase, includeRevenue) {
  const select = includeRevenue
    ? "id, source, phone, booked_at, processed, ref, raw_note, booked_revenue_cents, actual_revenue_cents, revenue_status, square_booking_id, revenue_realized_at"
    : "id, source, phone, booked_at, processed, ref, raw_note";

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

async function loadSmsRefMaps(supabase, attempts) {
  const smsLogIds = new Set();
  const refToSmsLogId = new Map();

  for (const row of attempts) {
    if (!row.ref) continue;
    const smsLogId = await resolveSmsLogId(supabase, row.ref);
    if (!smsLogId) continue;
    refToSmsLogId.set(row.ref, smsLogId);
    smsLogIds.add(smsLogId);
  }

  let smsById = new Map();
  if (smsLogIds.size > 0) {
    const { data, error } = await supabase
      .from("sms_log")
      .select("id, status, sent_at, converted, trigger_type")
      .in("id", [...smsLogIds]);

    if (error) throw error;
    smsById = new Map((data ?? []).map((row) => [row.id, row]));
  }

  return { refToSmsLogId, smsById };
}

function mapBookingRow(row, { refToSmsLogId, smsById, includeRevenue }) {
  const source = normalizeBookingSource(row.source);
  const smsLogId = row.ref ? refToSmsLogId.get(row.ref) : null;
  const linkedSms = smsLogId ? smsById.get(smsLogId) : null;

  return {
    id: row.id,
    source,
    sourceLabel: BOOKING_SOURCE_LABELS[source] ?? source,
    phone: row.phone,
    bookedAt: row.booked_at,
    processed: row.processed,
    rawNote: row.raw_note,
    bookedRevenueCents: includeRevenue ? row.booked_revenue_cents : null,
    actualRevenueCents: includeRevenue ? row.actual_revenue_cents : null,
    revenueStatus: includeRevenue ? row.revenue_status : null,
    revenueRealizedAt: includeRevenue ? row.revenue_realized_at : null,
    squareBookingId: includeRevenue ? row.square_booking_id : null,
    linkedSms: linkedSms
      ? {
          status: linkedSms.status,
          sentAt: linkedSms.sent_at,
          converted: linkedSms.converted,
          trackLabel: TRIGGER_LABELS[linkedSms.trigger_type] ?? linkedSms.trigger_type,
        }
      : null,
  };
}

function summarizeBookings(rows) {
  const bookingCount = rows.length;
  const uniqueClients = new Set(rows.map((row) => row.phone).filter(Boolean)).size;
  const bookedCents = rows.reduce((sum, row) => {
    const value = row.bookedRevenueCents;
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const actualCents = rows.reduce((sum, row) => {
    if (row.revenueStatus !== "realized") return sum;
    const value = row.actualRevenueCents;
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const pendingBookedCents = rows.reduce((sum, row) => {
    if (row.revenueStatus !== "booked") return sum;
    const value = row.bookedRevenueCents;
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
  const cancelledCount = rows.filter((row) => row.revenueStatus === "cancelled").length;

  return {
    bookingCount,
    uniqueClients,
    bookedCents,
    actualCents,
    pendingBookedCents,
    cancelledCount,
  };
}

async function fetchBookingsForYearByMonth(supabase, year, includeRevenue, squareMonthlyBuckets) {
  const start = `${year}-01-01T00:00:00.000Z`;
  const end = `${year + 1}-01-01T00:00:00.000Z`;

  const { data, error } = await supabase
    .from("booking_attempts")
    .select(includeRevenue ? "booked_at, booked_revenue_cents, revenue_status" : "booked_at")
    .gte("booked_at", start)
    .lt("booked_at", end);

  if (error) throw error;

  const buckets = MONTH_NAMES.map((label, index) => ({
    month: index + 1,
    label,
    bookedCents: 0,
    actualCents: squareMonthlyBuckets?.[index]?.actualCents ?? 0,
    squareOrderCount: squareMonthlyBuckets?.[index]?.orderCount ?? 0,
    bookingCount: 0,
  }));

  for (const row of data ?? []) {
    const month = Number(String(row.booked_at).slice(5, 7));
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    const bucket = buckets[month - 1];
    bucket.bookingCount += 1;
    if (includeRevenue && Number.isFinite(row.booked_revenue_cents)) {
      bucket.bookedCents += row.booked_revenue_cents;
    }
  }

  return buckets;
}

function formatWeekRangeLabel(bounds) {
  if (!bounds?.start || !bounds?.end) return bounds?.label ?? "This week";

  const startYmd = toDateInputValue(bounds.start);
  const endInclusive = new Date(bounds.end);
  endInclusive.setUTCDate(endInclusive.getUTCDate() - 1);
  const endYmd = toDateInputValue(endInclusive);

  const format = (ymd) =>
    new Date(`${ymd}T12:00:00`).toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
    });

  return `${bounds.label} (${format(startYmd)} – ${format(endYmd)})`;
}

export async function getBookingRevenueDashboard(supabase, { period = "this_month", year } = {}) {
  const includeRevenue = await hasRevenueColumns(supabase);
  const bounds = resolveTipPeriodBounds(period);
  const allAttempts = await fetchAllBookingAttempts(supabase, includeRevenue);
  const periodAttempts = allAttempts.filter((row) => isInstantInBounds(row.booked_at, bounds));
  const { refToSmsLogId, smsById } = await loadSmsRefMaps(supabase, periodAttempts);
  const bookings = periodAttempts.map((row) =>
    mapBookingRow(row, { refToSmsLogId, smsById, includeRevenue }),
  );
  const stats = summarizeBookings(bookings);
  const currentYear = year ?? new Date().getFullYear();
  let squareRevenueUnavailable = false;
  let squareOrderCount = 0;
  let monthlyBreakdown;

  if (includeRevenue) {
    const squareClient = createSquareClient();
    const [squarePeriod, squareMonthly] = await Promise.all([
      fetchSquarePeriodRevenue(squareClient, bounds),
      fetchSquareMonthlyRevenue(squareClient, currentYear),
    ]);
    stats.actualCents = squarePeriod.totalCents;
    squareOrderCount = squarePeriod.orderCount;
    squareRevenueUnavailable = squarePeriod.unavailable || squareMonthly.unavailable;
    monthlyBreakdown = await fetchBookingsForYearByMonth(
      supabase,
      currentYear,
      includeRevenue,
      squareMonthly.buckets,
    );
  } else {
    monthlyBreakdown = await fetchBookingsForYearByMonth(
      supabase,
      currentYear,
      includeRevenue,
      null,
    );
  }

  return {
    migrationRequired: !includeRevenue,
    squareRevenueUnavailable,
    period: bounds.period,
    periodLabel: bounds.label,
    stats: { ...stats, squareOrderCount },
    monthlyBreakdown,
    bookings,
    availablePeriods: TIP_PERIOD_OPTIONS,
    year: currentYear,
  };
}

export { formatWeekRangeLabel, isInstantInBounds, MONTH_NAMES };
