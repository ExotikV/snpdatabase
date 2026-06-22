import { resolveBookingSource, resolveSmsLogId } from "./booking-url.js";
import { normalizeLanguage } from "./languages.js";
import { hasRevenueColumns } from "./revenue.js";

const TRACKED_SOURCES = new Set([
  "direct",
  "sms_reminder",
  "general_reminder",
  "general_after_maintenance_reminder",
  "qr_maintenance",
  "qr_general",
]);

function pickString(...values) {
  for (const value of values) {
    const trimmed = String(value ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Insert a booking_attempts row for the website or internal callers.
 * When ref is present, source is resolved from sms_log.trigger_type (authoritative).
 */
export async function recordBookingAttempt(supabase, payload = {}) {
  const ref = pickString(payload.ref);
  const sourceCode = pickString(payload.sourceCode, payload.source_code);
  let source = pickString(payload.source)?.toLowerCase() ?? null;

  if (ref) {
    const smsLogId = await resolveSmsLogId(supabase, ref);
    if (!smsLogId) {
      return { ok: false, status: 400, error: `Unknown SMS ref: ${ref}` };
    }
    source = await resolveBookingSource(supabase, { ref, sourceCode });
  } else if (!source || !TRACKED_SOURCES.has(source)) {
    source = "direct";
  }

  const insert = {
    source,
    ref,
    phone: pickString(payload.phone),
    square_customer_id: pickString(payload.square_customer_id, payload.squareCustomerId),
    square_booking_id: pickString(payload.square_booking_id, payload.squareBookingId),
    raw_note: pickString(payload.raw_note, payload.rawNote),
    processed: false,
  };

  const preferredLanguage = pickString(payload.preferred_language, payload.preferredLanguage);
  if (preferredLanguage) {
    insert.preferred_language = normalizeLanguage(preferredLanguage);
  }

  if (await hasRevenueColumns(supabase)) {
    const bookedRevenueCents = payload.booked_revenue_cents ?? payload.bookedRevenueCents;
    if (bookedRevenueCents != null && bookedRevenueCents !== "") {
      insert.booked_revenue_cents = Number(bookedRevenueCents);
    }
    if (insert.square_booking_id) {
      insert.revenue_status = "booked";
    }
  }

  const { data, error } = await supabase
    .from("booking_attempts")
    .insert(insert)
    .select("id, source, ref, booked_at")
    .single();

  if (error) {
    if (error.code === "22P02" && ref) {
      return {
        ok: false,
        status: 503,
        error:
          "booking_attempts.ref is still uuid — run schema/booking_attempts_ref_text.sql in Supabase",
      };
    }
    throw error;
  }

  const { runMatchConversions } = await import("./conversions.js");
  await runMatchConversions(supabase);

  return { ok: true, booking: data };
}
