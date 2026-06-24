import { hasAppointmentsTable } from "./appointment-sync.js";
import { isCancelledBookingStatus } from "./square-bookings.js";

/**
 * SMS reminder cycles are anchored to the latest completed detail, but a newer
 * booking after that detail starts a fresh cycle so old sequence progress does not carry over.
 */
export function resolveSmsCycleAnchor(lastDetailDate, rebookResetAt) {
  const detail =
    lastDetailDate instanceof Date ? lastDetailDate : new Date(String(lastDetailDate ?? ""));
  if (Number.isNaN(detail.getTime())) {
    return lastDetailDate instanceof Date ? lastDetailDate : new Date();
  }

  if (!rebookResetAt) return detail;

  const reset =
    rebookResetAt instanceof Date ? rebookResetAt : new Date(String(rebookResetAt ?? ""));
  if (Number.isNaN(reset.getTime())) return detail;

  return reset > detail ? reset : detail;
}

function noteRebook(map, clientId, resetAt, pendingRebook) {
  const existing = map.get(clientId);
  if (!existing || resetAt > existing.resetAt) {
    map.set(clientId, { resetAt, pendingRebook });
    return;
  }

  if (resetAt.getTime() === existing.resetAt.getTime()) {
    existing.pendingRebook = existing.pendingRebook || pendingRebook;
  }
}

async function loadCompletedBookingIdsByClient(supabase, clientIds) {
  const byClient = new Map();
  if (!clientIds.length) return byClient;

  const chunkSize = 200;
  for (let i = 0; i < clientIds.length; i += chunkSize) {
    const ids = clientIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("details_completed")
      .select("client_id, square_booking_id")
      .in("client_id", ids)
      .not("square_booking_id", "is", null);

    if (error) throw error;

    for (const row of data ?? []) {
      if (!row.client_id || !row.square_booking_id) continue;
      if (!byClient.has(row.client_id)) {
        byClient.set(row.client_id, new Set());
      }
      byClient.get(row.client_id).add(row.square_booking_id);
    }
  }

  return byClient;
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

async function loadAllClientsForRebookLookup(supabase) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, phone, square_customer_id")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

/**
 * Bookings made after the client's latest completed detail that have not finished yet.
 * Used to pause reminders and reset sequence progress for the prior detail cycle.
 */
export async function loadRebookContextByClientId(supabase, latestDetailByClient, now = new Date()) {
  const rebookByClient = new Map();
  const clientIds = [...latestDetailByClient.keys()];
  if (!clientIds.length) return rebookByClient;

  const completedBookingIdsByClient = await loadCompletedBookingIdsByClient(supabase, clientIds);

  if (await hasAppointmentsTable(supabase)) {
    const { data, error } = await supabase
      .from("square_appointments")
      .select("client_id, square_booking_id, start_at, end_at, status")
      .in("client_id", clientIds);

    if (error) throw error;

    for (const row of data ?? []) {
      if (!row.client_id || isCancelledBookingStatus(row.status)) continue;
      if (row.end_at && new Date(row.end_at) <= now) continue;

      const lastDetail = latestDetailByClient.get(row.client_id);
      if (!lastDetail?.completedAt) continue;

      const resetAt = new Date(row.start_at ?? row.end_at);
      if (Number.isNaN(resetAt.getTime()) || resetAt <= lastDetail.completedAt) continue;

      if (row.square_booking_id) {
        const completed = completedBookingIdsByClient.get(row.client_id);
        if (completed?.has(row.square_booking_id)) continue;
      }

      noteRebook(rebookByClient, row.client_id, resetAt, true);
    }
  }

  const clients = await loadAllClientsForRebookLookup(supabase);
  const indexes = indexClients(clients);

  const { data: attempts, error: attemptsError } = await supabase
    .from("booking_attempts")
    .select("square_booking_id, square_customer_id, phone, booked_at, revenue_status")
    .eq("revenue_status", "booked")
    .not("square_booking_id", "is", null);

  if (attemptsError) {
    if (attemptsError.code !== "42703") throw attemptsError;
  } else {
    for (const row of attempts ?? []) {
      const clientId = resolveClientId(row, indexes);
      if (!clientId || !latestDetailByClient.has(clientId)) continue;

      const lastDetail = latestDetailByClient.get(clientId);
      if (!lastDetail?.completedAt || !row.booked_at) continue;

      const bookedAt = new Date(row.booked_at);
      if (Number.isNaN(bookedAt.getTime()) || bookedAt <= lastDetail.completedAt) continue;

      const completed = completedBookingIdsByClient.get(clientId);
      if (completed?.has(row.square_booking_id)) continue;

      noteRebook(rebookByClient, clientId, bookedAt, true);
    }
  }

  return rebookByClient;
}

export function getPendingRebookClientIds(rebookByClient) {
  const ids = new Set();
  for (const [clientId, context] of rebookByClient.entries()) {
    if (context.pendingRebook) ids.add(clientId);
  }
  return ids;
}

export function applyRebookContextToSmsClient(context, rebookContext) {
  if (!context) return context;

  if (rebookContext?.resetAt) {
    context.cycleAnchor = resolveSmsCycleAnchor(context.lastDetailDate, rebookContext.resetAt);
  }

  return context;
}
