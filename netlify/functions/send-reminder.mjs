import { withAuth, jsonResponse, parseJsonBody } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import { getEligibleClients } from "../../lib/eligibility.js";
import { sendMaintenanceReminderToClient } from "../../lib/sms.js";

export const handler = withAuth(async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseJsonBody(event) ?? {};
    const supabase = getSupabase();

    if (body.clientId) {
      const eligible = await getEligibleClients(supabase, { clientId: body.clientId });
      const client = eligible[0];

      if (!client) {
        return jsonResponse(
          { error: "Client is not eligible for a reminder right now (wrong step or timing)" },
          400,
        );
      }

      const result = await sendMaintenanceReminderToClient(supabase, client);
      return jsonResponse(
        result.ok ? { ok: true, result } : { ok: false, result },
        result.ok ? 200 : 500,
      );
    }

    const eligible = await getEligibleClients(supabase);
    if (eligible.length === 0) {
      return jsonResponse({ ok: true, sent: [], failed: [], totalEligible: 0 });
    }

    const sent = [];
    const failed = [];

    for (const client of eligible) {
      const result = await sendMaintenanceReminderToClient(supabase, client);
      if (result.ok) sent.push(result);
      else failed.push(result);
    }

    return jsonResponse({
      ok: true,
      totalEligible: eligible.length,
      sentCount: sent.length,
      failedCount: failed.length,
      sent,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send reminder";
    console.error("send-reminder error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
