import { applyBackendEnvFromDashboard } from "@/lib/sync-env";

export async function runDailySyncOnNetlify() {
  applyBackendEnvFromDashboard();
  const { runDailySync } = await import("../../../../daily-sync.js");
  return runDailySync();
}
