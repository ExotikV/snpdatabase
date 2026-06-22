import { getSupabase } from "../../lib/supabase.js";
import { getEligibleClients } from "../../lib/eligibility.js";
import { sendMaintenanceReminders } from "../../lib/sms.js";
import { runMatchConversions } from "../../lib/conversions.js";

export const handler = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[scheduled-reminders] Starting at ${startedAt}`);

  try {
    const supabase = getSupabase();

    const conversionStats = await runMatchConversions(supabase);
    console.log("[scheduled-reminders] Conversion matching:", JSON.stringify(conversionStats));

    const eligible = await getEligibleClients(supabase);
    console.log(`[scheduled-reminders] ${eligible.length} eligible client(s)`);

    if (eligible.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          eligible: 0,
          sent: 0,
          failed: 0,
          conversions: conversionStats,
        }),
      };
    }

    const { sent, failed } = await sendMaintenanceReminders(supabase, eligible);

    console.log(`[scheduled-reminders] Sent: ${sent.length}, Failed: ${failed.length}`);
    for (const item of failed) {
      console.error(`[scheduled-reminders] Failed ${item.name}: ${item.reason}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        eligible: eligible.length,
        sent: sent.length,
        failed: failed.length,
        conversions: conversionStats,
        failedDetails: failed,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-reminders] Fatal:", message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: message }) };
  }
};

export const config = {
  schedule: "0 * * * *",
};
