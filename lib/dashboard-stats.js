import { hasRevenueColumns, sumRevenueCents } from "./revenue.js";
import { getSmsDashboardStats } from "./sms-stats.js";
import {
  BOOKING_SOURCE_LABELS,
  BOOKING_SOURCE_TO_TRIGGER,
  QR_BOOKING_SOURCES,
  TRACKED_BOOKING_SOURCES,
  TRIGGER_TO_BOOKING_SOURCE,
  emptyBookingTrendRow,
  normalizeBookingSource,
} from "./tracks.js";

const PAGE_SIZE = 1000;

async function fetchAllBookingAttempts(supabase) {
  const includeRevenue = await hasRevenueColumns(supabase);
  const select = includeRevenue
    ? "id, source, booked_at, booked_revenue_cents, actual_revenue_cents, revenue_status, square_booking_id, ref"
    : "id, source, booked_at, ref";

  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select(select)
      .order("booked_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { rows, includeRevenue };
}

function buildBookingCountsBySource(attempts) {
  const countSources = [
    ...Object.keys(BOOKING_SOURCE_TO_TRIGGER),
    ...QR_BOOKING_SOURCES,
    "qr_code",
  ];
  const counts = Object.fromEntries(countSources.map((source) => [source, 0]));

  for (const row of attempts) {
    const source = normalizeBookingSource(row.source);
    if (source in counts) {
      counts[source] += 1;
    }
  }

  return counts;
}

function buildRevenueSummary(attempts, includeRevenue, bookingCounts) {
  const bySmsSource = {};
  for (const source of Object.keys(BOOKING_SOURCE_TO_TRIGGER)) {
    const sourceRows = attempts.filter(
      (row) => normalizeBookingSource(row.source) === source,
    );
    bySmsSource[source] = {
      bookings: bookingCounts[source] ?? 0,
      bookedCents: includeRevenue ? sumRevenueCents(sourceRows, "booked_revenue_cents") : 0,
      actualCents: includeRevenue
        ? sumRevenueCents(sourceRows, "actual_revenue_cents", { realizedOnly: true })
        : 0,
    };
  }

  if (!includeRevenue) {
    return {
      bookedCents: 0,
      actualCents: 0,
      pendingBookedCents: 0,
      bySmsSource,
    };
  }

  const bookedCents = sumRevenueCents(attempts, "booked_revenue_cents");
  const actualCents = sumRevenueCents(attempts, "actual_revenue_cents", { realizedOnly: true });
  const pendingBookedCents = sumRevenueCents(
    attempts.filter((row) => row.revenue_status === "booked"),
    "booked_revenue_cents",
  );

  return { bookedCents, actualCents, pendingBookedCents, bySmsSource };
}

function calcConversionRate(bookings, sent) {
  if (!sent || sent <= 0) return null;
  return Math.round((bookings / sent) * 1000) / 10;
}

function enrichSmsByTrack(sms, revenueSummary) {
  return sms.byTrack.map((track) => {
    const source = TRIGGER_TO_BOOKING_SOURCE[track.triggerType];
    const revenue = source ? revenueSummary.bySmsSource[source] : null;
    const bookings = revenue?.bookings ?? 0;

    return {
      ...track,
      bookings,
      conversionRate: calcConversionRate(bookings, track.sent),
      bookedCents: revenue?.bookedCents ?? 0,
      actualCents: revenue?.actualCents ?? 0,
    };
  });
}

function buildQrPerformanceRow(source, bookingCounts, attempts, includeRevenue) {
  const qrRows = attempts.filter((row) => normalizeBookingSource(row.source) === source);

  return {
    triggerType: source,
    label: BOOKING_SOURCE_LABELS[source] ?? source,
    sent: 0,
    failed: 0,
    converted: 0,
    bookings: bookingCounts[source] ?? 0,
    conversionRate: null,
    bookedCents: includeRevenue ? sumRevenueCents(qrRows, "booked_revenue_cents") : 0,
    actualCents: includeRevenue
      ? sumRevenueCents(qrRows, "actual_revenue_cents", { realizedOnly: true })
      : 0,
  };
}

function buildQrPerformanceRows(bookingCounts, attempts, includeRevenue) {
  const sources = [...QR_BOOKING_SOURCES];
  if ((bookingCounts.qr_code ?? 0) > 0) {
    sources.push("qr_code");
  }

  return sources.map((source) =>
    buildQrPerformanceRow(source, bookingCounts, attempts, includeRevenue),
  );
}

export async function getDashboardStats(supabase) {
  const [{ rows: attempts, includeRevenue }, sms] = await Promise.all([
    fetchAllBookingAttempts(supabase),
    getSmsDashboardStats(supabase),
  ]);

  const bookingCounts = buildBookingCountsBySource(attempts);
  const revenue = buildRevenueSummary(attempts, includeRevenue, bookingCounts);
  const smsByTrack = enrichSmsByTrack(sms, revenue);
  const qrPerformance = buildQrPerformanceRows(bookingCounts, attempts, includeRevenue);

  const totalSmsBookings = Object.keys(BOOKING_SOURCE_TO_TRIGGER).reduce(
    (sum, source) => sum + (bookingCounts[source] ?? 0),
    0,
  );

  const sourceCounts = emptyBookingTrendRow();
  const sourceRevenue = Object.fromEntries(
    [...TRACKED_BOOKING_SOURCES, "other"].map((source) => [
      source,
      { bookedCents: 0, actualCents: 0 },
    ]),
  );
  const trendByDay = {};

  for (const row of attempts) {
    const source = normalizeBookingSource(row.source);
    sourceCounts[source] += 1;

    if (includeRevenue) {
      if (Number.isFinite(row.booked_revenue_cents)) {
        sourceRevenue[source].bookedCents += row.booked_revenue_cents;
      }
      if (row.revenue_status === "realized" && Number.isFinite(row.actual_revenue_cents)) {
        sourceRevenue[source].actualCents += row.actual_revenue_cents;
      }
    }

    const day = row.booked_at?.slice(0, 10);
    if (day) {
      if (!trendByDay[day]) {
        trendByDay[day] = emptyBookingTrendRow();
      }
      trendByDay[day][source] += 1;
    }
  }

  const totalBookings = attempts.length;

  const bySource = [...TRACKED_BOOKING_SOURCES, "other"].map((source) => ({
    source,
    label: BOOKING_SOURCE_LABELS[source] ?? (source === "other" ? "Other" : source),
    count: sourceCounts[source],
    percentage:
      totalBookings > 0 ? Math.round((sourceCounts[source] / totalBookings) * 1000) / 10 : 0,
    bookedCents: sourceRevenue[source].bookedCents,
    actualCents: sourceRevenue[source].actualCents,
  }));

  const trend = Object.entries(trendByDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  return {
    totalBookings,
    bySource,
    trend,
    revenue: {
      ...revenue,
      migrationRequired: !includeRevenue,
    },
    sms: {
      ...sms,
      converted: totalSmsBookings,
      conversionRate: calcConversionRate(totalSmsBookings, sms.sent) ?? 0,
      byTrack: [...smsByTrack, ...qrPerformance],
    },
  };
}
