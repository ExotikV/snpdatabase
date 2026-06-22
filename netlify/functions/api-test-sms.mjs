import { jsonResponse, parseJsonBody, withAuth } from "../../lib/auth.js";
import { toDateInputValue } from "../../lib/dates.js";
import { getSupabase } from "../../lib/supabase.js";
import { getTestPhoneNumber, sendTestReminderSms } from "../../lib/sms.js";

function daysBetween(earlier, later) {
  return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

async function loadTestClients(supabase, search) {
  let query = supabase
    .from("clients")
    .select("id, name, phone, city")
    .eq("opted_out", false)
    .not("phone", "is", null)
    .order("name", { ascending: true })
    .limit(300);

  if (search?.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }

  const { data: clients, error: clientsError } = await query;
  if (clientsError) throw clientsError;
  if (!clients?.length) return [];

  const clientIds = clients.map((client) => client.id);
  const { data: details, error: detailsError } = await supabase
    .from("details_completed")
    .select("client_id, completed_at, service_type")
    .in("client_id", clientIds);

  if (detailsError) throw detailsError;

  const latestByClient = new Map();
  for (const row of details ?? []) {
    if (!row.completed_at) continue;
    const completedAt = new Date(row.completed_at);
    if (Number.isNaN(completedAt.getTime())) continue;

    const existing = latestByClient.get(row.client_id);
    if (!existing || completedAt > existing.completedAt) {
      latestByClient.set(row.client_id, {
        completedAt,
        serviceType: row.service_type ?? null,
      });
    }
  }

  const now = new Date();

  return clients.map((client) => {
    const last = latestByClient.get(client.id);
    const lastDetailDate = last ? toDateInputValue(last.completedAt) : null;
    const daysSince = last
      ? daysBetween(last.completedAt, now)
      : null;

    return {
      clientId: client.id,
      name: client.name,
      phone: client.phone,
      city: client.city,
      lastServiceType: last?.serviceType ?? null,
      lastDetailDate,
      daysSince,
    };
  });
}

export const handler = withAuth(async (event) => {
  if (event.httpMethod === "GET") {
    try {
      const supabase = getSupabase();
      const search = event.queryStringParameters?.q ?? "";
      const clients = await loadTestClients(supabase, search);
      return jsonResponse({ testPhone: getTestPhoneNumber(), clients });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load test options";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseJsonBody(event) ?? {};
    const result = await sendTestReminderSms({
      messageBody: body.message_body,
      daysSince: body.days_since,
      phone: body.phone,
      track: body.track ?? "maintenance",
      clientName: body.client_name,
      serviceType: body.service_type,
      lastDetailDate: body.last_detail_date,
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, ...result }, 500);
    }

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send test SMS";
    return jsonResponse({ error: message }, 500);
  }
});
