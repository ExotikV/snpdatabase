import { SquareClient, SquareEnvironment, SquareError } from "square";
import { getSupabase } from "./supabase.js";

const BOOKINGS_LOOKBACK_DAYS = 365;
const BOOKINGS_WINDOW_DAYS = 31;
const PAGE_LIMIT = 100;

const CANCELLED_BOOKING_STATUSES = new Set([
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
  "DECLINED",
  "NO_SHOW",
]);

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

function formatCustomerName(customer) {
  const parts = [customer.givenName, customer.familyName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return customer.companyName ?? null;
}

export function getCustomerCity(customer) {
  const fromPrimary = customer.address?.locality?.trim();
  if (fromPrimary) return fromPrimary;

  for (const address of customer.addresses ?? []) {
    const city = address?.locality?.trim();
    if (city) return city;
  }

  return null;
}

function getBookingStartAt(booking) {
  if (!booking.startAt) return null;
  const startAt = new Date(booking.startAt);
  return Number.isNaN(startAt.getTime()) ? null : startAt;
}

function isPastBooking(booking, now) {
  const startAt = getBookingStartAt(booking);
  return startAt != null && startAt < now;
}

function isCancelledBookingStatus(status) {
  return CANCELLED_BOOKING_STATUSES.has(status);
}

function classifyBookingsForCompletion(bookings, now) {
  let pastCount = 0;
  let excludedCancelledCount = 0;
  const completed = [];

  for (const booking of bookings) {
    if (!isPastBooking(booking, now)) continue;
    pastCount += 1;
    if (isCancelledBookingStatus(booking.status)) {
      excludedCancelledCount += 1;
      continue;
    }
    if (!booking.id) continue;
    completed.push(booking);
  }

  return { completed, pastCount, excludedCancelledCount };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIso(date) {
  return date.toISOString();
}

function createSquareClient() {
  requireSquareEnv();
  return new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: getSquareEnvironment(),
  });
}

async function fetchAllCustomers(squareClient) {
  const customers = [];
  const pager = await squareClient.customers.list({
    limit: PAGE_LIMIT,
    sortField: "DEFAULT",
    sortOrder: "ASC",
  });

  for await (const customer of pager) {
    customers.push(customer);
  }

  return customers;
}

async function fetchBookings(squareClient) {
  const now = new Date();
  const earliest = addDays(now, -BOOKINGS_LOOKBACK_DAYS);
  const bookings = [];
  const seenBookingIds = new Set();
  let windowStart = new Date(earliest);

  while (windowStart < now) {
    let windowEnd = addDays(windowStart, BOOKINGS_WINDOW_DAYS);
    if (windowEnd > now) windowEnd = new Date(now);

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

async function resolveServiceNames(squareClient, variationIds) {
  const namesById = new Map();
  const uniqueIds = [...new Set(variationIds.filter(Boolean))];

  for (const ids of chunkArray(uniqueIds, PAGE_LIMIT)) {
    try {
      const response = await squareClient.catalog.batchGet({ objectIds: ids });
      for (const object of response.objects ?? []) {
        const name =
          object.itemVariationData?.name ??
          object.itemVariationData?.sku ??
          object.id;
        namesById.set(object.id, name);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error resolving catalog service names: ${message}`);
    }
  }

  return namesById;
}

function getServiceType(booking, serviceNamesById) {
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

async function upsertClient(supabase, customer) {
  const { data, error } = await supabase
    .from("clients")
    .upsert(
      {
        square_customer_id: customer.id,
        phone: customer.phoneNumber ?? null,
        name: formatCustomerName(customer),
        email: customer.emailAddress ?? null,
        city: getCustomerCity(customer),
      },
      { onConflict: "square_customer_id" },
    )
    .select("id, square_customer_id, city")
    .single();

  if (error) throw error;
  return data;
}

async function upsertCompletedDetail(supabase, booking, clientId, serviceType) {
  const { error } = await supabase.from("details_completed").upsert(
    {
      client_id: clientId,
      square_booking_id: booking.id,
      service_type: serviceType,
      completed_at: booking.startAt ?? null,
    },
    { onConflict: "square_booking_id" },
  );

  if (error) throw error;
}

async function loadClientMap(supabase) {
  const clientMap = new Map();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, square_customer_id")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      clientMap.set(row.square_customer_id, row.id);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return clientMap;
}

/**
 * Pull customers (with city) and completed bookings from Square into Supabase.
 * @param {{ customersOnly?: boolean }} options
 */
export async function runSquareSync({ customersOnly = false } = {}) {
  const squareClient = createSquareClient();
  const supabase = getSupabase();

  const stats = {
    customersFetched: 0,
    clientsProcessed: 0,
    clientsWithCity: 0,
    clientErrors: 0,
    bookingsFetched: 0,
    bookingsPast: 0,
    bookingsExcludedCancelled: 0,
    bookingsProcessed: 0,
    bookingErrors: 0,
  };

  console.log("[square-sync] Fetching customers...");
  const customers = await fetchAllCustomers(squareClient);
  stats.customersFetched = customers.length;

  for (const customer of customers) {
    if (!customer.id) {
      stats.clientErrors += 1;
      continue;
    }

    try {
      const row = await upsertClient(supabase, customer);
      stats.clientsProcessed += 1;
      if (row.city) stats.clientsWithCity += 1;
    } catch (error) {
      stats.clientErrors += 1;
      console.error(
        `[square-sync] Client error (${customer.id}):`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (customersOnly) {
    console.log("[square-sync] Customers-only sync complete.", stats);
    return stats;
  }

  const clientMap = await loadClientMap(supabase);

  console.log("[square-sync] Fetching bookings...");
  const allBookings = await fetchBookings(squareClient);
  stats.bookingsFetched = allBookings.length;

  const { syncBookingAttemptRevenue } = await import("./revenue.js");
  const revenueStats = await syncBookingAttemptRevenue(supabase, allBookings);
  stats.revenueRealized = revenueStats.realized;
  stats.revenueCancelled = revenueStats.cancelled;

  const now = new Date();
  const { completed: bookings, pastCount, excludedCancelledCount } =
    classifyBookingsForCompletion(allBookings, now);
  stats.bookingsPast = pastCount;
  stats.bookingsExcludedCancelled = excludedCancelledCount;

  const variationIds = bookings.flatMap((booking) =>
    (booking.appointmentSegments ?? []).map((segment) => segment.serviceVariationId),
  );
  const serviceNamesById = await resolveServiceNames(squareClient, variationIds);

  for (const booking of bookings) {
    if (!booking.id || !booking.customerId) {
      stats.bookingErrors += 1;
      continue;
    }

    const clientId = clientMap.get(booking.customerId);
    if (!clientId) {
      stats.bookingErrors += 1;
      continue;
    }

    try {
      await upsertCompletedDetail(
        supabase,
        booking,
        clientId,
        getServiceType(booking, serviceNamesById),
      );
      stats.bookingsProcessed += 1;
    } catch (error) {
      stats.bookingErrors += 1;
      console.error(
        `[square-sync] Booking error (${booking.id}):`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log("[square-sync] Full sync complete.", stats);
  return stats;
}

export { SquareError };
