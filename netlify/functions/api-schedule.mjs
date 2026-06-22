import { withAuth, jsonResponse, parseJsonBody } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import {
  getAllReminderScheduleSteps,
  getReminderSchedule,
} from "../../lib/eligibility.js";

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();
  const method = event.httpMethod;

  if (method === "GET") {
    try {
      const steps = await getAllReminderScheduleSteps(supabase);
      return jsonResponse({ steps });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load schedule";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (method === "PUT") {
    try {
      const body = parseJsonBody(event);
      if (!body?.steps || !Array.isArray(body.steps)) {
        return jsonResponse({ error: "steps array required" }, 400);
      }

      for (const step of body.steps) {
        if (!step.id) {
          return jsonResponse({ error: "Each step must have an id" }, 400);
        }

        const { error } = await supabase
          .from("reminder_schedule")
          .update({
            sequence_number: step.sequence_number,
            days_since_last_detail: step.days_since_last_detail,
            active: step.active,
            message_body: step.message_body,
          })
          .eq("id", step.id);

        if (error) throw error;
      }

      const updated = await getReminderSchedule(supabase);
      return jsonResponse({ ok: true, activeSteps: updated.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save schedule";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (method === "POST") {
    try {
      const body = parseJsonBody(event) ?? {};
      const existing = await getAllReminderScheduleSteps(supabase);
      const nextSequence =
        existing.reduce((max, step) => Math.max(max, step.sequence_number), 0) + 1;

      const { data, error } = await supabase
        .from("reminder_schedule")
        .insert({
          sequence_number: body.sequence_number ?? nextSequence,
          days_since_last_detail: body.days_since_last_detail ?? 30,
          active: body.active ?? true,
          message_body:
            body.message_body ??
            "Hi {first_name}, it has been {days_since} days since your last {service} on {last_detail_date}. Book here: {booking_url}",
        })
        .select("*")
        .single();

      if (error) throw error;
      return jsonResponse({ step: data }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create step";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (method === "DELETE") {
    try {
      const body = parseJsonBody(event);
      if (!body?.id) {
        return jsonResponse({ error: "id required" }, 400);
      }

      const { error } = await supabase.from("reminder_schedule").delete().eq("id", body.id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete step";
      return jsonResponse({ error: message }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
