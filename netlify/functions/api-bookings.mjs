import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";

const SOURCE_LABELS = {
  direct: "Website (direct)",
  sms_reminder: "SMS reminder",
  qr_code: "QR code",
};

export const handler = withAuth(async () => {
  try {
    const supabase = getSupabase();

    const { data: attempts, error: attemptsError } = await supabase
      .from("booking_attempts")
      .select("id, source, phone, booked_at, processed, ref, raw_note")
      .order("booked_at", { ascending: false })
      .limit(100);

    if (attemptsError) throw attemptsError;

    const refs = (attempts ?? [])
      .map((row) => row.ref)
      .filter((ref) => ref != null);

    let smsById = new Map();
    if (refs.length > 0) {
      const { data: smsRows, error: smsError } = await supabase
        .from("sms_log")
        .select("id, status, sent_at, converted")
        .in("id", refs);

      if (smsError) throw smsError;
      smsById = new Map((smsRows ?? []).map((row) => [row.id, row]));
    }

    const rows = (attempts ?? []).map((row) => {
      const source = (row.source ?? "direct").toLowerCase();
      const linkedSms = row.ref ? smsById.get(row.ref) : null;

      return {
        id: row.id,
        source,
        sourceLabel: SOURCE_LABELS[source] ?? source,
        phone: row.phone,
        bookedAt: row.booked_at,
        processed: row.processed,
        rawNote: row.raw_note,
        linkedSms: linkedSms
          ? {
              status: linkedSms.status,
              sentAt: linkedSms.sent_at,
              converted: linkedSms.converted,
            }
          : null,
      };
    });

    return jsonResponse({ bookings: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load bookings";
    return jsonResponse({ error: message }, 500);
  }
});
