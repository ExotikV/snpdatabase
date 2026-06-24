import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getUpcomingAppointments } from "../../lib/upcoming-appointments.js";

export const handler = withAuth(async (event) => {
  try {
    const params = event.queryStringParameters ?? {};
    const syncMode = params.sync === "1" ? "hourly" : null;
    const data = await getUpcomingAppointments({ syncMode });
    return jsonResponse(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load upcoming appointments";
    return jsonResponse({ error: message }, 500);
  }
});
