import { formatDetailDate } from "./message-template.js";
import {
  getSmsTrackForClient,
  isMaintenanceProgramEligible,
} from "./client-tracks.js";
import { getTriggerTypeForTrack, TRACKS } from "./tracks.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
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
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
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

function getLatestDetailByClient(details) {
  const latestByClient = new Map();
  for (const row of details) {
    if (!row.completed_at) continue;
    const completedAt = new Date(row.completed_at);
    if (Number.isNaN(completedAt.getTime())) continue;

    const existing = latestByClient.get(row.client_id);
    if (!existing || completedAt > existing.completedAt) {
      latestByClient.set(row.client_id, {
        completedAt,
        serviceType: row.service_type ?? null,
      });
    }
  }
  return latestByClient;
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

function getCycleReminders(reminderRows, cycleAnchor) {
  return reminderRows.filter(
    (row) =>
      row.createdAt > cycleAnchor &&
      (row.status === "sent" || row.status === "pending"),
  );
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

export async function getReminderSchedule(supabase, track = TRACKS.MAINTENANCE) {
  const rows = await fetchAllRows(
    supabase,
    "reminder_schedule",
    "id, track, sequence_number, days_since_last_detail, active, message_body",
    (query) => query.eq("track", track).order("sequence_number", { ascending: true }),
  );

  return rows.filter((step) => step.active).sort((a, b) => a.sequence_number - b.sequence_number);
}

export async function getAllReminderScheduleSteps(supabase, track) {
  let query = supabase
    .from("reminder_schedule")
    .select("id, track, sequence_number, days_since_last_detail, active, message_body, created_at")
    .order("track", { ascending: true })
    .order("sequence_number", { ascending: true });

  if (track) {
    query = query.eq("track", track);
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

async function fetchAllSmsClients(supabase, clientId) {
  let query = supabase
    .from("clients")
    .select("id, name, phone, city, opted_out, created_at")
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
  const now = new Date();
  const hasCompletedDetail = Boolean(latestDetail);

  if (hasCompletedDetail) {
    const lastDetailDate = latestDetail.completedAt;
    const daysSince = daysBetween(lastDetailDate, now);
    const track = getSmsTrackForClient({
      city: client.city,
      daysSinceLastDetail: daysSince,
      hasCompletedDetail: true,
    });

    return {
      clientId: client.id,
      name: client.name ?? "(no name)",
      phone: client.phone ?? null,
      city: client.city ?? null,
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
      cycleAnchor: lastDetailDate,
    };
  }

  const createdAt = new Date(client.created_at);
  const daysSince = daysBetween(createdAt, now);

  return {
    clientId: client.id,
    name: client.name ?? "(no name)",
    phone: client.phone ?? null,
    city: client.city ?? null,
    track: TRACKS.GENERAL,
    maintenanceEligible: false,
    lastDetailDate: createdAt,
    lastDetailDateFormatted: formatDetailDate(createdAt),
    lastServiceType: null,
    daysSince,
    cycleAnchor: createdAt,
  };
}

export async function getEligibleClients(supabase, { clientId, track: trackFilter } = {}) {
  const clients = await fetchAllSmsClients(supabase, clientId);
  if (clients.length === 0) return [];

  const clientIds = clients.map((client) => client.id);
  const details = await fetchRowsForClientIds(
    supabase,
    "details_completed",
    "client_id, completed_at, service_type",
    clientIds,
  );
  const latestDetailByClient = getLatestDetailByClient(details);

  const reminders = await fetchRowsForClientIds(
    supabase,
    "sms_log",
    "client_id, trigger_type, sequence_number, created_at, status",
    clientIds,
    (query) => query.not("sequence_number", "is", null),
  );
  const remindersByClient = groupRemindersByClient(reminders);

  const schedules = {
    [TRACKS.MAINTENANCE]: await getReminderSchedule(supabase, TRACKS.MAINTENANCE),
    [TRACKS.GENERAL]: await getReminderSchedule(supabase, TRACKS.GENERAL),
  };

  const eligible = [];

  for (const client of clients) {
    const context = buildClientContext(client, latestDetailByClient.get(client.id));
    const track = context.track;

    if (trackFilter && track !== trackFilter) continue;

    const schedule = schedules[track];
    if (!schedule.length) continue;

    const scheduleBySequence = new Map(schedule.map((step) => [step.sequence_number, step]));
    const triggerType = getTriggerTypeForTrack(track);
    const reminderKey = `${client.id}:${triggerType}`;
    const clientReminders = remindersByClient.get(reminderKey) ?? [];
    const cycleReminders = getCycleReminders(clientReminders, context.cycleAnchor);
    const highestReceived = getHighestSequenceInCycle(cycleReminders);
    const nextSequenceNumber = highestReceived + 1;
    const nextStep = scheduleBySequence.get(nextSequenceNumber);

    if (!nextStep) continue;
    if (context.daysSince < nextStep.days_since_last_detail) continue;
    if (hasSequenceInCycle(cycleReminders, nextSequenceNumber)) continue;

    eligible.push({
      clientId: context.clientId,
      name: context.name,
      phone: context.phone,
      city: context.city,
      track,
      maintenanceEligible: context.maintenanceEligible,
      lastDetailDate: context.lastDetailDate,
      lastDetailDateFormatted: context.lastDetailDateFormatted,
      lastServiceType: context.lastServiceType,
      daysSince: context.daysSince,
      sequenceNumber: nextSequenceNumber,
      daysSinceLastDetail: nextStep.days_since_last_detail,
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
