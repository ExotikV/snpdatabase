import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getSmsSchedulePreview } from "../../lib/sms-schedule-preview.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async () => {
  try {
    const supabase = getSupabase();
    const preview = await getSmsSchedulePreview(supabase);
    return jsonResponse(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load SMS schedule preview";
    return jsonResponse({ error: message }, 500);
  }
});
