import { formatDetailDate } from "./message-template.js";

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
    if (error) {
      throw error;
    }

    if (!data?.length) {
      break;
    }

    rows.push(...data);
    if (data.length < PAGE_SIZE) {
      break;
    }
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
    if (row.sequence_number == null) continue;
    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    if (!remindersByClient.has(row.client_id)) {
      remindersByClient.set(row.client_id, []);
    }
    remindersByClient.get(row.client_id).push({
      sequenceNumber: row.sequence_number,
      createdAt,
      status: row.status,
    });
  }
  return remindersByClient;
}

function getCycleReminders(reminderRows, lastDetailDate) {
  return reminderRows.filter(
    (row) =>
      row.createdAt > lastDetailDate &&
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

export async function getReminderSchedule(supabase) {
  const rows = await fetchAllRows(
    supabase,
    "reminder_schedule",
    "id, sequence_number, days_since_last_detail, active, message_body",
    (query) => query.order("sequence_number", { ascending: true }),
  );

  return rows.filter((step) => step.active).sort((a, b) => a.sequence_number - b.sequence_number);
}

export async function getAllReminderScheduleSteps(supabase) {
  const rows = await fetchAllRows(
    supabase,
    "reminder_schedule",
    "id, sequence_number, days_since_last_detail, active, message_body, created_at",
    (query) => query.order("sequence_number", { ascending: true }),
  );
  return rows;
}

export async function getEligibleClients(supabase, { clientId } = {}) {
  const schedule = await getReminderSchedule(supabase);
  if (schedule.length === 0) {
    return [];
  }

  const scheduleBySequence = new Map(schedule.map((step) => [step.sequence_number, step]));

  let enrollments = await fetchAllRows(
    supabase,
    "maintenance_enrollment",
    "client_id, clients(id, name, phone, opted_out)",
    (query) => query.eq("active", true),
  );

  if (clientId) {
    enrollments = enrollments.filter((row) => row.client_id === clientId);
  }

  const clientMap = new Map();
  for (const enrollment of enrollments) {
    const client = enrollment.clients;
    if (!client || client.opted_out) continue;
    clientMap.set(client.id, {
      clientId: client.id,
      name: client.name,
      phone: client.phone,
    });
  }

  if (clientMap.size === 0) {
    return [];
  }

  const clientIds = [...clientMap.keys()];
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
    "client_id, sequence_number, created_at, status",
    clientIds,
    (query) =>
      query.eq("trigger_type", "maintenance_reminder").not("sequence_number", "is", null),
  );
  const remindersByClient = groupRemindersByClient(reminders);
  const now = new Date();
  const eligible = [];

  for (const [id, client] of clientMap) {
    const lastDetail = latestDetailByClient.get(id);
    if (!lastDetail) continue;

    const lastDetailDate = lastDetail.completedAt;
    const daysSince = daysBetween(lastDetailDate, now);
    const clientReminders = remindersByClient.get(id) ?? [];
    const cycleReminders = getCycleReminders(clientReminders, lastDetailDate);
    const highestReceived = getHighestSequenceInCycle(cycleReminders);
    const nextSequenceNumber = highestReceived + 1;
    const nextStep = scheduleBySequence.get(nextSequenceNumber);

    if (!nextStep) continue;
    if (daysSince < nextStep.days_since_last_detail) continue;
    if (hasSequenceInCycle(cycleReminders, nextSequenceNumber)) continue;

    eligible.push({
      clientId: client.clientId,
      name: client.name ?? "(no name)",
      phone: client.phone ?? null,
      lastDetailDate,
      lastDetailDateFormatted: formatDetailDate(lastDetailDate),
      lastServiceType: lastDetail.serviceType,
      daysSince,
      sequenceNumber: nextSequenceNumber,
      daysSinceLastDetail: nextStep.days_since_last_detail,
      messageBody: nextStep.message_body ?? null,
      scheduleStepId: nextStep.id,
    });
  }

  eligible.sort((a, b) => {
    if (a.sequenceNumber !== b.sequenceNumber) {
      return a.sequenceNumber - b.sequenceNumber;
    }
    return b.daysSince - a.daysSince;
  });

  return eligible;
}

export { formatDetailDate, daysBetween };
