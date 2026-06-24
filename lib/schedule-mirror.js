import { getAllReminderScheduleSteps } from "./eligibility.js";
import { LANGUAGES, normalizeLanguage } from "./languages.js";
import { normalizeDelayUnit } from "./schedule-rules.js";

export function getMirrorLanguage(language) {
  return normalizeLanguage(language) === LANGUAGES.FR ? LANGUAGES.EN : LANGUAGES.FR;
}

function sharedStructureFields(step, { includeDelayUnit = true } = {}) {
  const fields = {
    sequence_number: step.sequence_number,
    days_since_last_detail: step.days_since_last_detail,
    active: step.active,
  };

  if (includeDelayUnit) {
    fields.delay_unit = normalizeDelayUnit(step.delay_unit);
  }

  return fields;
}

async function applyNegativeSequencePass(supabase, ids) {
  for (let index = 0; index < ids.length; index += 1) {
    const { error } = await supabase
      .from("reminder_schedule")
      .update({ sequence_number: -(index + 1) })
      .eq("id", ids[index]);

    if (error) throw error;
  }
}

/**
 * Keep the other language's steps aligned: same count, order, timing, and active flag.
 * Message text stays language-specific.
 */
export async function mirrorScheduleStructure(
  supabase,
  track,
  sourceLanguage,
  sourceSteps,
  { defaultMessage, includeDelayUnit = true } = {},
) {
  if (!sourceSteps?.length) return;

  const mirrorLanguage = getMirrorLanguage(sourceLanguage);
  const mirrorSteps = await getAllReminderScheduleSteps(supabase, track, mirrorLanguage);
  const mirrorBySeq = new Map(mirrorSteps.map((step) => [step.sequence_number, step]));
  const sourceSeqs = new Set(sourceSteps.map((step) => Number(step.sequence_number)));

  for (const mirror of mirrorSteps) {
    if (!sourceSeqs.has(mirror.sequence_number)) {
      const { error } = await supabase.from("reminder_schedule").delete().eq("id", mirror.id);
      if (error) throw error;
    }
  }

  const desired = sourceSteps.map((step) => {
    const sequenceNumber = Number(step.sequence_number);
    const existing = mirrorBySeq.get(sequenceNumber);

    return {
      id: existing?.id ?? null,
      sequence_number: sequenceNumber,
      days_since_last_detail: step.days_since_last_detail,
      delay_unit: normalizeDelayUnit(step.delay_unit),
      active: step.active,
      message_body:
        existing?.message_body ??
        defaultMessage?.(track, mirrorLanguage) ??
        step.message_body ??
        null,
    };
  });

  const idsToRenumber = desired.filter((row) => row.id).map((row) => row.id);
  if (idsToRenumber.length) {
    await applyNegativeSequencePass(supabase, idsToRenumber);
  }

  for (const row of desired) {
    const payload = {
      sequence_number: row.sequence_number,
      days_since_last_detail: row.days_since_last_detail,
      active: row.active,
    };

    if (includeDelayUnit) {
      payload.delay_unit = row.delay_unit;
    }

    if (row.id) {
      const { error } = await supabase
        .from("reminder_schedule")
        .update(payload)
        .eq("id", row.id);

      if (error) throw error;
      continue;
    }

    const { error } = await supabase.from("reminder_schedule").insert({
      track,
      language: mirrorLanguage,
      message_body: row.message_body,
      ...payload,
    });

    if (error) throw error;
  }
}

export async function createMirroredStep(
  supabase,
  primaryStep,
  { defaultMessage, includeDelayUnit = true } = {},
) {
  const mirrorLanguage = getMirrorLanguage(primaryStep.language);
  const mirrorSteps = await getAllReminderScheduleSteps(
    supabase,
    primaryStep.track,
    mirrorLanguage,
  );
  const existing = mirrorSteps.find(
    (step) => step.sequence_number === primaryStep.sequence_number,
  );
  const shared = sharedStructureFields(primaryStep, { includeDelayUnit });

  if (existing) {
    const { data, error } = await supabase
      .from("reminder_schedule")
      .update(shared)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("reminder_schedule")
    .insert({
      track: primaryStep.track,
      language: mirrorLanguage,
      message_body: defaultMessage?.(primaryStep.track, mirrorLanguage) ?? primaryStep.message_body,
      ...shared,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMirroredStep(supabase, step) {
  if (!step?.track || step.sequence_number == null) return;

  const mirrorLanguage = getMirrorLanguage(step.language);
  const { error } = await supabase
    .from("reminder_schedule")
    .delete()
    .eq("track", step.track)
    .eq("language", mirrorLanguage)
    .eq("sequence_number", step.sequence_number);

  if (error) throw error;
}
