import { getOptOutStatusLabel } from "./sms-opt-out.js";

export async function getSmsSubscriberStats(supabase) {
  const { data, error } = await supabase
    .from("clients")
    .select("opted_out, opted_out_source");

  if (error) throw error;

  let receiving = 0;
  let unsubscribedStop = 0;
  let excludedManual = 0;

  for (const client of data ?? []) {
    if (!client.opted_out) {
      receiving += 1;
    } else if (client.opted_out_source === "stop_reply") {
      unsubscribedStop += 1;
    } else {
      excludedManual += 1;
    }
  }

  const total = (data ?? []).length;
  const optedOut = unsubscribedStop + excludedManual;

  return { total, receiving, unsubscribedStop, excludedManual, optedOut };
}

export function formatSmsSubscriberRow(client) {
  const receiving = !client.opted_out;
  return {
    clientId: client.id,
    name: client.name,
    phone: client.phone,
    receiving,
    optedOut: Boolean(client.opted_out),
    optedOutAt: client.opted_out_at ?? null,
    optedOutSource: client.opted_out_source ?? null,
    statusLabel: receiving
      ? "Receiving SMS"
      : getOptOutStatusLabel(client.opted_out_source),
  };
}
