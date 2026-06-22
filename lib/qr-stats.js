import { sumRevenueCents } from "./revenue.js";
import { isEligibleCity } from "./service-area.js";
import { BOOKING_SOURCE_LABELS, QR_BOOKING_SOURCES, normalizeBookingSource } from "./tracks.js";

const PAGE_SIZE = 1000;

/** First day QR card conversion tracking counts cards handed out (Thursday, Jun 18 2026). */
export const DEFAULT_QR_CONVERSION_START_DATE = "2026-06-18";

export function getQrConversionStartDateYmd() {
  const raw = process.env.QR_CONVERSION_START_DATE?.trim() || DEFAULT_QR_CONVERSION_START_DATE;
  return raw.slice(0, 10);
}

export function isOnOrAfterQrTrackingStart(isoTimestamp) {
  if (!isoTimestamp) return false;
  return isoTimestamp.slice(0, 10) >= getQrConversionStartDateYmd();
}

/**
 * Service-area cities get a maintenance QR card after each detail; all others get general.
 */
export function classifyDetailForQrCard(city) {
  if (!city?.trim()) return null;
  return isEligibleCity(city) ? "qr_maintenance" : "qr_general";
}

async function fetchCompletedDetailsSince(supabase, startDateYmd) {
  const rows = [];
  let from = 0;
  const startIso = `${startDateYmd}T00:00:00.000Z`;

  while (true) {
    const { data, error } = await supabase
      .from("details_completed")
      .select("id, completed_at, client_id, clients(city)")
      .gte("completed_at", startIso)
      .order("completed_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function countCardsHandedOut(details) {
  const counts = Object.fromEntries(QR_BOOKING_SOURCES.map((source) => [source, 0]));

  for (const row of details) {
    const city = row.clients?.city ?? null;
    const cardType = classifyDetailForQrCard(city);
    if (cardType && cardType in counts) {
      counts[cardType] += 1;
    }
  }

  return counts;
}

function calcConversionRate(bookings, cardsHandedOut) {
  if (!cardsHandedOut || cardsHandedOut <= 0) return null;
  return Math.round((bookings / cardsHandedOut) * 1000) / 10;
}

function filterQrAttemptsSinceStart(attempts, source) {
  return attempts.filter((row) => {
    if (normalizeBookingSource(row.source) !== source) return false;
    return isOnOrAfterQrTrackingStart(row.booked_at);
  });
}

export async function getQrDashboardStats(supabase, attempts, includeRevenue) {
  const trackingStartDate = getQrConversionStartDateYmd();
  const details = await fetchCompletedDetailsSince(supabase, trackingStartDate);
  const cardsBySource = countCardsHandedOut(details);

  const byTrack = QR_BOOKING_SOURCES.map((source) => {
    const qrRows = filterQrAttemptsSinceStart(attempts, source);
    const bookings = qrRows.length;
    const cardsHandedOut = cardsBySource[source] ?? 0;

    return {
      source,
      label: BOOKING_SOURCE_LABELS[source] ?? source,
      cardsHandedOut,
      bookings,
      conversionRate: calcConversionRate(bookings, cardsHandedOut),
      bookedCents: includeRevenue ? sumRevenueCents(qrRows, "booked_revenue_cents") : 0,
      actualCents: includeRevenue
        ? sumRevenueCents(qrRows, "actual_revenue_cents", { realizedOnly: true })
        : 0,
    };
  });

  const totalCards = byTrack.reduce((sum, row) => sum + row.cardsHandedOut, 0);
  const totalBookings = byTrack.reduce((sum, row) => sum + row.bookings, 0);

  return {
    trackingStartDate,
    cardsHandedOut: totalCards,
    bookings: totalBookings,
    conversionRate: calcConversionRate(totalBookings, totalCards),
    byTrack,
  };
}
