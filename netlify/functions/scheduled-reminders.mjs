import { runMatchConversions } from "../../lib/conversions.js";
import { getEligibleClients } from "../../lib/eligibility.js";
import { runSquareSync } from "../../lib/square-sync.js";
import { MAX_SCHEDULED_SMS_PER_RUN } from "../../lib/sms-cooldown.js";
import { assertSmsSendWindow, getSmsSendWindowLabel } from "../../lib/sms-send-window.js";
import { isProductionSmsEnabled, sendReminders } from "../../lib/sms.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = async () => {
  console.log("[scheduled-reminders] Starting hourly reminder run...");

  if (!isProductionSmsEnabled()) {
    const message =
      "Skipped — SMS_PRODUCTION_SENDS_ENABLED is not true. Set it to true on Netlify to run automatic sequences.";
    console.log(`[scheduled-reminders] ${message}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: message }) };
  }

  const sendWindowGate = assertSmsSendWindow();
  if (!sendWindowGate.ok) {
    console.log(`[scheduled-reminders] ${sendWindowGate.reason}`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        skipped: true,
        outsideSendWindow: true,
        reason: sendWindowGate.reason,
      }),
    };
  }

  try {
    const supabase = getSupabase();

    console.log("[scheduled-reminders] Syncing customer cities from Square...");
    const squareStats = await runSquareSync({ customersOnly: true });
    console.log("[scheduled-reminders] Square sync:", JSON.stringify(squareStats));

    const conversionStats = await runMatchConversions(supabase);
    console.log("[scheduled-reminders] Conversions:", JSON.stringify(conversionStats));

    const eligible = await getEligibleClients(supabase);
    const batch = eligible.slice(0, MAX_SCHEDULED_SMS_PER_RUN);
    const deferredByCap = Math.max(0, eligible.length - batch.length);

    console.log(
      `[scheduled-reminders] ${eligible.length} due — sending ${batch.length} now` +
        (deferredByCap > 0 ? ` (${deferredByCap} deferred — per-run cap ${MAX_SCHEDULED_SMS_PER_RUN})` : "") +
        `. Send window: ${getSmsSendWindowLabel()}.`,
    );

    if (batch.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          totalEligible: eligible.length,
          sentCount: 0,
          failedCount: 0,
          deferredByCap,
          squareStats,
          conversionStats,
        }),
      };
    }

    const { sent, failed } = await sendReminders(supabase, batch);
    console.log(
      `[scheduled-reminders] Complete — sent ${sent.length}, failed ${failed.length}`,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        totalEligible: eligible.length,
        batchSize: batch.length,
        deferredByCap,
        sentCount: sent.length,
        failedCount: failed.length,
        sent,
        failed,
        squareStats,
        conversionStats,
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
