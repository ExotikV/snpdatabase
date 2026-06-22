import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { SquareClient, SquareEnvironment, SquareError } from "square";

const BOOKINGS_LOOKBACK_DAYS = 365;
const BOOKINGS_WINDOW_DAYS = 31;
const PAGE_LIMIT = 100;

// Square BookingStatus enum (Bookings API): PENDING, ACCEPTED,
// CANCELLED_BY_CUSTOMER, CANCELLED_BY_SELLER, DECLINED, NO_SHOW
const CANCELLED_BOOKING_STATUSES = new Set([
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
  "DECLINED",
  "NO_SHOW",
]);

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_ENVIRONMENT",
];

function requireEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function getSquareEnvironment() {
  const value = process.env.SQUARE_ENVIRONMENT.trim().toLowerCase();
  if (value === "sandbox") {
    return SquareEnvironment.Sandbox;
  }
  if (value === "production") {
    return SquareEnvironment.Production;
  }
  throw new Error(
    'SQUARE_ENVIRONMENT must be "sandbox" or "production".',
  );
}

function formatCustomerName(customer) {
  const parts = [customer.givenName, customer.familyName].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return customer.companyName ?? null;
}

function getBookingStartAt(booking) {
  if (!booking.startAt) {
    return null;
  }

  const startAt = new Date(booking.startAt);
  if (Number.isNaN(startAt.getTime())) {
    return null;
  }

  return startAt;
}

function isPastBooking(booking, now) {
  const startAt = getBookingStartAt(booking);
  return startAt != null && startAt < now;
}

function isCancelledBookingStatus(status) {
  return CANCELLED_BOOKING_STATUSES.has(status);
}

/*
 * Business rule: a booking counts as a completed detail if and only if
 * (1) its appointment start time is already in the past, and
 * (2) it still exists in Square with a non-cancelled status.
 *
 * In this shop, jobs that do not happen (no-show, cancellation) are
 * cancelled or removed in Square before the appointment time. So any
 * booking still present and not cancelled after its scheduled time is
 * treated as a job that was actually done. Square has no COMPLETED
 * status — survival past the appointment time is the completion signal.
 */
function classifyBookingsForCompletion(bookings, now) {
  let pastCount = 0;
  let excludedCancelledCount = 0;
  const completed = [];

  for (const booking of bookings) {
    if (!isPastBooking(booking, now)) {
      continue;
    }

    pastCount += 1;

    if (isCancelledBookingStatus(booking.status)) {
      excludedCancelledCount += 1;
      continue;
    }

    if (!booking.id) {
      continue;
    }

    completed.push(booking);
  }

  return {
    completed,
    pastCount,
    excludedCancelledCount,
  };
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
    if (windowEnd > now) {
      windowEnd = new Date(now);
    }

    const pager = await squareClient.bookings.list({
      startAtMin: toIso(windowStart),
      startAtMax: toIso(windowEnd),
      limit: PAGE_LIMIT,
    });

    for await (const booking of pager) {
      if (seenBookingIds.has(booking.id)) {
        continue;
      }
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
      const response = await squareClient.catalog.batchGet({
        objectIds: ids,
      });

      for (const object of response.objects ?? []) {
        const name =
          object.itemVariationData?.name ??
          object.itemVariationData?.sku ??
          object.id;
        namesById.set(object.id, name);
      }
    } catch (error) {
      const message =
        error instanceof SquareError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      console.error(`Error resolving catalog service names: ${message}`);
    }
  }

  return namesById;
}

function getServiceType(booking, serviceNamesById) {
  const segments = booking.appointmentSegments ?? [];
  const labels = segments.map((segment) => {
    const variationId = segment.serviceVariationId;
    if (!variationId) {
      return null;
    }
    return serviceNamesById.get(variationId) ?? variationId;
  });

  const filtered = labels.filter(Boolean);
  return filtered.length > 0 ? filtered.join(", ") : null;
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
      },
      { onConflict: "square_customer_id" },
    )
    .select("id, square_customer_id")
    .single();

  if (error) {
    throw error;
  }

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

  if (error) {
    throw error;
  }
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

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      clientMap.set(row.square_customer_id, row.id);
    }

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return clientMap;
}

