import { withAuth, jsonResponse } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";

const TRIGGER_LABELS = {
  maintenance_reminder: "Maintenance",
  general_reminder: "General",
  general_after_maintenance_reminder: "General (after maintenance)",
};

export const handler = withAuth(async () => {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("sms_log")
      .select(
        "id, client_id, trigger_type, status, sent_at, converted, sequence_number, error_message, created_at, clients(name, phone)",
      )
      .in("trigger_type", [
        "maintenance_reminder",
        "general_reminder",
        "general_after_maintenance_reminder",
      ])
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = (data ?? []).map((row) => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.clients?.name ?? null,
      phone: row.clients?.phone ?? null,
      triggerType: row.trigger_type,
      trackLabel: TRIGGER_LABELS[row.trigger_type] ?? row.trigger_type,
      status: row.status,
      sentAt: row.sent_at,
      converted: row.converted,
      sequenceNumber: row.sequence_number,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    }));

    return jsonResponse({ smsLog: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load SMS log";
    return jsonResponse({ error: message }, 500);
  }
});
