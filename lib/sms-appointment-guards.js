import { isCancelledBookingStatus } from "./square-bookings.js";
import { hasAppointmentsTable } from "./appointment-sync.js";
import {
  getPendingRebookClientIds,
  loadRebookContextByClientId,
} from "./sms-cycle.js";

const PAGE_SIZE = 1000;
const DEFAULT_CANCELLATION_COOLDOWN_DAYS = 30;

async function loadAllClients(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, phone, square_customer_id")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function indexClients(clients) {
  const byId = new Map();
  const byPhone = new Map();
  const bySquareCustomerId = new Map();

  for (const client of clients) {
    byId.set(client.id, client);
    const phone = client.phone?.trim();
    if (phone) byPhone.set(phone, client.id);
    if (client.square_customer_id) {
      bySquareCustomerId.set(client.square_customer_id, client.id);
    }
  }

  return { byId, byPhone, bySquareCustomerId };
}

function resolveClientId(row, indexes) {
  if (row.client_id) return row.client_id;
  if (row.square_customer_id) {
    const id = indexes.bySquareCustomerId.get(row.square_customer_id);
    if (id) return id;
  }
  const phone = row.phone?.trim();
  if (phone) {
    const id = indexes.byPhone.get(phone);
    if (id) return id;
  }
  return null;
}

/**
 * Clients with a confirmed Square appointment that has not finished yet.
 * Automated reminder SMS is paused while they already have a booking.
 */
export async function loadClientIdsWithUpcomingAppointments(supabase, now = new Date()) {
  const clientIds = new Set();

  if (await hasAppointmentsTable(supabase)) {
    const { data, error } = await supabase
      .from("square_appointments")
      .select("client_id, end_at, status");

    if (error) throw error;

    for (const row of data ?? []) {
      if (!row.client_id) continue;
      if (isCancelledBookingStatus(row.status)) continue;
      if (row.end_at && new Date(row.end_at) <= now) continue;
      clientIds.add(row.client_id);
    }

    return clientIds;
  }

  const clients = await loadAllClients(supabase);
  const indexes = indexClients(clients);

  const { data, error } = await supabase
    .from("booking_attempts")
    .select("square_customer_id, phone, revenue_status")
    .eq("revenue_status", "booked")
    .not("square_booking_id", "is", null);

  if (error) {
    if (error.code === "42703") return clientIds;
    throw error;
  }

  for (const row of data ?? []) {
    const clientId = resolveClientId(row, indexes);
    if (clientId) clientIds.add(clientId);
  }

  return clientIds;
}

/**
 * Clients who recently cancelled a Square booking — no automated reminders for a cooldown window.
 */
export async function loadClientIdsInCancellationCooldown(
  supabase,
  { cooldownDays = DEFAULT_CANCELLATION_COOLDOWN_DAYS, now = new Date() } = {},
) {
  const clientIds = new Set();
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - cooldownDays);

  const selectWithUpdated = "square_customer_id, phone, revenue_status, revenue_updated_at, booked_at";
  const selectLegacy = "square_customer_id, phone, revenue_status, booked_at";

  let rows = [];
  let useUpdatedAt = true;

  {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select(selectWithUpdated)
      .eq("revenue_status", "cancelled")
      .not("square_booking_id", "is", null);

    if (error?.code === "42703") {
      useUpdatedAt = false;
      const fallback = await supabase
        .from("booking_attempts")
        .select(selectLegacy)
        .eq("revenue_status", "cancelled")
        .not("square_booking_id", "is", null);
      if (fallback.error) throw fallback.error;
      rows = fallback.data ?? [];
    } else {
      if (error) throw error;
      rows = data ?? [];
    }
  }

  const clients = await loadAllClients(supabase);
  const indexes = indexClients(clients);

  for (const row of rows) {
    const stamp = useUpdatedAt ? row.revenue_updated_at ?? row.booked_at : row.booked_at;
    if (!stamp) continue;
    if (new Date(stamp) < cutoff) continue;

    const clientId = resolveClientId(row, indexes);
    if (clientId) clientIds.add(clientId);
  }

  return clientIds;
}

export async function loadSmsAppointmentGuards(
  supabase,
  { now = new Date(), latestDetailByClient = null } = {},
) {
  const [upcomingClientIds, cancellationCooldownClientIds, rebookByClient] = await Promise.all([
    loadClientIdsWithUpcomingAppointments(supabase, now),
    loadClientIdsInCancellationCooldown(supabase, { now }),
    latestDetailByClient
      ? loadRebookContextByClientId(supabase, latestDetailByClient, now)
      : Promise.resolve(new Map()),
  ]);

  const pendingRebookClientIds = getPendingRebookClientIds(rebookByClient);

  return {
    upcomingClientIds,
    cancellationCooldownClientIds,
    pendingRebookClientIds,
    rebookByClient,
    blockedClientIds: new Set([
      ...upcomingClientIds,
      ...cancellationCooldownClientIds,
      ...pendingRebookClientIds,
    ]),
  };
}

export function getSmsBlockReason(clientId, guards) {
  if (guards.pendingRebookClientIds?.has(clientId)) {
    return "Rebooked after last detail — reminders pause until the new appointment completes";
  }
  if (guards.upcomingClientIds.has(clientId)) {
    return "Has an upcoming Square appointment — reminders pause until it completes or is cancelled";
  }
  if (guards.cancellationCooldownClientIds.has(clientId)) {
    return "Recent appointment cancellation — automated reminders paused";
  }
  return null;
}

export { DEFAULT_CANCELLATION_COOLDOWN_DAYS };
