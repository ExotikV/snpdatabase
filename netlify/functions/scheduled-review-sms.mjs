import { syncSquareAppointments } from "../../lib/appointment-sync.js";
import { runReviewSmsJob } from "../../lib/review-sms.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = async () => {
  console.log("[scheduled-review-sms] Starting review SMS run...");
  try {
    const supabase = getSupabase();

    console.log("[scheduled-review-sms] Syncing appointments for fresh completed details...");
    const syncStats = await syncSquareAppointments(supabase, { mode: "hourly" });
    console.log("[scheduled-review-sms] Appointment sync:", JSON.stringify(syncStats));

    const result = await runReviewSmsJob(supabase);
    console.log("[scheduled-review-sms] Complete:", JSON.stringify(result));

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, syncStats, ...result }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-review-sms] Fatal:", message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: message }) };
  }
};

export const config = {
  schedule: "*/15 * * * *",
};
