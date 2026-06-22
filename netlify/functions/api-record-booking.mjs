import { jsonResponse, parseJsonBody } from "../../lib/auth.js";
import { recordBookingAttempt } from "../../lib/record-booking.js";
import { getSupabase } from "../../lib/supabase.js";

function checkBookingApiAuth(event) {
  const secret = process.env.BOOKING_API_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "BOOKING_API_SECRET is not configured on Netlify",
    };
  }

  const headers = event.headers ?? {};
  const header = headers.authorization ?? headers.Authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token !== secret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = checkBookingApiAuth(event);
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, auth.status);
  }

  const body = parseJsonBody(event);
  if (!body) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  try {
    const supabase = getSupabase();
    const result = await recordBookingAttempt(supabase, body);

    if (!result.ok) {
      return jsonResponse({ error: result.error }, result.status);
    }

    return jsonResponse({
      ok: true,
      id: result.booking.id,
      source: result.booking.source,
      ref: result.booking.ref,
      bookedAt: result.booking.booked_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record booking";
    return jsonResponse({ error: message }, 500);
  }
};
