import { withAuth, jsonResponse, parseJsonBody } from "../../lib/auth.js";
import {
  loadManualSmsClients,
  loadManualSmsClientsByIds,
  sendManualSmsBulk,
} from "../../lib/manual-sms.js";
import { isProductionSmsEnabled, getSmsSafetyStatus } from "../../lib/sms.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();

  if (event.httpMethod === "GET") {
    try {
      const params = new URLSearchParams(event.queryStringParameters ?? {});
      const clients = await loadManualSmsClients(supabase, { search: params.get("q") });
      return jsonResponse({
        clients,
        ...getSmsSafetyStatus(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load clients";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseJsonBody(event) ?? {};
    const messageBody = typeof body.messageBody === "string" ? body.messageBody.trim() : "";

    if (!messageBody) {
      return jsonResponse({ error: "messageBody is required" }, 400);
    }

    if (!Array.isArray(body.clientIds) || body.clientIds.length === 0) {
      return jsonResponse({ error: "clientIds must be a non-empty array" }, 400);
    }

    if (!isProductionSmsEnabled()) {
      return jsonResponse(
        {
          error:
            "Production SMS sends are disabled. Set SMS_PRODUCTION_SENDS_ENABLED=true when ready.",
          productionSendsEnabled: false,
        },
        403,
      );
    }

    const clients = await loadManualSmsClientsByIds(supabase, body.clientIds);
    if (clients.length === 0) {
      return jsonResponse({ error: "No eligible clients found for the selected IDs" }, 400);
    }

    const { sent, failed } = await sendManualSmsBulk(supabase, clients, messageBody);

    return jsonResponse({
      ok: true,
      requested: body.clientIds.length,
      sentCount: sent.length,
      failedCount: failed.length,
      skippedCount: body.clientIds.length - clients.length,
      sent,
      failed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send manual SMS";
    console.error("api-manual-sms error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
