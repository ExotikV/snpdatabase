import { syncSquareAppointments } from "../../lib/appointment-sync.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = async () => {
  console.log("[scheduled-appointment-sync] Starting appointment sync...");
  try {
    const supabase = getSupabase();
    const stats = await syncSquareAppointments(supabase, { mode: "hourly" });
    console.log("[scheduled-appointment-sync] Complete:", JSON.stringify(stats));
    return { statusCode: 200, body: JSON.stringify({ ok: true, stats }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-appointment-sync] Fatal:", message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: message }) };
  }
};

export const config = {
  schedule: "*/15 * * * *",
};
