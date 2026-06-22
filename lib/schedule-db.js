import { TRACKS } from "./tracks.js";

let trackColumnExists = null;

export const DEFAULT_GENERAL_STEPS = [
  {
    track: TRACKS.GENERAL,
    sequence_number: 1,
    days_since_last_detail: 30,
    active: true,
    message_body:
      "Hi {first_name}, it's been a while since your last visit with SNP Detailing. Book your next detail here: {booking_url}",
  },
  {
    track: TRACKS.GENERAL,
    sequence_number: 2,
    days_since_last_detail: 60,
    active: true,
    message_body:
      "Hi {first_name}, we'd love to see you again — book your SNP Detailing appointment: {booking_url}",
  },
  {
    track: TRACKS.GENERAL,
    sequence_number: 3,
    days_since_last_detail: 90,
    active: true,
    message_body:
      "Hi {first_name}, last note from SNP Detailing — reserve your spot when you're ready: {booking_url}",
  },
];

function isMissingTrackColumn(error) {
  const message = error?.message ?? "";
  const code = error?.code ?? "";
  return code === "42703" || message.includes("reminder_schedule.track");
}

export async function hasTrackColumn(supabase) {
  if (trackColumnExists !== null) {
    return trackColumnExists;
  }

  const { error } = await supabase.from("reminder_schedule").select("track").limit(1);
  trackColumnExists = !error;
  return trackColumnExists;
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

    rows.push(...data.map((row) => ({ ...row, track: TRACKS.MAINTENANCE })));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchTrackedSteps(supabase, track) {
  const rows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from("reminder_schedule")
      .select(
        "id, track, sequence_number, days_since_last_detail, active, message_body, created_at",
      )
      .order("sequence_number", { ascending: true })
      .range(from, from + pageSize - 1);

    if (track) {
      query = query.eq("track", track);
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

export async function loadScheduleSteps(supabase, track) {
  const hasTrack = await hasTrackColumn(supabase);

  if (!hasTrack) {
    const maintenance = await fetchLegacySteps(supabase);
    if (track === TRACKS.GENERAL) {
      return {
        steps: DEFAULT_GENERAL_STEPS.map((step, index) => ({
          ...step,
          id: `pending-general-${index + 1}`,
        })),
        migrationRequired: true,
      };
    }

    return { steps: maintenance, migrationRequired: true };
  }

  const steps = await fetchTrackedSteps(supabase, track);
  return { steps, migrationRequired: false };
}

export async function loadActiveSchedule(supabase, track) {
  const { steps } = await loadScheduleSteps(supabase, track);
  return steps.filter((step) => step.active).sort((a, b) => a.sequence_number - b.sequence_number);
}

export function formatScheduleError(error) {
  if (isMissingTrackColumn(error)) {
    return "Database migration required: run schema/reminder_schedule_track.sql in Supabase SQL Editor.";
  }
  return error instanceof Error ? error.message : String(error);
}
