import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function monthBounds(month: string) {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const month =
      searchParams.get("month") ??
      new Date().toISOString().slice(0, 7);
    const { start, end } = monthBounds(month);

    const now = new Date();
    const thisMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();

    const [
      allSentResult,
      monthSentResult,
      reminderSentResult,
      convertedResult,
      bookingSourcesResult,
      detailsInRangeResult,
      firstDetailsResult,
    ] = await Promise.all([
      supabase
        .from("sms_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent"),
      supabase
        .from("sms_log")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", thisMonthStart),
      supabase
        .from("sms_log")
        .select("id", { count: "exact", head: true })
        .eq("trigger_type", "maintenance_reminder")
        .eq("status", "sent"),
      supabase
        .from("sms_log")
        .select("id", { count: "exact", head: true })
        .eq("trigger_type", "maintenance_reminder")
        .eq("status", "sent")
        .eq("converted", true),
      supabase.from("booking_attempts").select("source"),
      supabase
        .from("details_completed")
        .select("client_id")
        .gte("completed_at", start)
        .lt("completed_at", end),
      supabase.from("details_completed").select("client_id, completed_at"),
    ]);

    for (const result of [
      allSentResult,
      monthSentResult,
      reminderSentResult,
      convertedResult,
      bookingSourcesResult,
      detailsInRangeResult,
      firstDetailsResult,
    ]) {
      if (result.error) {
        throw result.error;
      }
    }

    const sourceCounts = {
      sms_reminder: 0,
      qr_code: 0,
      direct: 0,
    };

    for (const row of bookingSourcesResult.data ?? []) {
      const source = (row.source ?? "direct").toLowerCase();
      if (source in sourceCounts) {
        sourceCounts[source as keyof typeof sourceCounts] += 1;
      }
    }

    const firstDetailByClient = new Map<string, string>();
    for (const row of firstDetailsResult.data ?? []) {
      if (!row.completed_at) {
        continue;
      }
      const existing = firstDetailByClient.get(row.client_id);
      if (!existing || row.completed_at < existing) {
        firstDetailByClient.set(row.client_id, row.completed_at);
      }
    }

    const clientsInRange = new Set(
      (detailsInRangeResult.data ?? []).map((row) => row.client_id),
    );

    let newClients = 0;
    let returningClients = 0;

    for (const clientId of clientsInRange) {
      const firstDetail = firstDetailByClient.get(clientId);
      if (!firstDetail) {
        continue;
      }
      if (firstDetail >= start && firstDetail < end) {
        newClients += 1;
      } else {
        returningClients += 1;
      }
    }

    const reminderSent = reminderSentResult.count ?? 0;
    const converted = convertedResult.count ?? 0;
    const conversionRate =
      reminderSent > 0 ? Math.round((converted / reminderSent) * 1000) / 10 : 0;

    return NextResponse.json({
      month,
      smsSentAllTime: allSentResult.count ?? 0,
      smsSentThisMonth: monthSentResult.count ?? 0,
      conversionRate,
      convertedCount: converted,
      reminderSentCount: reminderSent,
      bookingSources: sourceCounts,
      clientSplit: {
        newClients,
        returningClients,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
