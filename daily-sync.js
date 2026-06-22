import { runPull } from "./pull.js";
import { runMatchConversions } from "./match_conversions.js";
import { runSendReminders } from "./send_reminders.js";

/**
 * Nightly pipeline: Square pull → maintenance SMS → conversion matching.
 * Used by Netlify scheduled cron and optional manual triggers.
 */
export async function runDailySync() {
  const startedAt = new Date().toISOString();
  console.log(`Daily sync started at ${startedAt}`);

  await runPull();
  await runSendReminders();
  await runMatchConversions();

  const finishedAt = new Date().toISOString();
  console.log(`Daily sync finished at ${finishedAt}`);

  return { ok: true, startedAt, finishedAt };
}
