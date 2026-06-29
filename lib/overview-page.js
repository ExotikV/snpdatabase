import { getDashboardStats } from "./dashboard-stats.js";
import { syncSquareAppointments } from "./appointment-sync.js";
import { getWeeklyOverview } from "./weekly-overview.js";

/** Single overview payload — avoids duplicate API round-trips from the dashboard home page. */
export async function getOverviewPageData(supabase, { syncFirst = false } = {}) {
  if (syncFirst) {
    await syncSquareAppointments(supabase, { mode: "hourly" });
  }

  const [stats, weekly] = await Promise.all([
    getDashboardStats(supabase),
    getWeeklyOverview(supabase, { syncFirst: false }),
  ]);

  return { stats, weekly };
}
