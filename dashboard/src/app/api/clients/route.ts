import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const minDaysSinceDetail = Number(searchParams.get("minDaysSinceDetail") ?? "0");
    const maintenanceOnly = searchParams.get("maintenanceOnly") === "true";

    const [clientsResult, detailsResult, enrollmentsResult] = await Promise.all([
      supabase.from("clients").select("id, name, phone, opted_out").order("name"),
      supabase.from("details_completed").select("client_id, completed_at"),
      supabase
        .from("maintenance_enrollment")
        .select("client_id")
        .eq("active", true),
    ]);

    for (const result of [clientsResult, detailsResult, enrollmentsResult]) {
      if (result.error) {
        throw result.error;
      }
    }

    const latestDetailByClient = new Map<string, Date>();
    for (const row of detailsResult.data ?? []) {
      if (!row.completed_at) {
        continue;
      }
      const completedAt = new Date(row.completed_at);
      const existing = latestDetailByClient.get(row.client_id);
      if (!existing || completedAt > existing) {
        latestDetailByClient.set(row.client_id, completedAt);
      }
    }

    const enrolledClientIds = new Set(
      (enrollmentsResult.data ?? []).map((row) => row.client_id),
    );

    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;

    const clients = (clientsResult.data ?? [])
      .filter((client) => !client.opted_out)
      .map((client) => {
        const lastDetail = latestDetailByClient.get(client.id);
        const daysSinceDetail = lastDetail
          ? Math.floor((now.getTime() - lastDetail.getTime()) / msPerDay)
          : null;

        return {
          id: client.id,
          name: client.name ?? "(no name)",
          phone: client.phone ?? "",
          daysSinceDetail,
          lastDetailDate: lastDetail ? lastDetail.toISOString().slice(0, 10) : null,
          enrolledInMaintenance: enrolledClientIds.has(client.id),
        };
      })
      .filter((client) => {
        if (maintenanceOnly && !client.enrolledInMaintenance) {
          return false;
        }
        if (minDaysSinceDetail > 0) {
          if (client.daysSinceDetail == null) {
            return true;
          }
          return client.daysSinceDetail >= minDaysSinceDetail;
        }
        return true;
      });

    return NextResponse.json({ clients });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load clients";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
