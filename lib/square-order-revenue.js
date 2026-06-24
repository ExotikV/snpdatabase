/** Match Square completed orders to bookings and aggregate period revenue from Square. */

import { getTorontoDateParts } from "./dates.js";

const ORDER_MATCH_BEFORE_DAYS = 7;
const ORDER_MATCH_AFTER_DAYS = 14;
const ORDERS_PAGE_LIMIT = 500;
const ALL_TIME_START_AT = "2018-01-01T00:00:00.000Z";

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function getBookingVariationIds(booking) {
  return (booking?.appointmentSegments ?? [])
    .map((segment) => segment.serviceVariationId)
    .filter(Boolean);
}

export function getOrderVariationIds(order) {
  return (order?.lineItems ?? []).map((item) => item.catalogObjectId).filter(Boolean);
}

export function getOrderTotalCents(order) {
  const amount = order?.totalMoney?.amount ?? order?.netAmounts?.totalMoney?.amount;
  if (amount == null) return null;
  const cents = Number(amount);
  return Number.isFinite(cents) && cents >= 0 ? cents : null;
}

function getOrderTimestamp(order) {
  return order?.closedAt ?? order?.updatedAt ?? order?.createdAt ?? null;
}

function orderMatchesBooking(booking, order) {
  if (!booking?.id || !order?.id) return false;
  if (order.state && order.state !== "COMPLETED") return false;

  const bookingCustomerId = booking.customerId ?? null;
  const orderCustomerId = order.customerId ?? null;
  if (bookingCustomerId && orderCustomerId && bookingCustomerId !== orderCustomerId) {
    return false;
  }

  const bookingVariations = new Set(getBookingVariationIds(booking));
  if (bookingVariations.size === 0) return false;

  const orderVariations = getOrderVariationIds(order);
  if (!orderVariations.some((id) => bookingVariations.has(id))) {
    return false;
  }

  const startAt = booking.startAt ? new Date(booking.startAt) : null;
  const orderAt = getOrderTimestamp(order);
  if (!startAt || Number.isNaN(startAt.getTime()) || !orderAt) return false;

  const orderTime = new Date(orderAt);
  if (Number.isNaN(orderTime.getTime())) return false;

  const windowStart = addDays(startAt, -ORDER_MATCH_BEFORE_DAYS);
  const windowEnd = addDays(startAt, ORDER_MATCH_AFTER_DAYS);
  return orderTime >= windowStart && orderTime <= windowEnd;
}

export function findBestMatchingOrder(booking, orders) {
  const candidates = (orders ?? []).filter((order) => orderMatchesBooking(booking, order));
  if (candidates.length === 0) return null;

  const startMs = new Date(booking.startAt).getTime();
  candidates.sort((left, right) => {
    const leftMs = new Date(getOrderTimestamp(left)).getTime();
    const rightMs = new Date(getOrderTimestamp(right)).getTime();
    return Math.abs(leftMs - startMs) - Math.abs(rightMs - startMs);
  });

  return candidates[0];
}

export async function fetchAllLocationIds(squareClient) {
  const response = await squareClient.locations.list();
  return (response?.locations ?? []).map((location) => location?.id).filter(Boolean);
}

export function sumOrderTotalsCents(orders) {
  let totalCents = 0;
  let orderCount = 0;

  for (const order of orders ?? []) {
    const cents = getOrderTotalCents(order);
    if (cents == null) continue;
    totalCents += cents;
    orderCount += 1;
  }

  return { totalCents, orderCount };
}

function resolvePeriodBounds(bounds, now = new Date()) {
  return {
    startAt: bounds?.start ?? ALL_TIME_START_AT,
    endAt: bounds?.end ?? now.toISOString(),
  };
}

/**
 * Total completed Square order revenue for a period (closed_at), straight from Square.
 */
