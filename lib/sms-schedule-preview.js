import {
  getSmsTrackForClient,
  isEligibleCity,
  isMaintenanceProgramEligible,
} from "./client-tracks.js";
import { daysSinceLastDetail, hoursSinceInstant } from "./dates.js";
import { syncSquareAppointments } from "./appointment-sync.js";
import {
  getLatestCompletedDetailByClient,
  isPastCompletedAt,
} from "./completed-details.js";
import { getEligibleClients } from "./eligibility.js";
import { normalizeLanguage } from "./languages.js";
import {
  buildMaintenanceReminderMessage,
  formatDetailDate,
} from "./message-template.js";
import { resolveNextScheduleStep, DELAY_UNITS, formatDelayLabel } from "./schedule-rules.js";
import { loadActiveSchedule } from "./schedule-db.js";
import { MAX_SCHEDULED_SMS_PER_RUN } from "./sms-cooldown.js";
import {
  getCycleReminders,
  getCycleSmsAttempts,
  hasExceededSmsFailureLimit,
} from "./sms-retry.js";
import { getSmsSendWindowLabel, isWithinSmsSendWindow } from "./sms-send-window.js";
import { estimateScheduledSendAt, formatEstimatedSendAt } from "./sms-send-estimate.js";
import { loadSmsAppointmentGuards } from "./sms-appointment-guards.js";
import { applyRebookContextToSmsClient } from "./sms-cycle.js";
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

  const now = new Date();
  if (!isPastCompletedAt(latestDetail.completedAt, now)) return null;

  const lastDetailDate = latestDetail.completedAt;
  const daysSince = daysBetween(lastDetailDate, now);
  const hoursSince = hoursSinceInstant(lastDetailDate, now) ?? 0;
  const track = getSmsTrackForClient({
    city: client.city,
    daysSinceLastDetail: daysSince,
    hasCompletedDetail: true,
  });

  if (!track) return null;

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
    hoursSince,
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

function formatSendTiming({ status, timeUntilSend, delayUnit, inSendWindow }) {
  if (status === "upcoming") {
    if (timeUntilSend <= 0) {
      return delayUnit === DELAY_UNITS.HOURS
        ? "Eligible soon (checks hourly)"
        : "Eligible soon (checking daily)";
    }
    if (delayUnit === DELAY_UNITS.HOURS) {
      const rounded = Math.ceil(timeUntilSend);
      return rounded === 1 ? "Eligible in ~1 hour" : `Eligible in ~${rounded} hours`;
    }
    if (timeUntilSend === 1) return "Eligible in ~1 day";
    return `Eligible in ~${timeUntilSend} days`;
  }

  if (!inSendWindow) {
    if (delayUnit === DELAY_UNITS.HOURS) {
      return "Due now — next hourly run (hour-based, any time)";
    }
    return `Due now — next send ${getSmsSendWindowLabel()}`;
  }

  if (delayUnit === DELAY_UNITS.HOURS) {
    return "Due now — next hourly run (hour-based)";
  }

  return "Due now — next hourly run (max 20/hour)";
}

function formatElapsedSinceDetail(context) {
  const hours = context.hoursSince ?? 0;
  if (hours < 48) {
    const rounded = Math.floor(hours);
    return rounded === 1 ? "1 hour" : `${rounded} hours`;
  }
  return context.daysSince === 1 ? "1 day" : `${context.daysSince} days`;
}

function mapRow(context, extra) {
  const estimatedSendAt = estimateScheduledSendAt({
    lastDetailDate: context.lastDetailDate,
    requiredAmount: extra.requiredAmount,
    delayUnit: extra.delayUnit,
    status: extra.status,
  });

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
    hoursSince: context.hoursSince,
    elapsedSinceDetail: formatElapsedSinceDetail(context),
    requiredAmount: extra.requiredAmount,
    delayUnit: extra.delayUnit,
    requiredDelayLabel: formatDelayLabel(extra.requiredAmount, extra.delayUnit),
    requiredDays: extra.requiredDays ?? null,
    daysUntilSend: extra.daysUntilSend ?? null,
    timeUntilSend: extra.timeUntilSend,
    lastDetailDate: context.lastDetailDate.toISOString(),
    lastDetailDateFormatted: context.lastDetailDateFormatted,
    lastServiceType: context.lastServiceType,
    messagePreview: extra.messagePreview,
    status: extra.status,
    sendTiming: formatSendTiming({
      status: extra.status,
      timeUntilSend: extra.timeUntilSend,
      delayUnit: extra.delayUnit,
      inSendWindow: extra.inSendWindow,
    }),
    estimatedSendAt: estimatedSendAt?.toISOString() ?? null,
    estimatedSendAtLabel: estimatedSendAt ? formatEstimatedSendAt(estimatedSendAt) : null,
  };
}

