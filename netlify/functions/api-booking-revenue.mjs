import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getBookingRevenueDashboard } from "../../lib/booking-revenue.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getSupabase();

    const params = event.queryStringParameters ?? {};
    const period = params.period ?? "this_month";
    const year = params.year ? Number(params.year) : undefined;
    const data = await getBookingRevenueDashboard(supabase, { period, year });
    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load booking revenue";
    return jsonResponse({ error: message }, 500);
  }
});
