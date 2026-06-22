import { getSupabase } from "../../lib/supabase.js";
import { getEligibleClients } from "../../lib/eligibility.js";
import { sendReminders } from "../../lib/sms.js";
import { runMatchConversions } from "../../lib/conversions.js";
import { runSquareSync } from "../../lib/square-sync.js";

export const handler = async () => {
  const startedAt = new Date().toISOString();
  console.log(`[scheduled-reminders] Starting at ${startedAt}`);

  try {
    const supabase = getSupabase();

    const squareStats = await runSquareSync({ customersOnly: true });
    console.log("[scheduled-reminders] Square customer sync:", JSON.stringify(squareStats));

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
          squareSync: squareStats,
          conversions: conversionStats,
        }),
      };
    }

    const { sent, failed } = await sendReminders(supabase, eligible);

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
        squareSync: squareStats,
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
