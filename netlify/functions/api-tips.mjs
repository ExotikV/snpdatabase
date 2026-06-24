import { withAuth, jsonResponse, parseJsonBody } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import {
  createTip,
  getTipsDashboard,
  loadRecentDetailsForClient,
} from "../../lib/tips.js";

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();
  const method = event.httpMethod;

  if (method === "GET") {
    try {
      const params = event.queryStringParameters ?? {};
      const period = params.period ?? "this_month";
      const year = params.year ? Number(params.year) : undefined;

      if (params.clientId) {
        const details = await loadRecentDetailsForClient(supabase, params.clientId);
        return jsonResponse({ details });
      }

      const data = await getTipsDashboard(supabase, { period, year });
      return jsonResponse(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load tips";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (method === "POST") {
    try {
      const body = parseJsonBody(event);
      if (!body) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      const tip = await createTip(supabase, body);
      return jsonResponse({ ok: true, tip }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save tip";
      return jsonResponse({ error: message }, 400);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
