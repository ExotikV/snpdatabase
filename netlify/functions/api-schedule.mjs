import { withAuth, jsonResponse, parseJsonBody } from "../../lib/auth.js";
import { getSupabase } from "../../lib/supabase.js";
import {
  getAllReminderScheduleSteps,
  getReminderSchedule,
} from "../../lib/eligibility.js";
import { LANGUAGES, normalizeLanguage, parseLanguage } from "../../lib/languages.js";
import {
  DEFAULT_GENERAL_STEPS_EN,
  DEFAULT_GENERAL_STEPS_FR,
  DEFAULT_GENERAL_AFTER_MAINTENANCE_STEPS_EN,
  DEFAULT_GENERAL_AFTER_MAINTENANCE_STEPS_FR,
  formatScheduleError,
  hasDelayUnitColumn,
  hasLanguageColumn,
  hasTrackColumn,
} from "../../lib/schedule-db.js";
import { TRACKS, MAINTENANCE_REMINDER_START_DAYS, GENERAL_REMINDER_START_DAYS, GENERAL_AFTER_MAINTENANCE_MISS_DAYS } from "../../lib/tracks.js";
import { normalizeDelayUnit, validateScheduleStepDays } from "../../lib/schedule-rules.js";

function parseTrack(value) {
  if (
    value === TRACKS.GENERAL ||
    value === TRACKS.MAINTENANCE ||
    value === TRACKS.GENERAL_AFTER_MAINTENANCE
  ) {
    return value;
  }
  return null;
}

function parseLanguageQuery(value) {
  return parseLanguage(value) ?? LANGUAGES.EN;
}

function defaultMessage(track, language) {
  if (track === TRACKS.GENERAL_AFTER_MAINTENANCE) {
    return language === LANGUAGES.FR
      ? DEFAULT_GENERAL_AFTER_MAINTENANCE_STEPS_FR[0].message_body
      : DEFAULT_GENERAL_AFTER_MAINTENANCE_STEPS_EN[0].message_body;
  }

  if (track === TRACKS.GENERAL) {
    return language === LANGUAGES.FR
      ? DEFAULT_GENERAL_STEPS_FR[0].message_body
      : DEFAULT_GENERAL_STEPS_EN[0].message_body;
  }

  return language === LANGUAGES.FR
    ? "Bonjour {prenom}, ca fait {jours_depuis} jours depuis votre dernier {detail} du {date_dernier_detail}. Reservez votre entretien ici : {lien_reservation}"
    : "Hi {first_name}, it has been {days_since} days since your last {service} on {last_detail_date}. Book your maintenance detail here: {booking_url}";
}

function buildStepUpdatePayload(step, { includeDelayUnit = true } = {}) {
  const updatePayload = {
    sequence_number: step.sequence_number,
    days_since_last_detail: step.days_since_last_detail,
    active: step.active,
    message_body: step.message_body,
  };

  if (includeDelayUnit) {
    updatePayload.delay_unit = normalizeDelayUnit(step.delay_unit);
  }

  if (step.track) {
    updatePayload.track = step.track;
  }
  if (step.language) {
    updatePayload.language = normalizeLanguage(step.language);
  }

  return updatePayload;
}

