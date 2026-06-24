import { formatDetailDate } from "./message-template.js";
import { syncSquareAppointments } from "./appointment-sync.js";
import {
  getLatestCompletedDetailByClient,
  isPastCompletedAt,
} from "./completed-details.js";
import {
  getSmsTrackForClient,
  isEligibleCity,
  isMaintenanceProgramEligible,
} from "./client-tracks.js";
import { daysSinceLastDetail, hoursSinceInstant } from "./dates.js";
import { LANGUAGES, normalizeLanguage } from "./languages.js";
import { resolveNextScheduleStep } from "./schedule-rules.js";
import { loadActiveSchedule, loadScheduleSteps } from "./schedule-db.js";
import {
  getCycleReminders,
  getCycleSmsAttempts,
  hasExceededSmsFailureLimit,
} from "./sms-retry.js";
import { loadSmsAppointmentGuards } from "./sms-appointment-guards.js";
import { getTriggerTypeForTrack, MANUAL_SMS_TRIGGER_TYPE, TRACKS } from "./tracks.js";

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 200;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function daysBetween(earlier, later) {
  return daysSinceLastDetail(earlier, later) ?? 0;
}

async function fetchAllRows(supabase, table, select, applyFilters) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (applyFilters) {
      query = applyFilters(query);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchRowsForClientIds(supabase, table, select, clientIds, applyFilters) {
  const rows = [];
  for (const ids of chunkArray(clientIds, IN_CHUNK_SIZE)) {
    const chunkRows = await fetchAllRows(supabase, table, select, (query) => {
      let filtered = query.in("client_id", ids);
      if (applyFilters) {
        filtered = applyFilters(filtered);
      }
      return filtered;
    });
    rows.push(...chunkRows);
  }
  return rows;
}

function getLatestDetailByClient(details, now = new Date()) {
  return getLatestCompletedDetailByClient(details, now);
}

function groupRemindersByClient(reminders) {
  const remindersByClient = new Map();

  for (const row of reminders) {
    if (row.sequence_number == null || !row.trigger_type) continue;
    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    const key = `${row.client_id}:${row.trigger_type}`;
    if (!remindersByClient.has(key)) {
      remindersByClient.set(key, []);
    }
    remindersByClient.get(key).push({
      sequenceNumber: row.sequence_number,
      createdAt,
      status: row.status,
    });
  }

  return remindersByClient;
}

function getHighestSequenceInCycle(cycleReminders) {
  let highest = 0;
  for (const row of cycleReminders) {
    if (row.sequenceNumber > highest) highest = row.sequenceNumber;
  }
  return highest;
}

function hasSequenceInCycle(cycleReminders, sequenceNumber) {
  return cycleReminders.some((row) => row.sequenceNumber === sequenceNumber);
}

function groupManualSentByClient(rows) {
  const manualByClient = new Map();

  for (const row of rows) {
    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    if (!manualByClient.has(row.client_id)) {
      manualByClient.set(row.client_id, []);
    }
    manualByClient.get(row.client_id).push({ createdAt });
  }

  return manualByClient;
}

function hadManualSmsInCycle(manualRows, cycleAnchor) {
  return manualRows.some((row) => row.createdAt > cycleAnchor);
}

export async function getReminderSchedule(
  supabase,
  track = TRACKS.MAINTENANCE,
  language = LANGUAGES.EN,
) {
  return loadActiveSchedule(supabase, track, language);
}

export async function getAllReminderScheduleSteps(supabase, track, language = LANGUAGES.EN) {
  const { steps } = await loadScheduleSteps(supabase, track, language);
  return steps;
}

async function fetchAllSmsClients(supabase, clientId) {
  let query = supabase
    .from("clients")
    .select("id, name, phone, city, opted_out, preferred_language")
    .eq("opted_out", false)
    .order("name", { ascending: true });

  if (clientId) {
    query = query.eq("id", clientId);
  }

  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function buildClientContext(client, latestDetail) {
  if (!latestDetail) {
    return null;
  }

  const now = new Date();
  if (!isPastCompletedAt(latestDetail.completedAt, now)) {
    return null;
  }

  const preferredLanguage = normalizeLanguage(client.preferred_language);
  const lastDetailDate = latestDetail.completedAt;
  const daysSince = daysBetween(lastDetailDate, now);
  const hoursSince = hoursSinceInstant(lastDetailDate, now) ?? 0;
  const track = getSmsTrackForClient({
    city: client.city,
    daysSinceLastDetail: daysSince,
    hasCompletedDetail: true,
  });

  if (!track) {
    return null;
  }

  return {
    clientId: client.id,
    name: client.name ?? "(no name)",
    phone: client.phone ?? null,
    city: client.city ?? null,
    preferredLanguage,
    track,
    maintenanceEligible: isMaintenanceProgramEligible({
      city: client.city,
      daysSinceLastDetail: daysSince,
      hasCompletedDetail: true,
    }),
    lastDetailDate,
    lastDetailDateFormatted: formatDetailDate(lastDetailDate),
    lastServiceType: latestDetail.serviceType,
    daysSince,
    hoursSince,
    cycleAnchor: lastDetailDate,
  };
}

export async function getEligibleClients(
  supabase,
  { clientId, track: trackFilter, syncFirst = true } = {},
) {
  if (syncFirst) {
    await syncSquareAppointments(supabase, { mode: "hourly" });
  }

  const clients = await fetchAllSmsClients(supabase, clientId);
  if (clients.length === 0) return [];

  const guards = await loadSmsAppointmentGuards(supabase);

  const clientIds = clients.map((client) => client.id);
  const details = await fetchRowsForClientIds(
    supabase,
    "details_completed",
    "client_id, completed_at, service_type",
    clientIds,
  );
  const latestDetailByClient = getLatestDetailByClient(details, new Date());

  const reminders = await fetchRowsForClientIds(
    supabase,
    "sms_log",
    "client_id, trigger_type, sequence_number, created_at, status",
    clientIds,
    (query) => query.not("sequence_number", "is", null),
  );
  const remindersByClient = groupRemindersByClient(reminders);

  const manualSmsRows = await fetchRowsForClientIds(
    supabase,
    "sms_log",
    "client_id, created_at, status",
    clientIds,
    (query) => query.eq("trigger_type", MANUAL_SMS_TRIGGER_TYPE).eq("status", "sent"),
  );
  const manualSmsByClient = groupManualSentByClient(manualSmsRows);

  const schedules = Object.fromEntries(
    await Promise.all(
      [
        [TRACKS.MAINTENANCE, LANGUAGES.EN],
        [TRACKS.MAINTENANCE, LANGUAGES.FR],
        [TRACKS.GENERAL, LANGUAGES.EN],
        [TRACKS.GENERAL, LANGUAGES.FR],
        [TRACKS.GENERAL_AFTER_MAINTENANCE, LANGUAGES.EN],
        [TRACKS.GENERAL_AFTER_MAINTENANCE, LANGUAGES.FR],
      ].map(async ([track, language]) => {
        const steps = await getReminderSchedule(supabase, track, language);
        return [`${track}:${language}`, steps];
      }),
    ),
  );

  const eligible = [];

  for (const client of clients) {
    if (!client.phone?.trim()) continue;

    if (guards.blockedClientIds.has(client.id)) continue;

    const context = buildClientContext(client, latestDetailByClient.get(client.id));
    if (!context) continue;

    const track = context.track;

    if (trackFilter && track !== trackFilter) continue;

    if (track === TRACKS.MAINTENANCE && !isEligibleCity(client.city)) continue;

    const scheduleKey = `${track}:${context.preferredLanguage}`;
    const schedule =
      schedules[scheduleKey] ??
      schedules[`${track}:${LANGUAGES.EN}`] ??
      [];
    if (!schedule.length) continue;

    const scheduleBySequence = new Map(schedule.map((step) => [step.sequence_number, step]));
    const triggerType = getTriggerTypeForTrack(track);
    const reminderKey = `${client.id}:${triggerType}`;
    const clientReminders = remindersByClient.get(reminderKey) ?? [];
    const cycleAttempts = getCycleSmsAttempts(clientReminders, context.cycleAnchor);
    const cycleReminders = getCycleReminders(clientReminders, context.cycleAnchor);
    let highestReceived = getHighestSequenceInCycle(cycleReminders);

    const manualInCycle = hadManualSmsInCycle(
      manualSmsByClient.get(client.id) ?? [],
      context.cycleAnchor,
    );
    if (manualInCycle) {
      highestReceived = Math.max(highestReceived, 1);
    }

    const next = resolveNextScheduleStep({
      scheduleBySequence,
      highestReceived,
      daysSince: context.daysSince,
      hoursSince: context.hoursSince,
      track,
    });

    if (next.status === "complete" || next.status === "upcoming") continue;

    const nextSequenceNumber = next.sequenceNumber;
    const nextStep = next.step;

    if (hasSequenceInCycle(cycleReminders, nextSequenceNumber)) continue;
    if (hasExceededSmsFailureLimit(cycleAttempts, nextSequenceNumber)) continue;

    eligible.push({
      clientId: context.clientId,
      name: context.name,
      phone: context.phone,
      city: context.city,
      track,
      preferredLanguage: context.preferredLanguage,
      maintenanceEligible: context.maintenanceEligible,
      lastDetailDate: context.lastDetailDate,
      lastDetailDateFormatted: context.lastDetailDateFormatted,
      lastServiceType: context.lastServiceType,
      daysSince: context.daysSince,
      hoursSince: context.hoursSince,
      sequenceNumber: nextSequenceNumber,
      requiredAmount: next.requiredAmount,
      delayUnit: next.delayUnit,
      messageBody: nextStep.message_body ?? null,
      scheduleStepId: nextStep.id,
    });
  }

  eligible.sort((a, b) => {
    if (a.track !== b.track) return a.track.localeCompare(b.track);
    if (a.sequenceNumber !== b.sequenceNumber) {
      return a.sequenceNumber - b.sequenceNumber;
    }
    return b.daysSince - a.daysSince;
  });

  return eligible;
}

export { formatDetailDate, daysBetween, isMaintenanceProgramEligible, getSmsTrackForClient };
export { getGeneralFirstReminderMinDays } from "./client-tracks.js";
