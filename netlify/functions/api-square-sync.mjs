import { jsonResponse, parseJsonBody, withAuth } from "../../lib/auth.js";
import { runSquareSync } from "../../lib/square-sync.js";

export const handler = withAuth(async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseJsonBody(event) ?? {};
    const customersOnly = body.customersOnly === true;

    const stats = await runSquareSync({ customersOnly });
    return jsonResponse({ ok: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Square sync failed";
    console.error("[api-square-sync]", message);
    return jsonResponse({ error: message }, 500);
  }
});