async function saveScheduleSteps(supabase, steps, { includeDelayUnit = true } = {}) {
  for (const step of steps) {
    if (!step.id || String(step.id).startsWith("pending-")) {
      throw new Error("Each step must have a saved database id");
    }

    const daysError = validateScheduleStepDays(step);
    if (daysError) {
      throw new Error(daysError);
    }
  }

  const sequenceNumbers = steps.map((step) => Number(step.sequence_number));
  if (sequenceNumbers.some((value) => !Number.isFinite(value) || value < 1)) {
    throw new Error("Each step needs a valid step number.");
  }
  if (new Set(sequenceNumbers).size !== sequenceNumbers.length) {
    throw new Error("Each step must have a unique step number for this track and language.");
  }

  // Avoid unique-index conflicts on (track, language, sequence_number) during reordering.
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const { error } = await supabase
      .from("reminder_schedule")
      .update({ sequence_number: -(index + 1) })
      .eq("id", step.id);

    if (error) throw error;
  }

  for (const step of steps) {
    const { error } = await supabase
      .from("reminder_schedule")
      .update(buildStepUpdatePayload(step, { includeDelayUnit }))
      .eq("id", step.id);

    if (error) throw error;
  }
}

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();
  const method = event.httpMethod;
  const queryTrack = parseTrack(event.queryStringParameters?.track);
  const queryLanguage = parseLanguageQuery(event.queryStringParameters?.language);

  if (method === "GET") {
    try {
      const steps = await getAllReminderScheduleSteps(
        supabase,
        queryTrack ?? undefined,
        queryLanguage,
      );
      const migrationRequired = !(await hasTrackColumn(supabase));
      const languageMigrationRequired = !(await hasLanguageColumn(supabase));
      const delayUnitMigrationRequired = !(await hasDelayUnitColumn(supabase));
      return jsonResponse({
        steps,
        track: queryTrack,
        language: queryLanguage,
        migrationRequired,
        languageMigrationRequired,
        delayUnitMigrationRequired,
      });
    } catch (error) {
      return jsonResponse({ error: formatScheduleError(error) }, 500);
    }
  }

  if (method === "PUT") {
    try {
      if (!(await hasTrackColumn(supabase))) {
        return jsonResponse(
          {
            error:
              "Run schema/reminder_schedule_track.sql in Supabase SQL Editor before saving schedule changes.",
            migrationRequired: true,
          },
          400,
        );
      }

      if (!(await hasLanguageColumn(supabase))) {
        return jsonResponse(
          {
            error:
              "Run schema/reminder_schedule_language.sql in Supabase SQL Editor before saving schedule changes.",
            languageMigrationRequired: true,
          },
          400,
        );
      }

      if (!(await hasDelayUnitColumn(supabase))) {
        return jsonResponse(
          {
            error:
              "Run schema/reminder_schedule_delay_unit.sql in Supabase SQL Editor before saving hour-based steps.",
            delayUnitMigrationRequired: true,
          },
          400,
        );
      }

      const body = parseJsonBody(event);
      if (!body?.steps || !Array.isArray(body.steps)) {
        return jsonResponse({ error: "steps array required" }, 400);
      }

      await saveScheduleSteps(supabase, body.steps);

      const track = parseTrack(body.steps[0]?.track) ?? TRACKS.MAINTENANCE;
      const language = normalizeLanguage(body.steps[0]?.language ?? queryLanguage);
      const updated = await getReminderSchedule(supabase, track, language);
      return jsonResponse({ ok: true, activeSteps: updated.length });
    } catch (error) {
      const message = formatScheduleError(error);
      const status = message.includes("must have") || message.includes("needs") ? 400 : 500;
      return jsonResponse({ error: message }, status);
    }
  }

  if (method === "POST") {
    try {
      if (!(await hasTrackColumn(supabase))) {
        return jsonResponse(
          {
            error:
              "Run schema/reminder_schedule_track.sql in Supabase SQL Editor before adding steps.",
            migrationRequired: true,
          },
          400,
        );
      }

      if (!(await hasLanguageColumn(supabase))) {
        return jsonResponse(
          {
            error:
              "Run schema/reminder_schedule_language.sql in Supabase SQL Editor before adding steps.",
            languageMigrationRequired: true,
          },
          400,
        );
      }

      if (!(await hasDelayUnitColumn(supabase))) {
        return jsonResponse(
          {
            error:
              "Run schema/reminder_schedule_delay_unit.sql in Supabase SQL Editor before adding hour-based steps.",
            delayUnitMigrationRequired: true,
          },
          400,
        );
      }

      const body = parseJsonBody(event) ?? {};
      const track = parseTrack(body.track) ?? TRACKS.MAINTENANCE;
      const language = normalizeLanguage(body.language ?? queryLanguage);
      const existing = await getAllReminderScheduleSteps(supabase, track, language);
      const nextSequence =
        existing.reduce((max, step) => Math.max(max, step.sequence_number), 0) + 1;

      const { data, error } = await supabase
        .from("reminder_schedule")
        .insert({
          track,
          language,
          sequence_number: body.sequence_number ?? nextSequence,
          days_since_last_detail:
            body.days_since_last_detail ??
            (track === TRACKS.GENERAL_AFTER_MAINTENANCE
              ? GENERAL_AFTER_MAINTENANCE_MISS_DAYS
              : track === TRACKS.GENERAL
                ? GENERAL_REMINDER_START_DAYS
                : MAINTENANCE_REMINDER_START_DAYS),
          delay_unit: normalizeDelayUnit(body.delay_unit),
          active: body.active ?? true,
          message_body: body.message_body ?? defaultMessage(track, language),
        })
        .select("*")
        .single();

      if (error) throw error;
      return jsonResponse({ step: data }, 201);
    } catch (error) {
      return jsonResponse({ error: formatScheduleError(error) }, 500);
    }
  }

  if (method === "DELETE") {
    try {
      const body = parseJsonBody(event);
      if (!body?.id) {
        return jsonResponse({ error: "id required" }, 400);
      }

      if (String(body.id).startsWith("pending-")) {
        return jsonResponse({ error: "Cannot delete unsaved default steps" }, 400);
      }

      const { error } = await supabase.from("reminder_schedule").delete().eq("id", body.id);
      if (error) throw error;
      return jsonResponse({ ok: true });
    } catch (error) {
      return jsonResponse({ error: formatScheduleError(error) }, 500);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
