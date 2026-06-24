import { withAuth, jsonResponse, parseJsonBody } from "../../lib/auth.js";
import { getClientsDueForReviewSms } from "../../lib/review-sms-eligibility.js";
import {
  loadReviewSmsSentHistory,
  loadReviewSmsSettings,
  saveReviewSmsSettings,
} from "../../lib/review-sms-settings.js";
import { getSmsSafetyStatus } from "../../lib/sms.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();

  if (event.httpMethod === "GET") {
    try {
      const [settings, sentHistory, dueNow] = await Promise.all([
        loadReviewSmsSettings(supabase),
        loadReviewSmsSentHistory(supabase),
        loadReviewSmsSettings(supabase).then((loaded) =>
          loaded.active && !loaded.migrationRequired
            ? getClientsDueForReviewSms(supabase, loaded)
            : [],
        ),
      ]);

      return jsonResponse({
        settings,
        sentHistory,
        dueNow,
        dueCount: dueNow.length,
        sentCount: sentHistory.filter((row) => row.status === "sent").length,
        ...getSmsSafetyStatus(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load review SMS settings";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (event.httpMethod !== "PUT") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseJsonBody(event) ?? {};
    const settings = await saveReviewSmsSettings(supabase, {
      active: body.active,
      delayMinutes: body.delayMinutes,
      reviewUrl: body.reviewUrl,
      messageBodyEn: body.messageBodyEn,
      messageBodyFr: body.messageBodyFr,
    });

    return jsonResponse({ ok: true, settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save review SMS settings";
    return jsonResponse({ error: message }, 500);
  }
});