export async function runPull() {
  requireEnv();

  const squareClient = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: getSquareEnvironment(),
  });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  console.log("Starting Square -> Supabase pull...");
  console.log(`Square environment: ${process.env.SQUARE_ENVIRONMENT}`);
  console.log(`Booking lookback: ${BOOKINGS_LOOKBACK_DAYS} days`);

  let clientsProcessed = 0;
  let clientErrors = 0;
  let bookingsFetched = 0;
  let bookingsPast = 0;
  let bookingsExcludedCancelled = 0;
  let bookingsProcessed = 0;
  let bookingErrors = 0;

  console.log("\nFetching customers from Square...");
  const customers = await fetchAllCustomers(squareClient);
  console.log(`Found ${customers.length} customers in Square.`);

  console.log("\nUpserting clients into Supabase...");
  for (const customer of customers) {
    if (!customer.id) {
      clientErrors += 1;
      console.error("Skipping customer with no Square ID.");
      continue;
    }

    try {
      await upsertClient(supabase, customer);
      clientsProcessed += 1;
    } catch (error) {
      clientErrors += 1;
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `Client error (${customer.id}): ${message}`,
      );
    }
  }

  const clientMap = await loadClientMap(supabase);

  console.log("\nFetching bookings from Square...");
  const allBookings = await fetchBookings(squareClient);
  bookingsFetched = allBookings.length;
  console.log(`Fetched ${bookingsFetched} bookings from Square.`);

  const now = new Date();
  const { completed: bookings, pastCount, excludedCancelledCount } =
    classifyBookingsForCompletion(allBookings, now);
  bookingsPast = pastCount;
  bookingsExcludedCancelled = excludedCancelledCount;
  console.log(
    `${bookingsPast} with appointment time in the past; ${bookingsExcludedCancelled} excluded as cancelled/no-show/declined; ${bookings.length} eligible to write as completed.`,
  );

  const variationIds = bookings.flatMap((booking) =>
    (booking.appointmentSegments ?? []).map(
      (segment) => segment.serviceVariationId,
    ),
  );
  const serviceNamesById = await resolveServiceNames(
    squareClient,
    variationIds,
  );

  console.log("\nUpserting completed details into Supabase...");
  for (const booking of bookings) {
    if (!booking.id) {
      bookingErrors += 1;
      console.error("Skipping booking with no Square booking ID.");
      continue;
    }

    if (!booking.customerId) {
      bookingErrors += 1;
      console.error(
        `Booking error (${booking.id}): missing customer_id in Square booking.`,
      );
      continue;
    }

    const clientId = clientMap.get(booking.customerId);
    if (!clientId) {
      bookingErrors += 1;
      console.error(
        `Booking error (${booking.id}): no matching client for Square customer ${booking.customerId}. Run customer sync first or verify the customer exists in Square.`,
      );
      continue;
    }

    try {
      const serviceType = getServiceType(booking, serviceNamesById);
      await upsertCompletedDetail(
        supabase,
        booking,
        clientId,
        serviceType,
      );
      bookingsProcessed += 1;
    } catch (error) {
      bookingErrors += 1;
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`Booking error (${booking.id}): ${message}`);
    }
  }

  console.log("\nPull complete.");
  console.log(`Clients processed: ${clientsProcessed}`);
  console.log(`Client errors: ${clientErrors}`);
  console.log(`Bookings fetched: ${bookingsFetched}`);
  console.log(`Bookings in the past: ${bookingsPast}`);
  console.log(`Bookings excluded (cancelled): ${bookingsExcludedCancelled}`);
  console.log(`Bookings written as completed: ${bookingsProcessed}`);
  console.log(`Booking errors: ${bookingErrors}`);
}

import { fileURLToPath } from "node:url";
import path from "node:path";

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runPull().catch((error) => {
    const message =
      error instanceof SquareError
        ? `${error.message} (status ${error.statusCode ?? "unknown"})`
        : error instanceof Error
          ? error.message
          : String(error);
    console.error(`Fatal error: ${message}`);
    process.exit(1);
  });
}
