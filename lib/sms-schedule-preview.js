import {
  getSmsTrackForClient,
  isMaintenanceProgramEligible,
} from "./client-tracks.js";
import { daysSinceLastDetail } from "./dates.js";
import { getEligibleClients } from "./eligibility.js";
import { normalizeLanguage } from "./languages.js";
import {
  buildMaintenanceReminderMessage,
  formatDetailDate,
} from "./message-template.js";
import { getEffectiveDaysForScheduleStep } from "./schedule-rules.js";
import { loadActiveSchedule } from "./schedule-db.js";
import { MAX_SCHEDULED_SMS_PER_RUN } from "./sms-cooldown.js";
import {
  getCycleReminders,
  getCycleSmsAttempts,
  hasExceededSmsFailureLimit,
} from "./sms-retry.js";
import { getSmsSendWindowLabel, isWithinSmsSendWindow } from "./sms-send-window.js";
import {
  getBookingSourceForTrack,
  getTriggerTypeForTrack,
  MANUAL_SMS_TRIGGER_TYPE,
  TRACK_LABELS,
  TRACKS,
} from "./tracks.js";
import { LANGUAGES } from "./languages.js";

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 200;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchAllRows(supabase, table, select, applyFilters) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (applyFilters) query = applyFilters(query);

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
      if (applyFilters) filtered = applyFilters(filtered);
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
    if (!remindersByClient.has(key)) remindersByClient.set(key, []);
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
    if (!manualByClient.has(row.client_id)) manualByClient.set(row.client_id, []);
    manualByClient.get(row.client_id).push({ createdAt });
  }
  return manualByClient;
}

function hadManualSmsInCycle(manualRows, cycleAnchor) {
  return manualRows.some((row) => row.createdAt > cycleAnchor);
}

function daysBetween(earlier, later) {
  return daysSinceLastDetail(earlier, later) ?? 0;
}

