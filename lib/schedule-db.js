import { LANGUAGES, normalizeLanguage } from "./languages.js";
import { TRACKS } from "./tracks.js";

let trackColumnExists = null;
let languageColumnExists = null;

export const DEFAULT_GENERAL_STEPS_EN = [
  {
    track: TRACKS.GENERAL,
    language: LANGUAGES.EN,
    sequence_number: 1,
    days_since_last_detail: 60,
    active: true,
    message_body:
      "Hi {first_name}, it's been a while since your last visit with SNP Detailing. Book your next detail here: {booking_url}",
  },
  {
    track: TRACKS.GENERAL,
    language: LANGUAGES.EN,
    sequence_number: 2,
    days_since_last_detail: 90,
    active: true,
    message_body:
      "Hi {first_name}, we'd love to see you again — book your SNP Detailing appointment: {booking_url}",
  },
  {
    track: TRACKS.GENERAL,
    language: LANGUAGES.EN,
    sequence_number: 3,
    days_since_last_detail: 120,
    active: true,
    message_body:
      "Hi {first_name}, last note from SNP Detailing — reserve your spot when you're ready: {booking_url}",
  },
];

export const DEFAULT_GENERAL_STEPS_FR = [
  {
    track: TRACKS.GENERAL,
    language: LANGUAGES.FR,
    sequence_number: 1,
    days_since_last_detail: 60,
    active: true,
    message_body:
      "Bonjour {prenom}, ca fait un bon moment depuis votre derniere visite chez SNP Detailing. Reservez votre prochain {detail} ici : {lien_reservation}",
  },
  {
    track: TRACKS.GENERAL,
    language: LANGUAGES.FR,
    sequence_number: 2,
    days_since_last_detail: 90,
    active: true,
    message_body:
      "Bonjour {prenom}, on aimerait vous revoir - reservez votre rendez-vous SNP Detailing : {lien_reservation}",
  },
  {
    track: TRACKS.GENERAL,
    language: LANGUAGES.FR,
    sequence_number: 3,
    days_since_last_detail: 120,
    active: true,
    message_body:
      "Bonjour {prenom}, dernier rappel de SNP Detailing - reservez quand vous etes pret : {lien_reservation}",
  },
];

/** @deprecated */
export const DEFAULT_GENERAL_STEPS = DEFAULT_GENERAL_STEPS_EN;

export const DEFAULT_GENERAL_AFTER_MAINTENANCE_STEPS_EN = [
  {
    track: TRACKS.GENERAL_AFTER_MAINTENANCE,
    language: LANGUAGES.EN,
    sequence_number: 1,
    days_since_last_detail: 90,
    active: true,
    message_body:
      "Hi {first_name}, we noticed you haven't booked your maintenance detail yet. Book your next visit with SNP Detailing here: {booking_url}",
  },
  {
    track: TRACKS.GENERAL_AFTER_MAINTENANCE,
    language: LANGUAGES.EN,
    sequence_number: 2,
    days_since_last_detail: 120,
    active: true,
    message_body:
      "Hi {first_name}, we'd still love to see you — book your SNP Detailing appointment: {booking_url}",
  },
  {
    track: TRACKS.GENERAL_AFTER_MAINTENANCE,
    language: LANGUAGES.EN,
    sequence_number: 3,
    days_since_last_detail: 150,
    active: true,
    message_body:
      "Hi {first_name}, last note from SNP Detailing — reserve your spot when you're ready: {booking_url}",
  },
];

export const DEFAULT_GENERAL_AFTER_MAINTENANCE_STEPS_FR = [
  {
    track: TRACKS.GENERAL_AFTER_MAINTENANCE,
    language: LANGUAGES.FR,
    sequence_number: 1,
    days_since_last_detail: 90,
    active: true,
    message_body:
      "Bonjour {prenom}, nous avons remarque que vous n'avez pas encore reserve votre entretien. Reservez votre prochain {detail} ici : {lien_reservation}",
  },
  {
    track: TRACKS.GENERAL_AFTER_MAINTENANCE,
    language: LANGUAGES.FR,
    sequence_number: 2,
    days_since_last_detail: 120,
    active: true,
    message_body:
      "Bonjour {prenom}, on aimerait toujours vous revoir - reservez votre rendez-vous SNP Detailing : {lien_reservation}",
  },
  {
    track: TRACKS.GENERAL_AFTER_MAINTENANCE,
    language: LANGUAGES.FR,
    sequence_number: 3,
    days_since_last_detail: 150,
    active: true,
    message_body:
      "Bonjour {prenom}, dernier rappel de SNP Detailing - reservez quand vous etes pret : {lien_reservation}",
  },
];

function getDefaultGeneralSteps(language) {
  return normalizeLanguage(language) === LANGUAGES.FR
    ? DEFAULT_GENERAL_STEPS_FR
    : DEFAULT_GENERAL_STEPS_EN;
}

