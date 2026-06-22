import { jsonResponse, parseJsonBody, withAuth } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import {
  getEligibleCityLabels,
  getSmsTrackForClient,
  isEligibleCity,
  isMaintenanceProgramEligible,
} from "../../lib/client-tracks.js";
import { TRACK_LABELS } from "../../lib/tracks.js";

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();

  if (event.httpMethod === "GET") {
    try {
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, phone, city, opted_out, created_at")
        .order("name", { ascending: true })
        .limit(500);

      if (clientsError) throw clientsError;

      const clientIds = (clients ?? []).map((client) => client.id);
      let latestDetailByClient = new Map();

      if (clientIds.length > 0) {
        const { data: details, error: detailsError } = await supabase
          .from("details_completed")
          .select("client_id, completed_at")
          .in("client_id", clientIds);

        if (detailsError) throw detailsError;

        for (const row of details ?? []) {
          if (!row.completed_at) continue;
          const completedAt = new Date(row.completed_at);
          const existing = latestDetailByClient.get(row.client_id);
          if (!existing || completedAt > existing) {
            latestDetailByClient.set(row.client_id, completedAt);
          }
        }
      }

      const now = Date.now();
      const rows = (clients ?? []).map((client) => {
        const lastDetail = latestDetailByClient.get(client.id);
        const createdAt = new Date(client.created_at);
        const anchorDate = lastDetail ?? createdAt;
        const daysSinceAnchor = Math.floor((now - anchorDate.getTime()) / (24 * 60 * 60 * 1000));
        const daysSinceLastDetail = lastDetail
          ? Math.floor((now - lastDetail.getTime()) / (24 * 60 * 60 * 1000))
          : null;

        const maintenanceEligible = isMaintenanceProgramEligible({
          city: client.city,
          daysSinceLastDetail: daysSinceLastDetail,
          hasCompletedDetail: Boolean(lastDetail),
        });

        const smsTrack = client.opted_out
          ? null
          : getSmsTrackForClient({
              city: client.city,
              daysSinceLastDetail,
              hasCompletedDetail: Boolean(lastDetail),
            });

        return {
          clientId: client.id,
          name: client.name,
          phone: client.phone,
          city: client.city,
          optedOut: client.opted_out,
          cityEligible: isEligibleCity(client.city),
          maintenanceCityEligible: isEligibleCity(client.city),
          maintenanceEligible,
          smsTrack,
          smsTrackLabel: smsTrack ? TRACK_LABELS[smsTrack] : "Opted out",
          daysSinceLastDetail,
          daysSinceAnchor,
          smsEnrolled: !client.opted_out,
        };
      });

      return jsonResponse({
        clients: rows,
        eligibleCities: getEligibleCityLabels(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load clients";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (event.httpMethod === "PATCH") {
    try {
      const body = parseJsonBody(event) ?? {};
      if (!body.clientId) {
        return jsonResponse({ error: "clientId required" }, 400);
      }

      if (body.city === undefined) {
        return jsonResponse({ error: "city required" }, 400);
      }

      const city = typeof body.city === "string" ? body.city.trim() : "";

      const { error: updateError } = await supabase
        .from("clients")
        .update({ city: city || null })
        .eq("id", body.clientId);

      if (updateError) throw updateError;

      return jsonResponse({ ok: true, clientId: body.clientId, city: city || null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update city";
      return jsonResponse({ error: message }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