function compareRows(a, b) {
  if (a.status === "due_now" && b.status !== "due_now") return -1;
  if (b.status === "due_now" && a.status !== "due_now") return 1;
  if (a.estimatedSendAt && b.estimatedSendAt && a.estimatedSendAt !== b.estimatedSendAt) {
    return a.estimatedSendAt.localeCompare(b.estimatedSendAt);
  }
  if (a.timeUntilSend !== b.timeUntilSend) return a.timeUntilSend - b.timeUntilSend;
  if (a.requiredAmount !== b.requiredAmount) return a.requiredAmount - b.requiredAmount;
  return (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
}

export async function getSmsSchedulePreview(supabase, { syncFirst = false } = {}) {
  if (syncFirst) {
    await syncSquareAppointments(supabase, { mode: "hourly" });
  }

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
  const latestDetailByClient = getLatestDetailByClient(details, new Date());

  const guards = await loadSmsAppointmentGuards(supabase, { latestDetailByClient });
  const rebookByClient = guards.rebookByClient ?? new Map();

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

    if (guards.blockedClientIds.has(client.id)) continue;

    let context = buildClientContext(client, latestDetailByClient.get(client.id));
    if (!context || !context.track) continue;

    context = applyRebookContextToSmsClient(context, rebookByClient.get(client.id));

    if (context.track === TRACKS.MAINTENANCE && !isEligibleCity(client.city)) continue;

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
    if (manualInCycle) {
      highestReceived = Math.max(highestReceived, 1);
    }

    const next = resolveNextScheduleStep({
      scheduleBySequence,
      highestReceived,
      daysSince: context.daysSince,
      hoursSince: context.hoursSince,
      track: context.track,
    });

    if (next.status === "complete") continue;

    const nextSequenceNumber = next.sequenceNumber;
    const messagePreview = buildMessagePreview(
      context,
      next.step.message_body,
      nextSequenceNumber,
      context.track,
    );
    const rowExtra = {
      sequenceNumber: nextSequenceNumber,
      requiredAmount: next.requiredAmount,
      delayUnit: next.delayUnit,
      requiredDays: next.requiredDays,
      daysUntilSend: next.daysUntilSend,
      timeUntilSend: next.timeUntilSend,
      messagePreview,
      inSendWindow,
    };

    if (next.status === "upcoming") {
      upcoming.push(
        mapRow(context, {
          ...rowExtra,
          status: "upcoming",
        }),
      );
      continue;
    }

    if (hasSequenceInCycle(cycleReminders, nextSequenceNumber)) continue;

    if (hasExceededSmsFailureLimit(cycleAttempts, nextSequenceNumber)) {
      continue;
    }

    dueNow.push(
      mapRow(context, {
        ...rowExtra,
        timeUntilSend: 0,
        status: "due_now",
      }),
    );
  }

  dueNow.sort(compareRows);
  upcoming.sort(compareRows);

  const dueEligible = await getEligibleClients(supabase, { syncFirst: false });

  return {
    generatedAt: new Date().toISOString(),
    inSendWindow,
    rules: {
      sendWindow: getSmsSendWindowLabel(),
      maxPerHour: MAX_SCHEDULED_SMS_PER_RUN,
      note:
        "Sends only on the exact schedule day (not after). Manual SMS in this cycle counts as step 1. " +
        "Reminders pause while a client has an upcoming appointment or has rebooked after their last detail. " +
        "After a new detail completes, the reminder sequence starts fresh from that visit. " +
        "Reminders also pause for 30 days after a cancellation. " +
        "Only clients with at least one completed appointment receive automated sequences.",
    },
    summary: {
      dueNow: dueNow.length,
      dueNowWillSendThisHour: inSendWindow
        ? Math.min(dueNow.length, MAX_SCHEDULED_SMS_PER_RUN)
        : 0,
      upcoming: upcoming.length,
      eligibleConfirmed: dueEligible.length,
      pausedForAppointments: guards.blockedClientIds.size,
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
      note:
        "Sends only on the exact schedule day (not after). Manual SMS in this cycle counts as step 1. " +
        "Reminders pause while a client has an upcoming appointment or has rebooked after their last detail. " +
        "After a new detail completes, the reminder sequence starts fresh from that visit. " +
        "Reminders also pause for 30 days after a cancellation. " +
        "Only clients with at least one completed appointment receive automated sequences.",
    },
    summary: {
      dueNow: 0,
      dueNowWillSendThisHour: 0,
      upcoming: 0,
      eligibleConfirmed: 0,
      pausedForAppointments: 0,
    },
    dueNow: [],
    upcoming: [],
  };
}
