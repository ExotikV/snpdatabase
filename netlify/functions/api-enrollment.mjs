import { jsonResponse, parseJsonBody, withAuth } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import {
  getEligibleCityLabels,
  getGeneralFirstReminderMinDays,
  getSmsTrackForClient,
  isEligibleCity,
  isMaintenanceProgramEligible,
  isWaitingForGeneralStart,
} from "../../lib/client-tracks.js";
import { daysSinceLastDetail as countDaysSinceDetail } from "../../lib/dates.js";
import { getLatestCompletedDetailByClient } from "../../lib/completed-details.js";
import { TRACK_LABELS } from "../../lib/tracks.js";
import { LANGUAGE_LABELS, normalizeLanguage } from "../../lib/languages.js";
import { getOptOutStatusLabel, OPT_OUT_SOURCES } from "../../lib/sms-opt-out.js";

function buildSmsTrackLabel({ optedOut, optedOutLabel, smsTrack, daysSinceLastDetail }) {
  if (optedOut) return optedOutLabel;
  if (!smsTrack) return "No completed detail";

  if (
    (smsTrack === "general" || smsTrack === "general_after_maintenance") &&
    daysSinceLastDetail != null &&
    isWaitingForGeneralStart({ track: smsTrack, daysSinceLastDetail })
  ) {
    const minDays = getGeneralFirstReminderMinDays({ track: smsTrack });
    return `${TRACK_LABELS[smsTrack]} (starts at ${minDays} days)`;
  }

  return TRACK_LABELS[smsTrack] ?? smsTrack;
}

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();

  if (event.httpMethod === "GET") {
    try {
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, phone, city, opted_out, opted_out_at, opted_out_source, created_at, preferred_language")
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

        const now = new Date();
        const detailMap = getLatestCompletedDetailByClient(details ?? [], now);
        for (const [clientId, detail] of detailMap) {
          latestDetailByClient.set(clientId, detail.completedAt);
        }
      }

      const now = Date.now();
      const rows = (clients ?? []).map((client) => {
        const lastDetail = latestDetailByClient.get(client.id);
        const createdAt = new Date(client.created_at);
        const anchorDate = lastDetail ?? createdAt;
        const daysSinceAnchor = Math.floor((now - anchorDate.getTime()) / (24 * 60 * 60 * 1000));
        const daysSinceLastDetail = lastDetail
          ? countDaysSinceDetail(lastDetail, new Date())
          : null;

        const maintenanceEligible = isMaintenanceProgramEligible({
          city: client.city,
          daysSinceLastDetail: daysSinceLastDetail,
          hasCompletedDetail: Boolean(lastDetail),
        });

        const smsTrack = client.opted_out
          ? null
          : lastDetail
            ? getSmsTrackForClient({
                city: client.city,
                daysSinceLastDetail,
                hasCompletedDetail: true,
              })
            : null;

        const preferredLanguage = normalizeLanguage(client.preferred_language);
        const optedOutLabel = client.opted_out
          ? getOptOutStatusLabel(client.opted_out_source)
          : null;

        return {
          clientId: client.id,
          name: client.name,
          phone: client.phone,
          city: client.city,
          preferredLanguage,
          preferredLanguageLabel: LANGUAGE_LABELS[preferredLanguage],
          optedOut: client.opted_out,
          optedOutAt: client.opted_out_at ?? null,
          optedOutSource: client.opted_out_source ?? null,
          optedOutLabel,
          cityEligible: isEligibleCity(client.city),
          maintenanceCityEligible: isEligibleCity(client.city),
          maintenanceEligible,
          smsTrack,
          smsTrackLabel: buildSmsTrackLabel({
            optedOut: client.opted_out,
            optedOutLabel,
            smsTrack,
            daysSinceLastDetail,
          }),
          daysSinceLastDetail,
          daysSinceAnchor,
          smsEnrolled: !client.opted_out && Boolean(lastDetail),
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

      if (
        body.city === undefined &&
        body.preferredLanguage === undefined &&
        body.excludedFromSms === undefined
      ) {
        return jsonResponse({ error: "city, preferredLanguage, or excludedFromSms required" }, 400);
      }

      const updatePayload = {};

      if (body.city !== undefined) {
        updatePayload.city = typeof body.city === "string" ? body.city.trim() : "";
        if (!updatePayload.city) updatePayload.city = null;
      }

      if (body.preferredLanguage !== undefined) {
        updatePayload.preferred_language = normalizeLanguage(body.preferredLanguage);
      }

      if (body.excludedFromSms !== undefined) {
        const excluded = Boolean(body.excludedFromSms);
        updatePayload.opted_out = excluded;
        if (excluded) {
          updatePayload.opted_out_at = new Date().toISOString();
          updatePayload.opted_out_source = OPT_OUT_SOURCES.MANUAL;
        } else {
          updatePayload.opted_out_at = null;
          updatePayload.opted_out_source = null;
        }
      }

      const { error: updateError } = await supabase
        .from("clients")
        .update(updatePayload)
        .eq("id", body.clientId);

      if (updateError) throw updateError;

      return jsonResponse({ ok: true, clientId: body.clientId, ...updatePayload });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update city";
      return jsonResponse({ error: message }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
