import { getDashboardStats } from "./dashboard-stats.js";
import { getWeeklyOverview } from "./weekly-overview.js";

/** Single overview payload — avoids duplicate API round-trips from the dashboard home page. */
export async function getOverviewPageData(supabase, { syncFirst = false } = {}) {
  const [stats, weekly] = await Promise.all([
    getDashboardStats(supabase),
    getWeeklyOverview(supabase, { syncFirst }),
  ]);

  return { stats, weekly };
}
