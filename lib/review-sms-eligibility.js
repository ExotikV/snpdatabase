import { minutesSinceInstant } from "./dates.js";
import { getLatestCompletedDetailByClient } from "./completed-details.js";
import { REVIEW_SMS_TRIGGER_TYPE } from "./tracks.js";

const PAGE_SIZE = 1000;

/** Clients who already received review SMS, or have one in flight — lifetime block after sent. */
export async function loadReviewSmsBlockedClientIds(supabase) {
  const sent = new Set();
  const pending = new Set();
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("sms_log")
      .select("client_id, status")
      .eq("trigger_type", REVIEW_SMS_TRIGGER_TYPE)
      .in("status", ["sent", "pending"])
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      if (row.status === "sent") sent.add(row.client_id);
      else if (row.status === "pending") pending.add(row.client_id);
    }

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { sent, pending };
}

function detailQualifies(detail, settings, now) {
  if (!detail?.completedAt) return false;

  const minutesSince = minutesSinceInstant(detail.completedAt, now);
  if (minutesSince == null || minutesSince < settings.delayMinutes) return false;

  if (settings.activeSince) {
    const activeSince = new Date(settings.activeSince);
    if (detail.completedAt.getTime() < activeSince.getTime()) return false;
  }

  return true;
}

export async function getClientsDueForReviewSms(supabase, settings, now = new Date()) {
  if (!settings?.active) return [];

  const { sent, pending } = await loadReviewSmsBlockedClientIds(supabase);

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, phone, preferred_language")
    .eq("opted_out", false)
    .not("phone", "is", null);

  if (clientsError) throw clientsError;
  if (!clients?.length) return [];

  const candidateClients = clients.filter(
    (client) => !sent.has(client.id) && !pending.has(client.id),
  );
  if (!candidateClients.length) return [];

  const candidateIds = candidateClients.map((client) => client.id);
  const { data: details, error: detailsError } = await supabase
    .from("details_completed")
    .select("client_id, completed_at, service_type, square_booking_id")
    .in("client_id", candidateIds);

  if (detailsError) throw detailsError;

  const latestByClient = getLatestCompletedDetailByClient(details ?? [], now);
  const due = [];

  for (const client of candidateClients) {
    const detail = latestByClient.get(client.id);
    if (!detailQualifies(detail, settings, now)) continue;

    due.push({
      clientId: client.id,
      name: client.name,
      phone: client.phone,
      preferredLanguage: client.preferred_language ?? "en",
      completedAt: detail.completedAt.toISOString(),
      serviceType: detail.serviceType,
      squareBookingId: detail.squareBookingId,
      minutesSinceDetail: Math.floor(minutesSinceInstant(detail.completedAt, now) ?? 0),
    });
  }

  due.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  return due;
}

export async function clientHasLifetimeReviewSms(supabase, clientId) {
  const { sent } = await loadReviewSmsBlockedClientIds(supabase);
  return sent.has(clientId);
}
