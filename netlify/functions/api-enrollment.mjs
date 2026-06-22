import { jsonResponse, parseJsonBody, withAuth } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import { getEligibleCityLabels, isEligibleCity } from "../../lib/service-area.js";

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();

  if (event.httpMethod === "GET") {
    try {
      const { data: clients, error: clientsError } = await supabase
        .from("clients")
        .select(
          "id, name, phone, city, maintenance_enrollment(id, active, enrolled_at)",
        )
        .order("name", { ascending: true })
        .limit(500);

      if (clientsError) throw clientsError;

      const rows = (clients ?? []).map((client) => {
        const enrollment = (client.maintenance_enrollment ?? []).find((row) => row.active);
        const cityEligible = isEligibleCity(client.city);

        return {
          clientId: client.id,
          name: client.name,
          phone: client.phone,
          city: client.city,
          cityEligible,
          enrolled: Boolean(enrollment),
          enrolledAt: enrollment?.enrolled_at ?? null,
          enrollmentId: enrollment?.id ?? null,
        };
      });

      return jsonResponse({
        clients: rows,
        eligibleCities: getEligibleCityLabels(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load enrollments";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (event.httpMethod === "POST") {
    try {
      const body = parseJsonBody(event) ?? {};
      if (!body.clientId) {
        return jsonResponse({ error: "clientId required" }, 400);
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("id, name, city")
        .eq("id", body.clientId)
        .maybeSingle();

      if (clientError) throw clientError;
      if (!client) {
        return jsonResponse({ error: "Client not found" }, 404);
      }

      if (!isEligibleCity(client.city)) {
        return jsonResponse(
          {
            error: client.city
              ? `"${client.city}" is outside the maintenance service area`
              : "Client has no city on file — cannot enroll until city is set",
          },
          400,
        );
      }

      const { data: existing, error: existingError } = await supabase
        .from("maintenance_enrollment")
        .select("id, active")
        .eq("client_id", client.id)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.active) {
        return jsonResponse({ ok: true, alreadyEnrolled: true });
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from("maintenance_enrollment")
          .update({ active: true, enrolled_at: new Date().toISOString() })
          .eq("id", existing.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from("maintenance_enrollment").insert({
          client_id: client.id,
          active: true,
        });

        if (insertError) throw insertError;
      }

      return jsonResponse({ ok: true, clientId: client.id, name: client.name, city: client.city });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to enroll client";
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

      return jsonResponse({
        ok: true,
        clientId: body.clientId,
        city: city || null,
        cityEligible: isEligibleCity(city),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update city";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (event.httpMethod === "DELETE") {
    try {
      const body = parseJsonBody(event) ?? {};
      if (!body.clientId) {
        return jsonResponse({ error: "clientId required" }, 400);
      }

      const { error } = await supabase
        .from("maintenance_enrollment")
        .update({ active: false })
        .eq("client_id", body.clientId);

      if (error) throw error;
      return jsonResponse({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unenroll client";
      return jsonResponse({ error: message }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
