import { withAuth, jsonResponse } from "../../lib/auth.js";
import { runMatchConversions } from "../../lib/conversions.js";
import { getDashboardStats } from "../../lib/dashboard-stats.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async () => {
  try {
    const supabase = getSupabase();
    await runMatchConversions(supabase);
    const stats = await getDashboardStats(supabase);
    return jsonResponse(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    return jsonResponse({ error: message }, 500);
  }
});
