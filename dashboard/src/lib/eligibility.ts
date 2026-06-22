import type { SupabaseClient } from "@supabase/supabase-js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 200;

export type EligibleClient = {
  clientId: string;
  name: string;
  phone: string | null;
  lastDetailDate: Date;
  lastServiceType: string | null;
  daysSince: number;
  sequenceNumber: number;
  daysSinceLastDetail: number;
  messageBody: string;
};

type ReminderRow = {
  sequenceNumber: number;
  createdAt: Date;
  status: string;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

export function formatDetailDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

type QueryBuilder = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
};

type FilterChain = {
  eq: (column: string, value: unknown) => FilterChain;
  not: (column: string, operator: string, value: unknown) => FilterChain;
  in: (column: string, values: string[]) => FilterChain;
};

function asFilterChain(query: unknown): FilterChain {
  return query as FilterChain;
}

async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  applyFilters?: (query: unknown) => unknown,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query: QueryBuilder = supabase.from(table).select(select) as unknown as QueryBuilder;
    if (applyFilters) {
      query = applyFilters(query) as QueryBuilder;
    }

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) {
      throw error;
    }

    const page = (data as T[] | null) ?? [];
    if (page.length === 0) {
      break;
    }

    rows.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }

    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchRowsForClientIds<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  clientIds: string[],
  applyFilters?: (query: unknown) => unknown,
): Promise<T[]> {
  const rows: T[] = [];

  for (const ids of chunkArray(clientIds, IN_CHUNK_SIZE)) {
    const chunkRows = await fetchAllRows<T>(supabase, table, select, (query) => {
      let filtered = asFilterChain(query).in("client_id", ids);
      if (applyFilters) {
        filtered = applyFilters(filtered) as FilterChain;
      }
      return filtered;
    });
    rows.push(...chunkRows);
  }

  return rows;
}

function getLatestDetailByClient(
  details: {
    client_id: string;
    completed_at: string | null;
    service_type: string | null;
  }[],
): Map<string, { completedAt: Date; serviceType: string | null }> {
  const latestByClient = new Map<string, { completedAt: Date; serviceType: string | null }>();

  for (const row of details) {
    if (!row.completed_at) {
      continue;
    }

    const completedAt = new Date(row.completed_at);
    if (Number.isNaN(completedAt.getTime())) {
      continue;
    }

    const existing = latestByClient.get(row.client_id);
    if (!existing || completedAt > existing.completedAt) {
      latestByClient.set(row.client_id, {
        completedAt,
        serviceType: row.service_type,
      });
    }
  }

  return latestByClient;
}

function groupRemindersByClient(
  reminders: {
    client_id: string;
    sequence_number: number | null;
    created_at: string;
    status: string;
  }[],
): Map<string, ReminderRow[]> {
  const remindersByClient = new Map<string, ReminderRow[]>();

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

    remindersByClient.get(row.client_id)!.push({
      sequenceNumber: row.sequence_number,
      createdAt,
      status: row.status,
    });
  }

  return remindersByClient;
}

function getCycleReminders(reminderRows: ReminderRow[], lastDetailDate: Date) {
  return reminderRows.filter(
    (row) =>
      row.createdAt > lastDetailDate &&
      (row.status === "sent" || row.status === "pending"),
  );
}

function getHighestSequenceInCycle(cycleReminders: ReminderRow[]): number {
  let highest = 0;
  for (const row of cycleReminders) {
    if (row.sequenceNumber > highest) {
      highest = row.sequenceNumber;
    }
  }
  return highest;
}

function hasSequenceInCycle(cycleReminders: ReminderRow[], sequenceNumber: number) {
  return cycleReminders.some((row) => row.sequenceNumber === sequenceNumber);
}

export async function getReminderSchedule(supabase: SupabaseClient) {
  const rows = await fetchAllRows<{
    sequence_number: number;
    days_since_last_detail: number;
    active: boolean;
    message_body: string;
  }>(
    supabase,
    "reminder_schedule",
    "sequence_number, days_since_last_detail, active, message_body",
    (query) => asFilterChain(query).eq("active", true),
  );

  return rows.slice().sort((a, b) => a.sequence_number - b.sequence_number);
}

export async function getEligibleClients(supabase: SupabaseClient): Promise<EligibleClient[]> {
  const schedule = await getReminderSchedule(supabase);
  if (schedule.length === 0) {
    return [];
  }

  const scheduleBySequence = new Map(
    schedule.map((step) => [step.sequence_number, step]),
  );

  const enrollments = await fetchAllRows<{
    client_id: string;
    clients: { id: string; name: string | null; phone: string | null; opted_out: boolean } | null;
  }>(supabase, "maintenance_enrollment", "client_id, clients(id, name, phone, opted_out)", (query) =>
    asFilterChain(query).eq("active", true),
  );

  const clientMap = new Map<
    string,
    { clientId: string; name: string; phone: string | null }
  >();

  for (const enrollment of enrollments) {
    const client = enrollment.clients;
    if (!client || client.opted_out) {
      continue;
    }

    clientMap.set(client.id, {
      clientId: client.id,
      name: client.name ?? "(no name)",
      phone: client.phone,
    });
  }

  if (clientMap.size === 0) {
    return [];
  }

  const clientIds = [...clientMap.keys()];

  const details = await fetchRowsForClientIds<{
    client_id: string;
    completed_at: string | null;
    service_type: string | null;
  }>(supabase, "details_completed", "client_id, completed_at, service_type", clientIds);

  const latestDetailByClient = getLatestDetailByClient(details);

  const reminders = await fetchRowsForClientIds<{
    client_id: string;
    sequence_number: number | null;
    created_at: string;
    status: string;
  }>(supabase, "sms_log", "client_id, sequence_number, created_at, status", clientIds, (query) =>
    asFilterChain(query)
      .eq("trigger_type", "maintenance_reminder")
      .not("sequence_number", "is", null),
  );

  const remindersByClient = groupRemindersByClient(reminders);
  const now = new Date();
  const eligible: EligibleClient[] = [];

  for (const [clientId, client] of clientMap) {
    const lastDetail = latestDetailByClient.get(clientId);
    if (!lastDetail) {
      continue;
    }

    const lastDetailDate = lastDetail.completedAt;
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
      name: client.name,
      phone: client.phone,
      lastDetailDate,
      lastServiceType: lastDetail.serviceType,
      daysSince,
      sequenceNumber: nextSequenceNumber,
      daysSinceLastDetail: nextStep.days_since_last_detail,
      messageBody: nextStep.message_body,
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
