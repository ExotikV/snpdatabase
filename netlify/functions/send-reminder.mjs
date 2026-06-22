import { withAuth, jsonResponse, parseJsonBody } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import { getEligibleClients } from "../../lib/eligibility.js";
import { isProductionSmsEnabled, sendReminderToClient, sendReminders } from "../../lib/sms.js";

export const handler = withAuth(async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseJsonBody(event) ?? {};
    const supabase = getSupabase();

    if (!isProductionSmsEnabled()) {
      return jsonResponse(
        {
          error:
            "Production SMS sends are disabled. Use Test SMS on the Schedule page, or set SMS_PRODUCTION_SENDS_ENABLED=true when ready.",
          productionSendsEnabled: false,
        },
        403,
      );
    }

    if (body.clientId) {
      const eligible = await getEligibleClients(supabase, {
        clientId: body.clientId,
        track: body.track,
      });
      const client = eligible[0];

      if (!client) {
        return jsonResponse(
          { error: "Client is not due for a reminder right now on their current track" },
          400,
        );
      }

      const result = await sendReminderToClient(supabase, client);
      return jsonResponse(
        result.ok ? { ok: true, result } : { ok: false, result },
        result.ok ? 200 : 500,
      );
    }

    const eligible = await getEligibleClients(supabase, { track: body.track });
    if (eligible.length === 0) {
      return jsonResponse({ ok: true, sent: [], failed: [], totalEligible: 0 });
    }

    const { sent, failed } = await sendReminders(supabase, eligible);

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
