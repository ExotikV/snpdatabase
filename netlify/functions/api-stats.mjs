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

    const [attemptsResult, smsResult, convertedResult] = await Promise.all([
      supabase.from("booking_attempts").select("source, booked_at"),
      supabase
        .from("sms_log")
        .select("id, status, trigger_type, converted, sent_at")
        .eq("trigger_type", "maintenance_reminder"),
      supabase
        .from("sms_log")
        .select("id", { count: "exact", head: true })
        .eq("trigger_type", "maintenance_reminder")
        .eq("converted", true),
    ]);

    if (attemptsResult.error) throw attemptsResult.error;
    if (smsResult.error) throw smsResult.error;
    if (convertedResult.error) throw convertedResult.error;

    const sourceCounts = { direct: 0, sms_reminder: 0, qr_code: 0, other: 0 };
    const trendByDay = {};

    for (const row of attemptsResult.data ?? []) {
      const source = (row.source ?? "direct").toLowerCase();
      if (source in sourceCounts && source !== "other") {
        sourceCounts[source] += 1;
      } else {
        sourceCounts.other += 1;
      }

      const day = row.booked_at?.slice(0, 10);
      if (day) {
        if (!trendByDay[day]) {
          trendByDay[day] = { direct: 0, sms_reminder: 0, qr_code: 0, other: 0 };
        }
        if (source in trendByDay[day] && source !== "other") {
          trendByDay[day][source] += 1;
        } else {
          trendByDay[day].other += 1;
        }
      }
    }

    const totalBookings = (attemptsResult.data ?? []).length;
    const smsRows = smsResult.data ?? [];
    const sentCount = smsRows.filter((r) => r.status === "sent").length;
    const failedCount = smsRows.filter((r) => r.status === "failed").length;
    const convertedCount = convertedResult.count ?? 0;
    const conversionRate =
      sentCount > 0 ? Math.round((convertedCount / sentCount) * 1000) / 10 : 0;

    const bySource = ["direct", "sms_reminder", "qr_code", "other"].map((source) => ({
      source,
      label: SOURCE_LABELS[source] ?? (source === "other" ? "Other" : source),
      count: sourceCounts[source],
      percentage:
        totalBookings > 0
          ? Math.round((sourceCounts[source] / totalBookings) * 1000) / 10
          : 0,
    }));

    const trend = Object.entries(trendByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    return jsonResponse({
      totalBookings,
      bySource,
      trend,
      sms: { sent: sentCount, failed: failedCount, converted: convertedCount, conversionRate },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    return jsonResponse({ error: message }, 500);
  }
});
