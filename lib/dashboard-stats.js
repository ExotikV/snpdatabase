import { hasRevenueColumns, isSmsBookingSource, sumRevenueCents } from "./revenue.js";
import { getSmsDashboardStats } from "./sms-stats.js";
import {
  BOOKING_SOURCE_LABELS,
  BOOKING_SOURCE_TO_TRIGGER,
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

function buildRevenueSummary(attempts, includeRevenue) {
  if (!includeRevenue) {
    return {
      bookedCents: 0,
      actualCents: 0,
      pendingBookedCents: 0,
      bySmsSource: {},
    };
  }

  const smsAttempts = attempts.filter((row) => isSmsBookingSource(row.source));
  const bookedCents = sumRevenueCents(attempts, "booked_revenue_cents");
  const actualCents = sumRevenueCents(attempts, "actual_revenue_cents", { realizedOnly: true });
  const pendingBookedCents = sumRevenueCents(
    attempts.filter((row) => row.revenue_status === "booked"),
    "booked_revenue_cents",
  );

  const bySmsSource = {};
  for (const source of Object.keys(BOOKING_SOURCE_TO_TRIGGER)) {
    const sourceRows = smsAttempts.filter(
      (row) => normalizeBookingSource(row.source) === source,
    );
    bySmsSource[source] = {
      bookings: sourceRows.length,
      bookedCents: sumRevenueCents(sourceRows, "booked_revenue_cents"),
      actualCents: sumRevenueCents(sourceRows, "actual_revenue_cents", { realizedOnly: true }),
    };
  }

  return { bookedCents, actualCents, pendingBookedCents, bySmsSource };
}

function enrichSmsByTrack(sms, revenueSummary) {
  return sms.byTrack.map((track) => {
    const source = TRIGGER_TO_BOOKING_SOURCE[track.triggerType];
    const revenue = source ? revenueSummary.bySmsSource[source] : null;

    const conversionRate =
      track.sent > 0 ? Math.round((track.converted / track.sent) * 1000) / 10 : 0;

    return {
      ...track,
      bookings: revenue?.bookings ?? track.converted,
      conversionRate,
      bookedCents: revenue?.bookedCents ?? 0,
      actualCents: revenue?.actualCents ?? 0,
    };
  });
}

export async function getDashboardStats(supabase) {
  const [{ rows: attempts, includeRevenue }, sms] = await Promise.all([
    fetchAllBookingAttempts(supabase),
    getSmsDashboardStats(supabase),
  ]);

  const revenue = buildRevenueSummary(attempts, includeRevenue);
  const smsByTrack = enrichSmsByTrack(sms, revenue);

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
      byTrack: smsByTrack,
    },
  };
}
