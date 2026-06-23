import { SquareClient, SquareEnvironment } from "square";

export const BOOKINGS_LOOKAHEAD_DAYS = 90;
export const BOOKINGS_WINDOW_DAYS = 31;
export const PAGE_LIMIT = 100;

export const CANCELLED_BOOKING_STATUSES = new Set([
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
  "DECLINED",
  "NO_SHOW",
]);

export function isCancelledBookingStatus(status) {
  return CANCELLED_BOOKING_STATUSES.has(status);
}

function requireSquareEnv() {
  const missing = ["SQUARE_ACCESS_TOKEN", "SQUARE_ENVIRONMENT"].filter(
    (key) => !process.env[key]?.trim(),
  );
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function getSquareEnvironment() {
  const value = process.env.SQUARE_ENVIRONMENT.trim().toLowerCase();
  if (value === "sandbox") return SquareEnvironment.Sandbox;
  if (value === "production") return SquareEnvironment.Production;
  throw new Error('SQUARE_ENVIRONMENT must be "sandbox" or "production".');
}

export function createSquareClient() {
  requireSquareEnv();
  return new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: getSquareEnvironment(),
  });
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIso(date) {
  return date.toISOString();
}

export function mergeBookingsById(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const booking of list ?? []) {
      if (booking?.id) {
        byId.set(booking.id, booking);
      }
    }
  }
  return [...byId.values()];
}

/**
 * Pull Square bookings between lookbackDays ago and lookaheadDays ahead.
 */
export async function fetchBookingsInRange(
  squareClient,
  { lookbackDays = 0, lookaheadDays = 0, now = new Date() } = {},
) {
  const rangeStart = addDays(now, -lookbackDays);
  const rangeEnd = addDays(now, lookaheadDays);
  const bookings = [];
  const seenBookingIds = new Set();
  let windowStart = new Date(rangeStart);

  while (windowStart < rangeEnd) {
    let windowEnd = addDays(windowStart, BOOKINGS_WINDOW_DAYS);
    if (windowEnd > rangeEnd) windowEnd = new Date(rangeEnd);

    const pager = await squareClient.bookings.list({
      startAtMin: toIso(windowStart),
      startAtMax: toIso(windowEnd),
      limit: PAGE_LIMIT,
    });

    for await (const booking of pager) {
      if (seenBookingIds.has(booking.id)) continue;
      seenBookingIds.add(booking.id);
      bookings.push(booking);
    }

    windowStart = new Date(windowEnd);
  }

  return bookings;
}

/** Fetch individual bookings by ID (for pending revenue rows outside the date window). */
export async function fetchBookingsByIds(squareClient, bookingIds) {
  const bookings = [];
  const uniqueIds = [...new Set((bookingIds ?? []).filter(Boolean))];

  for (const bookingId of uniqueIds) {
    try {
      const response = await squareClient.bookings.get({ bookingId });
      if (response?.booking?.id) {
        bookings.push(response.booking);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[square-bookings] Failed to fetch booking ${bookingId}: ${message}`);
    }
  }

  return bookings;
}

export async function resolveCatalogById(squareClient, variationIds) {
  const byId = new Map();
  const uniqueIds = [...new Set(variationIds.filter(Boolean))];
  const chunks = [];
  for (let i = 0; i < uniqueIds.length; i += PAGE_LIMIT) {
    chunks.push(uniqueIds.slice(i, i + PAGE_LIMIT));
  }

  for (const ids of chunks) {
    try {
      const response = await squareClient.catalog.batchGet({ objectIds: ids });
      for (const object of response.objects ?? []) {
        const priceMoney = object.itemVariationData?.priceMoney;
        byId.set(object.id, {
          name:
            object.itemVariationData?.name ??
            object.itemVariationData?.sku ??
            object.id,
          priceCents: priceMoney?.amount != null ? Number(priceMoney.amount) : null,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error resolving catalog variations: ${message}`);
    }
  }

  return byId;
}

/** @deprecated use resolveCatalogById */
export async function resolveServiceNames(squareClient, variationIds) {
  const catalogById = await resolveCatalogById(squareClient, variationIds);
  const namesById = new Map();
  for (const [id, entry] of catalogById) {
    namesById.set(id, entry.name);
  }
  return namesById;
}

export function getServiceType(booking, catalogById) {
  const segments = booking.appointmentSegments ?? [];
  const labels = segments
    .map((segment) => {
      const variationId = segment.serviceVariationId;
      if (!variationId) return null;
      const entry = catalogById.get(variationId);
      return entry?.name ?? (typeof entry === "string" ? entry : null) ?? variationId;
    })
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : null;
}

export function getCatalogPriceCents(booking, catalogById) {
  const segments = booking.appointmentSegments ?? [];
  let total = 0;
  let hasPrice = false;

  for (const segment of segments) {
    const variationId = segment.serviceVariationId;
    if (!variationId) continue;
    const entry = catalogById.get(variationId);
    const price = entry?.priceCents ?? null;
    if (price != null) {
      total += price;
      hasPrice = true;
    }
  }

  return hasPrice ? total : null;
}

export function getServiceTypeFromNames(booking, serviceNamesById) {
  const segments = booking.appointmentSegments ?? [];
  const labels = segments
    .map((segment) => {
      const variationId = segment.serviceVariationId;
      if (!variationId) return null;
      return serviceNamesById.get(variationId) ?? variationId;
    })
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : null;
}

export function getServiceDurationMinutes(booking) {
  const segments = booking.appointmentSegments ?? [];
  let total = 0;
  let hasDuration = false;

  for (const segment of segments) {
    const minutes = Number(segment?.durationMinutes);
    if (Number.isFinite(minutes) && minutes > 0) {
      total += minutes;
      hasDuration = true;
    }
  }

  return hasDuration ? total : null;
}

export { SquareEnvironment, SquareClient };
