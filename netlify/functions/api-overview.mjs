import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getOverviewPageData } from "../../lib/overview-page.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = getSupabase();
    const params = event.queryStringParameters ?? {};
    const syncFirst = params.sync === "1";
    const data = await getOverviewPageData(supabase, { syncFirst });
    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load overview";
    return jsonResponse({ error: message }, 500);
  }
});
