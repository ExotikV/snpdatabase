import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getSmsSchedulePreview } from "../../lib/sms-schedule-preview.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async (event) => {
  try {
    const supabase = getSupabase();
    const params = event.queryStringParameters ?? {};
    const syncFirst = params.sync === "1";
    const preview = await getSmsSchedulePreview(supabase, { syncFirst });
    return jsonResponse(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load SMS schedule preview";
    return jsonResponse({ error: message }, 500);
  }
});
