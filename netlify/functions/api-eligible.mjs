import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import { getEligibleClients } from "../../lib/eligibility.js";

export const handler = withAuth(async () => {
  try {
    const supabase = getSupabase();
    const eligible = await getEligibleClients(supabase);

    return jsonResponse({
      eligible: eligible.map((client) => ({
        clientId: client.clientId,
        name: client.name,
        phone: client.phone,
        daysSince: client.daysSince,
        sequenceNumber: client.sequenceNumber,
        lastDetailDate: client.lastDetailDateFormatted,
        lastServiceType: client.lastServiceType,
        messageBody: client.messageBody,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load eligible clients";
    return jsonResponse({ error: message }, 500);
  }
});