function buildClientContext(client, latestDetail) {
  if (!latestDetail) return null;

  const lastDetailDate = latestDetail.completedAt;
  const daysSince = daysBetween(lastDetailDate, new Date());
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
    preferredLanguage: normalizeLanguage(client.preferred_language),
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

function buildMessagePreview(context, messageBody, sequenceNumber, track) {
  const bookingSource = getBookingSourceForTrack(track);
  return buildMaintenanceReminderMessage({
    messageBody,
    clientName: context.name,
    shortRef: "preview",
    serviceType: context.lastServiceType,
    lastDetailDate: context.lastDetailDate,
    daysSince: context.daysSince,
    bookingSource,
  });
}

function formatSendTiming({ status, daysUntilSend, inSendWindow }) {
  if (status === "upcoming") {
    if (daysUntilSend <= 0) return "Eligible soon (checking daily)";
    if (daysUntilSend === 1) return "Eligible in ~1 day";
    return `Eligible in ~${daysUntilSend} days`;
  }

  if (!inSendWindow) {
    return `Due now — next send ${getSmsSendWindowLabel()}`;
  }

  return "Due now — next hourly run (max 20/hour)";
}

function mapRow(context, extra) {
  return {
    clientId: context.clientId,
    name: context.name,
    phone: context.phone,
    city: context.city,
    track: context.track,
    trackLabel: TRACK_LABELS[context.track] ?? context.track,
    triggerType: getTriggerTypeForTrack(context.track),
    preferredLanguage: context.preferredLanguage,
    sequenceNumber: extra.sequenceNumber,
    daysSinceLastDetail: context.daysSince,
    requiredDays: extra.requiredDays,
    daysUntilSend: extra.daysUntilSend,
    lastDetailDate: context.lastDetailDate.toISOString(),
    lastDetailDateFormatted: context.lastDetailDateFormatted,
    lastServiceType: context.lastServiceType,
    messagePreview: extra.messagePreview,
    status: extra.status,
    sendTiming: formatSendTiming({
      status: extra.status,
      daysUntilSend: extra.daysUntilSend,
      inSendWindow: extra.inSendWindow,
    }),
  };
}

function compareRows(a, b) {
  if (a.status === "due_now" && b.status !== "due_now") return -1;
  if (b.status === "due_now" && a.status !== "due_now") return 1;
  if (a.daysUntilSend !== b.daysUntilSend) return a.daysUntilSend - b.daysUntilSend;
  if (a.requiredDays !== b.requiredDays) return a.requiredDays - b.requiredDays;
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
}

export async function getSmsSchedulePreview(supabase) {
  const clients = await fetchAllRows(
    supabase,
    "clients",
    "id, name, phone, city, opted_out, preferred_language",
    (query) => query.eq("opted_out", false).order("name", { ascending: true }),
  );

  if (!clients.length) {
    return emptyPreview();
  }

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
        const steps = await loadActiveSchedule(supabase, track, language);
        return [`${track}:${language}`, steps];
      }),
    ),
  );

  const inSendWindow = isWithinSmsSendWindow();
  const dueNow = [];
  const upcoming = [];

  for (const client of clients) {
    if (!client.phone?.trim()) continue;

    const context = buildClientContext(client, latestDetailByClient.get(client.id));
    if (!context || !context.track) continue;

    const scheduleKey = `${context.track}:${context.preferredLanguage}`;
    const schedule =
      schedules[scheduleKey] ?? schedules[`${context.track}:${LANGUAGES.EN}`] ?? [];
    if (!schedule.length) continue;

    const scheduleBySequence = new Map(schedule.map((step) => [step.sequence_number, step]));
    const triggerType = getTriggerTypeForTrack(context.track);
    const reminderKey = `${client.id}:${triggerType}`;
    const cycleAttempts = getCycleSmsAttempts(
      remindersByClient.get(reminderKey) ?? [],
      context.cycleAnchor,
    );
    const cycleReminders = getCycleReminders(
      remindersByClient.get(reminderKey) ?? [],
      context.cycleAnchor,
    );

    let highestReceived = getHighestSequenceInCycle(cycleReminders);
    const manualInCycle = hadManualSmsInCycle(
      manualSmsByClient.get(client.id) ?? [],
      context.cycleAnchor,
    );
    const step1 = scheduleBySequence.get(1);
    const step1MinDays = step1
      ? getEffectiveDaysForScheduleStep(context.track, 1, step1.days_since_last_detail)
      : null;

    if (manualInCycle && step1MinDays != null && context.daysSince >= step1MinDays) {
      highestReceived = Math.max(highestReceived, 1);
    }

    const nextSequenceNumber = highestReceived + 1;
    const nextStep = scheduleBySequence.get(nextSequenceNumber);
    if (!nextStep) continue;
    if (hasSequenceInCycle(cycleReminders, nextSequenceNumber)) continue;

    const requiredDays = getEffectiveDaysForScheduleStep(
      context.track,
      nextSequenceNumber,
      nextStep.days_since_last_detail,
    );
    const daysUntilSend = Math.max(0, requiredDays - context.daysSince);
    const messagePreview = buildMessagePreview(
      context,
      nextStep.message_body,
      nextSequenceNumber,
      context.track,
    );

    if (context.daysSince < requiredDays) {
      upcoming.push(
        mapRow(context, {
          sequenceNumber: nextSequenceNumber,
          requiredDays,
          daysUntilSend,
          messagePreview,
          status: "upcoming",
          inSendWindow,
        }),
      );
      continue;
    }

    if (hasExceededSmsFailureLimit(cycleAttempts, nextSequenceNumber)) {
      continue;
    }

    dueNow.push(
      mapRow(context, {
        sequenceNumber: nextSequenceNumber,
        requiredDays,
        daysUntilSend: 0,
        messagePreview,
        status: "due_now",
        inSendWindow,
      }),
    );
  }

  dueNow.sort(compareRows);
  upcoming.sort(compareRows);

  const dueEligible = await getEligibleClients(supabase);

  return {
    generatedAt: new Date().toISOString(),
    inSendWindow,
    rules: {
      sendWindow: getSmsSendWindowLabel(),
      maxPerHour: MAX_SCHEDULED_SMS_PER_RUN,
      note: "One automated step per client per detail cycle. Retries stop after 2 failures per step.",
    },
    summary: {
      dueNow: dueNow.length,
      dueNowWillSendThisHour: inSendWindow
        ? Math.min(dueNow.length, MAX_SCHEDULED_SMS_PER_RUN)
        : 0,
      upcoming: upcoming.length,
      eligibleConfirmed: dueEligible.length,
    },
    dueNow,
    upcoming,
  };
}

function emptyPreview() {
  return {
    generatedAt: new Date().toISOString(),
    inSendWindow: isWithinSmsSendWindow(),
    rules: {
      sendWindow: getSmsSendWindowLabel(),
      maxPerHour: MAX_SCHEDULED_SMS_PER_RUN,
      note: "One automated step per client per detail cycle. Retries stop after 2 failures per step.",
    },
    summary: {
      dueNow: 0,
      dueNowWillSendThisHour: 0,
      upcoming: 0,
      eligibleConfirmed: 0,
    },
    dueNow: [],
    upcoming: [],
  };
}
