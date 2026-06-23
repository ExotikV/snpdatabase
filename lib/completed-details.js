/**
 * Completed Square appointments stored in details_completed (completed_at = appointment end time).
 * Automated SMS requires at least one past completed detail per client.
 */

export function isPastCompletedAt(completedAt, now = new Date()) {
  if (!completedAt) return false;
  const date = completedAt instanceof Date ? completedAt : new Date(String(completedAt));
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= now.getTime();
}

export function getLatestCompletedDetailByClient(details, now = new Date()) {
  const latestByClient = new Map();

  for (const row of details ?? []) {
    if (!row.completed_at) continue;
    const completedAt = new Date(row.completed_at);
    if (!isPastCompletedAt(completedAt, now)) continue;

    const existing = latestByClient.get(row.client_id);
    if (!existing || completedAt > existing.completedAt) {
      latestByClient.set(row.client_id, {
        completedAt,
        serviceType: row.service_type ?? null,
        squareBookingId: row.square_booking_id ?? null,
      });
    }
  }

  return latestByClient;
}

export function clientHasCompletedDetailFromMap(clientId, latestByClient) {
  return latestByClient.has(clientId);
}

export async function fetchLatestCompletedDetailForClient(supabase, clientId, now = new Date()) {
  const { data, error } = await supabase
    .from("details_completed")
    .select("client_id, completed_at, service_type, square_booking_id")
    .eq("client_id", clientId)
    .order("completed_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  const latestByClient = getLatestCompletedDetailByClient(data ?? [], now);
  return latestByClient.get(clientId) ?? null;
}

export async function clientHasCompletedAppointment(supabase, clientId, now = new Date()) {
  const detail = await fetchLatestCompletedDetailForClient(supabase, clientId, now);
  return detail != null;
}

export const NO_COMPLETED_APPOINTMENT_REASON =
  "No completed appointment on file — automated SMS requires at least one finished detail";
