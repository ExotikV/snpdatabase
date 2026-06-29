import { isOnOrAfterTorontoDate, torontoDayStartIso } from "./dates.js";
import { sumRevenueCents } from "./revenue.js";
import { isEligibleCity } from "./service-area.js";
import { BOOKING_SOURCE_LABELS, QR_BOOKING_SOURCES, normalizeBookingSource } from "./tracks.js";

const PAGE_SIZE = 1000;

/** First Toronto calendar day QR cards are handed out (inclusive). */
export const QR_CONVERSION_START_DATE = "2026-06-26";

export function getQrConversionStartDateYmd() {
  return QR_CONVERSION_START_DATE;
}

export function isOnOrAfterQrTrackingStart(isoTimestamp) {
  return isOnOrAfterTorontoDate(isoTimestamp, getQrConversionStartDateYmd());
}

/**
 * Service-area cities get a maintenance QR card after each detail; all others get general.
 * Missing city defaults to general — a card is still handed out.
 */
export function classifyDetailForQrCard(city) {
  if (!city?.trim()) return "qr_general";
  return isEligibleCity(city) ? "qr_maintenance" : "qr_general";
}

function resolveClientCity(row) {
  const client = row?.clients;
  if (Array.isArray(client)) return client[0]?.city ?? null;
  return client?.city ?? null;
}

async function fetchCompletedDetailsSince(supabase, startDateYmd) {
  const rows = [];
  let from = 0;
  const startIso = torontoDayStartIso(startDateYmd);
  if (!startIso) return rows;

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
    if (!isOnOrAfterQrTrackingStart(row.completed_at)) continue;

    const city = resolveClientCity(row);
    const cardType = classifyDetailForQrCard(city);
    if (cardType in counts) {
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