function getDefaultGeneralAfterMaintenanceSteps(language) {
  return normalizeLanguage(language) === LANGUAGES.FR
    ? DEFAULT_GENERAL_AFTER_MAINTENANCE_STEPS_FR
    : DEFAULT_GENERAL_AFTER_MAINTENANCE_STEPS_EN;
}

function getDefaultStepsForTrack(track, language) {
  if (track === TRACKS.GENERAL) return getDefaultGeneralSteps(language);
  if (track === TRACKS.GENERAL_AFTER_MAINTENANCE) {
    return getDefaultGeneralAfterMaintenanceSteps(language);
  }
  return [];
}

function pendingStepsForTrack(track, language) {
  const prefix =
    track === TRACKS.GENERAL_AFTER_MAINTENANCE ? "general-after-maintenance" : "general";
  return getDefaultStepsForTrack(track, language).map((step, index) => ({
    ...step,
    id: `pending-${prefix}-${language}-${index + 1}`,
  }));
}

function isMissingTrackColumn(error) {
  const message = error?.message ?? "";
  const code = error?.code ?? "";
  return code === "42703" || message.includes("reminder_schedule.track");
}

function isMissingLanguageColumn(error) {
  const message = error?.message ?? "";
  const code = error?.code ?? "";
  return code === "42703" || message.includes("reminder_schedule.language");
}

export async function hasTrackColumn(supabase) {
  if (trackColumnExists !== null) {
    return trackColumnExists;
  }

  const { error } = await supabase.from("reminder_schedule").select("track").limit(1);
  trackColumnExists = !error;
  return trackColumnExists;
}

export async function hasLanguageColumn(supabase) {
  if (languageColumnExists !== null) {
    return languageColumnExists;
  }

  const { error } = await supabase.from("reminder_schedule").select("language").limit(1);
  languageColumnExists = !error;
  return languageColumnExists;
}

async function fetchLegacySteps(supabase) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("reminder_schedule")
      .select("id, sequence_number, days_since_last_detail, active, message_body, created_at")
      .order("sequence_number", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(
      ...data.map((row) => ({
        ...row,
        track: TRACKS.MAINTENANCE,
        language: LANGUAGES.EN,
      })),
    );
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchTrackedSteps(supabase, track, language) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  const normalizedLanguage = normalizeLanguage(language);

  while (true) {
    let query = supabase
      .from("reminder_schedule")
      .select(
        "id, track, language, sequence_number, days_since_last_detail, active, message_body, created_at",
      )
      .order("sequence_number", { ascending: true })
      .range(from, from + pageSize - 1);

    if (track) {
      query = query.eq("track", track);
    }
    if (language) {
      query = query.eq("language", normalizedLanguage);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export async function loadScheduleSteps(supabase, track, language = LANGUAGES.EN) {
  const hasTrack = await hasTrackColumn(supabase);
  const normalizedLanguage = normalizeLanguage(language);

  if (!hasTrack) {
    const maintenance = await fetchLegacySteps(supabase);
    if (track === TRACKS.GENERAL || track === TRACKS.GENERAL_AFTER_MAINTENANCE) {
      return {
        steps: pendingStepsForTrack(track, normalizedLanguage),
        migrationRequired: true,
        languageMigrationRequired: true,
      };
    }

    return { steps: maintenance, migrationRequired: true, languageMigrationRequired: true };
  }

  const hasLanguage = await hasLanguageColumn(supabase);
  if (!hasLanguage) {
    const steps = await fetchTrackedSteps(supabase, track);
    return {
      steps: steps.map((step) => ({ ...step, language: LANGUAGES.EN })),
      migrationRequired: false,
      languageMigrationRequired: true,
    };
  }

  const steps = await fetchTrackedSteps(supabase, track, normalizedLanguage);
  if (
    steps.length === 0 &&
    (track === TRACKS.GENERAL || track === TRACKS.GENERAL_AFTER_MAINTENANCE)
  ) {
    return {
      steps: pendingStepsForTrack(track, normalizedLanguage),
      migrationRequired: false,
      languageMigrationRequired: false,
    };
  }

  return { steps, migrationRequired: false, languageMigrationRequired: false };
}

export async function loadActiveSchedule(supabase, track, language = LANGUAGES.EN) {
  const { steps } = await loadScheduleSteps(supabase, track, language);
  return steps.filter((step) => step.active).sort((a, b) => a.sequence_number - b.sequence_number);
}

export function formatScheduleError(error) {
  if (isMissingTrackColumn(error)) {
    return "Database migration required: run schema/reminder_schedule_track.sql in Supabase SQL Editor.";
  }
  if (isMissingLanguageColumn(error)) {
    return "Database migration required: run schema/reminder_schedule_language.sql in Supabase SQL Editor.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (record.code === "23505") {
      return "Duplicate step number — each step needs a unique number for this track and language.";
    }
    if (typeof record.details === "string" && record.details.trim()) {
      return record.details;
    }
    if (typeof record.hint === "string" && record.hint.trim()) {
      return record.hint;
    }
  }

  return "Failed to save schedule changes";
}
