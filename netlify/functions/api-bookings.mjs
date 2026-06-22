import { withAuth, jsonResponse } from "../../lib/auth.js";
import { resolveSmsLogId } from "../../lib/booking-url.js";
import { hasRevenueColumns } from "../../lib/revenue.js";
import { getSupabase } from "../../lib/supabase.js";
import { BOOKING_SOURCE_LABELS, TRIGGER_LABELS, normalizeBookingSource } from "../../lib/tracks.js";

export const handler = withAuth(async () => {
  try {
    const supabase = getSupabase();
    const includeRevenue = await hasRevenueColumns(supabase);

    const select = includeRevenue
      ? "id, source, phone, booked_at, processed, ref, raw_note, booked_revenue_cents, actual_revenue_cents, revenue_status, square_booking_id"
      : "id, source, phone, booked_at, processed, ref, raw_note";

    const { data: attempts, error: attemptsError } = await supabase
      .from("booking_attempts")
      .select(select)
      .order("booked_at", { ascending: false })
      .limit(100);

    if (attemptsError) throw attemptsError;

    const smsLogIds = new Set();
    const refToSmsLogId = new Map();

    for (const row of attempts ?? []) {
      if (!row.ref) continue;
      const smsLogId = await resolveSmsLogId(supabase, row.ref);
      if (!smsLogId) continue;
      refToSmsLogId.set(row.ref, smsLogId);
      smsLogIds.add(smsLogId);
    }

    let smsById = new Map();
    if (smsLogIds.size > 0) {
      const { data: smsRows, error: smsError } = await supabase
        .from("sms_log")
        .select("id, status, sent_at, converted, trigger_type")
        .in("id", [...smsLogIds]);

      if (smsError) throw smsError;
      smsById = new Map((smsRows ?? []).map((row) => [row.id, row]));
    }

    const rows = (attempts ?? []).map((row) => {
      const source = normalizeBookingSource(row.source);
      const smsLogId = row.ref ? refToSmsLogId.get(row.ref) : null;
      const linkedSms = smsLogId ? smsById.get(smsLogId) : null;

      return {
        id: row.id,
        source,
        sourceLabel: BOOKING_SOURCE_LABELS[source] ?? source,
        phone: row.phone,
        bookedAt: row.booked_at,
        processed: row.processed,
        rawNote: row.raw_note,
        bookedRevenueCents: includeRevenue ? row.booked_revenue_cents : null,
        actualRevenueCents: includeRevenue ? row.actual_revenue_cents : null,
        revenueStatus: includeRevenue ? row.revenue_status : null,
        squareBookingId: includeRevenue ? row.square_booking_id : null,
        linkedSms: linkedSms
          ? {
              status: linkedSms.status,
              sentAt: linkedSms.sent_at,
              converted: linkedSms.converted,
              trackLabel: TRIGGER_LABELS[linkedSms.trigger_type] ?? linkedSms.trigger_type,
            }
          : null,
      };
    });

    return jsonResponse({ bookings: rows, revenueMigrationRequired: !includeRevenue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load bookings";
    return jsonResponse({ error: message }, 500);
  }
});
