/** Match Square completed orders to bookings for actual charged amounts (incl. manual price edits). */

const ORDER_MATCH_BEFORE_DAYS = 7;
const ORDER_MATCH_AFTER_DAYS = 14;
const ORDERS_PAGE_LIMIT = 500;

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

export async function resolveLocationIds(squareClient, bookings) {
  const ids = new Set();
  for (const booking of bookings ?? []) {
    if (booking?.locationId) ids.add(booking.locationId);
  }
  if (ids.size > 0) return [...ids];

  const response = await squareClient.locations.list();
  for (const location of response?.locations ?? []) {
    if (location?.id) ids.add(location.id);
  }
  return [...ids];
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