export async function fetchSquarePeriodRevenue(squareClient, bounds, now = new Date()) {
  try {
    const locationIds = await fetchAllLocationIds(squareClient);
    if (!locationIds.length) {
      return { totalCents: 0, orderCount: 0, unavailable: true };
    }

    const { startAt, endAt } = resolvePeriodBounds(bounds, now);
    const orders = await fetchCompletedOrders(squareClient, locationIds, { startAt, endAt });
    return { ...sumOrderTotalsCents(orders), unavailable: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[square-order-revenue] Failed to fetch period revenue: ${message}`);
    return { totalCents: 0, orderCount: 0, unavailable: true };
  }
}

/**
 * Completed Square order revenue by calendar month (Toronto) for a year.
 */
export async function fetchSquareMonthlyRevenue(squareClient, year) {
  const buckets = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    actualCents: 0,
    orderCount: 0,
  }));

  try {
    const locationIds = await fetchAllLocationIds(squareClient);
    if (!locationIds.length) {
      return { buckets, unavailable: true };
    }

    const orders = await fetchCompletedOrders(squareClient, locationIds, {
      startAt: `${year}-01-01T00:00:00.000Z`,
      endAt: `${year + 1}-01-01T00:00:00.000Z`,
    });

    for (const order of orders) {
      const timestamp = getOrderTimestamp(order);
      if (!timestamp) continue;

      const parts = getTorontoDateParts(new Date(timestamp));
      if (!parts || parts.year !== year) continue;

      const cents = getOrderTotalCents(order);
      if (cents == null) continue;

      const bucket = buckets[parts.month - 1];
      bucket.actualCents += cents;
      bucket.orderCount += 1;
    }

    return { buckets, unavailable: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[square-order-revenue] Failed to fetch monthly revenue: ${message}`);
    return { buckets, unavailable: true };
  }
}

export async function resolveLocationIds(squareClient, bookings) {
  const ids = new Set();
  for (const booking of bookings ?? []) {
    if (booking?.locationId) ids.add(booking.locationId);
  }
  if (ids.size > 0) return [...ids];
  return fetchAllLocationIds(squareClient);
}

export function getOrderSearchRange(
  bookings,
  { beforeDays = ORDER_MATCH_BEFORE_DAYS, afterDays = ORDER_MATCH_AFTER_DAYS, now = new Date() } = {},
) {
  let minStart = null;
  let maxStart = null;

  for (const booking of bookings ?? []) {
    const start = booking?.startAt ? new Date(booking.startAt) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    if (!minStart || start < minStart) minStart = start;
    if (!maxStart || start > maxStart) maxStart = start;
  }

  if (!minStart || !maxStart) {
    return { startAt: null, endAt: null };
  }

  return {
    startAt: addDays(minStart, -beforeDays).toISOString(),
    endAt: addDays(new Date(Math.max(maxStart.getTime(), now.getTime())), afterDays).toISOString(),
  };
}

export async function fetchCompletedOrders(squareClient, locationIds, { startAt, endAt }) {
  if (!locationIds?.length || !startAt || !endAt) return [];

  const orders = [];
  let cursor;

  do {
    const response = await squareClient.orders.search({
      locationIds,
      cursor,
      limit: ORDERS_PAGE_LIMIT,
      query: {
        filter: {
          stateFilter: { states: ["COMPLETED"] },
          dateTimeFilter: {
            closedAt: { startAt, endAt },
          },
        },
        sort: { sortField: "CLOSED_AT", sortOrder: "ASC" },
      },
    });

    orders.push(...(response?.orders ?? []));
    cursor = response?.cursor;
  } while (cursor);

  return orders;
}

export function indexOrdersByCustomerId(orders) {
  const byCustomer = new Map();
  for (const order of orders ?? []) {
    const customerId = order?.customerId;
    if (!customerId) continue;
    if (!byCustomer.has(customerId)) byCustomer.set(customerId, []);
    byCustomer.get(customerId).push(order);
  }
  return byCustomer;
}

export function buildBookingRevenueMap(bookings, ordersByCustomer, allOrders) {
  const map = new Map();

  for (const booking of bookings ?? []) {
    if (!booking?.id) continue;

    let pool = booking.customerId ? ordersByCustomer.get(booking.customerId) ?? [] : allOrders;
    if (pool.length === 0) pool = allOrders;

    const match = findBestMatchingOrder(booking, pool);
    const cents = match ? getOrderTotalCents(match) : null;
    if (cents != null) {
      map.set(booking.id, { cents, orderId: match.id });
    }
  }

  return map;
}

/**
 * Resolve actual charged amounts from Square Orders for a set of bookings.
 * @returns {Promise<Map<string, { cents: number, orderId: string }>>}
 */
export async function resolveSquareBookingRevenue(squareClient, bookings) {
  if (!bookings?.length) return new Map();

  try {
    const locationIds = await resolveLocationIds(squareClient, bookings);
    const range = getOrderSearchRange(bookings);
    const orders = await fetchCompletedOrders(squareClient, locationIds, range);
    const byCustomer = indexOrdersByCustomerId(orders);
    return buildBookingRevenueMap(bookings, byCustomer, orders);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[square-order-revenue] Failed to resolve order revenue: ${message}`);
    return new Map();
  }
}
