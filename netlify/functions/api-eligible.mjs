import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import { getEligibleClients } from "../../lib/eligibility.js";

export const handler = withAuth(async (event) => {
  try {
    const supabase = getSupabase();
    const track = event.queryStringParameters?.track;
    const eligible = await getEligibleClients(supabase, { track: track || undefined });

    const maintenance = eligible.filter((client) => client.track === "maintenance");
    const general = eligible.filter((client) => client.track === "general");

    const mapClient = (client) => ({
      clientId: client.clientId,
      name: client.name,
      phone: client.phone,
      city: client.city,
      track: client.track,
      maintenanceEligible: client.maintenanceEligible,
      daysSince: client.daysSince,
      sequenceNumber: client.sequenceNumber,
      lastDetailDate: client.lastDetailDateFormatted,
      lastServiceType: client.lastServiceType,
      messageBody: client.messageBody,
    });

    return jsonResponse({
      eligible: eligible.map(mapClient),
      maintenance: maintenance.map(mapClient),
      general: general.map(mapClient),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load eligible clients";
    return jsonResponse({ error: message }, 500);
  }
});
