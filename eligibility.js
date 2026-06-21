import { createClient } from "@supabase/supabase-js";

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

export function formatDetailDate(value) {
  return new Date(value).toISOString().slice(0, 10);
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

    if (!data || data.length === 0) {
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

function getLatestCompletedAtByClient(details) {
  const latestByClient = new Map();

  for (const row of details) {
    if (!row.completed_at) {
      continue;
    }

    const completedAt = new Date(row.completed_at);
    if (Number.isNaN(completedAt.getTime())) {
      continue;
    }

    const existing = latestByClient.get(row.client_id);
    if (!existing || completedAt > existing) {
      latestByClient.set(row.client_id, completedAt);
    }
  }

  return latestByClient;
}

function groupRemindersByClient(reminders) {
  const remindersByClient = new Map();

  for (const row of reminders) {
    if (row.sequence_number == null) {
      continue;
    }

    const createdAt = new Date(row.created_at);
    if (Number.isNaN(createdAt.getTime())) {
      continue;
    }

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
    if (row.sequenceNumber > highest) {
      highest = row.sequenceNumber;
    }
  }

  return highest;
}

function hasSequenceInCycle(cycleReminders, sequenceNumber) {
  return cycleReminders.some((row) => row.sequenceNumber === sequenceNumber);
}

export function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function getReminderSchedule(supabase) {
  const rows = await fetchAllRows(
    supabase,
    "reminder_schedule",
    "sequence_number, days_since_last_detail, active",
    (query) => query.eq("active", true),
  );

  return rows
    .slice()
    .sort((a, b) => a.sequence_number - b.sequence_number);
}

export async function getEligibleClients(supabase) {
  const schedule = await getReminderSchedule(supabase);
  if (schedule.length === 0) {
    return [];
  }

  const scheduleBySequence = new Map(
    schedule.map((step) => [step.sequence_number, step]),
  );

  const enrollments = await fetchAllRows(
    supabase,
    "maintenance_enrollment",
    "client_id, clients(id, name, phone, opted_out)",
    (query) => query.eq("active", true),
  );

  const clientMap = new Map();
  for (const enrollment of enrollments) {
    const client = enrollment.clients;
    if (!client || client.opted_out) {
      continue;
    }

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
    "client_id, completed_at",
    clientIds,
  );

  const latestCompletedAtByClient = getLatestCompletedAtByClient(details);

  const reminders = await fetchRowsForClientIds(
    supabase,
    "sms_log",
    "client_id, sequence_number, created_at, status",
    clientIds,
    (query) =>
      query
        .eq("trigger_type", "maintenance_reminder")
        .not("sequence_number", "is", null),
  );

  const remindersByClient = groupRemindersByClient(reminders);
  const now = new Date();
  const eligible = [];

  for (const [clientId, client] of clientMap) {
    const lastDetailDate = latestCompletedAtByClient.get(clientId);
    if (!lastDetailDate) {
      continue;
    }

    const daysSince = daysBetween(lastDetailDate, now);
    const clientReminders = remindersByClient.get(clientId) ?? [];
    const cycleReminders = getCycleReminders(clientReminders, lastDetailDate);
    const highestReceived = getHighestSequenceInCycle(cycleReminders);
    const nextSequenceNumber = highestReceived + 1;
    const nextStep = scheduleBySequence.get(nextSequenceNumber);

    if (!nextStep) {
      continue;
    }

    if (daysSince < nextStep.days_since_last_detail) {
      continue;
    }

    if (hasSequenceInCycle(cycleReminders, nextSequenceNumber)) {
      continue;
    }

    eligible.push({
      clientId: client.clientId,
      name: client.name ?? "(no name)",
      phone: client.phone ?? null,
      lastDetailDate,
      daysSince,
      sequenceNumber: nextSequenceNumber,
      daysSinceLastDetail: nextStep.days_since_last_detail,
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
