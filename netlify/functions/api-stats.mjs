import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getDashboardStats } from "../../lib/dashboard-stats.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async () => {
  try {
    const supabase = getSupabase();
    const stats = await getDashboardStats(supabase);
    return jsonResponse(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    return jsonResponse({ error: message }, 500);
  }
});
