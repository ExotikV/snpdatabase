import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getWeeklyOverview } from "../../lib/weekly-overview.js";
import { getSupabase } from "../../lib/supabase.js";
import { runMatchConversions } from "../../lib/conversions.js";

export const handler = withAuth(async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getSupabase();
    await runMatchConversions(supabase);
    const data = await getWeeklyOverview(supabase, { syncFirst: true });
    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load weekly overview";
    return jsonResponse({ error: message }, 500);
  }
});
