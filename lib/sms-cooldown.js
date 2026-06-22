const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Do not send any SMS if this client received one within the last N days. */
export const SMS_COOLDOWN_DAYS = 6;

/** Hourly scheduled job sends at most this many automated reminders per run. */
export const MAX_SCHEDULED_SMS_PER_RUN = 20;

export function getSmsCooldownCutoffIso(now = new Date()) {
  return new Date(now.getTime() - SMS_COOLDOWN_DAYS * MS_PER_DAY).toISOString();
}

export function formatSmsCooldownReason(lastSentAt) {
  const when = lastSentAt ? new Date(lastSentAt).toLocaleString() : "recently";
  return `SMS cooldown — already texted ${when} (wait ${SMS_COOLDOWN_DAYS} days between messages)`;
}

/**
 * Returns a Map clientId -> most recent sent_at for clients in cooldown.
 */
export async function getClientsInSmsCooldown(supabase, clientIds, { now = new Date() } = {}) {
  const inCooldown = new Map();
  if (!clientIds?.length) return inCooldown;

  const cutoffIso = getSmsCooldownCutoffIso(now);
  const uniqueIds = [...new Set(clientIds)];
  const chunkSize = 200;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("sms_log")
      .select("client_id, sent_at, created_at")
      .in("client_id", chunk)
      .eq("status", "sent")
      .gte("sent_at", cutoffIso);

    if (error) throw error;

    for (const row of data ?? []) {
      const sentAt = row.sent_at ?? row.created_at;
      if (!sentAt) continue;

      const existing = inCooldown.get(row.client_id);
      if (!existing || sentAt > existing) {
        inCooldown.set(row.client_id, sentAt);
      }
    }
  }

  return inCooldown;
}

export async function assertClientSmsCooldown(supabase, clientId) {
  const inCooldown = await getClientsInSmsCooldown(supabase, [clientId]);
  const lastSentAt = inCooldown.get(clientId);

  if (!lastSentAt) {
    return { ok: true };
  }

  return {
    ok: false,
    inCooldown: true,
    lastSentAt,
    reason: formatSmsCooldownReason(lastSentAt),
  };
}
