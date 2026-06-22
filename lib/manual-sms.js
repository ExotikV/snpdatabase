import twilio from "twilio";
import { getSmsTrackForClient } from "./client-tracks.js";
import { getFirstName, renderMessageTemplate } from "./message-template.js";
import { normalizeLanguage } from "./languages.js";
import { isProductionSmsEnabled } from "./sms-config.js";
import { appendOptOutFooter, assertClientCanReceiveSms } from "./sms-opt-out.js";
import {
  insertPendingSmsLog,
  markSmsLogFailed,
  markSmsLogSent,
} from "./sms.js";
import { TRACK_LABELS } from "./tracks.js";

export const MANUAL_SMS_TRIGGER_TYPE = "manual";

const SEND_DELAY_MS = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTwilioErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid?.trim() || !token?.trim() || !from?.trim()) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER",
    );
  }

  return { client: twilio(sid, token), from };
}

function resolveSendToNumber(phone) {
  const testMode = process.env.SMS_TEST_MODE === "true";
  const testPhone = process.env.SMS_TEST_PHONE_NUMBER?.trim();

  if (testMode) {
    if (!testPhone) {
      throw new Error("SMS_TEST_MODE is enabled but SMS_TEST_PHONE_NUMBER is not set");
    }
    return { to: testPhone, testMode: true };
  }

  if (!phone?.trim()) {
    throw new Error("Client has no phone number");
  }

  return { to: phone.trim(), testMode: false };
}

function daysBetween(fromDate, toDate) {
  const from = toInstantForDaysCalc(fromDate);
  if (Number.isNaN(from.getTime())) return null;
  return Math.max(0, Math.floor((toDate.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
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

function mapManualSmsClient(client, latestByClient, now) {
  const last = latestByClient.get(client.id);
  const daysSince = last ? daysBetween(last.completedAt, now) : null;
  const hasCompletedDetail = Boolean(last);
  const smsTrack = hasCompletedDetail
    ? getSmsTrackForClient({
        city: client.city,
        daysSinceLastDetail: daysSince,
        hasCompletedDetail: true,
      })
    : null;

  return {
    clientId: client.id,
    name: client.name,
    phone: client.phone,
    city: client.city,
    preferredLanguage: client.preferred_language ?? "en",
    lastServiceType: last?.serviceType ?? null,
    lastDetailDate: last?.completedAt?.toISOString().slice(0, 10) ?? null,
    daysSince,
    smsTrack,
    smsTrackLabel: smsTrack ? (TRACK_LABELS[smsTrack] ?? smsTrack) : "No completed detail",
  };
}

export async function loadManualSmsClients(supabase, { search } = {}) {
  let query = supabase
    .from("clients")
    .select("id, name, phone, city, opted_out, preferred_language")
    .eq("opted_out", false)
    .not("phone", "is", null)
    .order("name", { ascending: true })
    .limit(500);

  if (search?.trim()) {
    query = query.ilike("name", `%${search.trim()}%`);
  }

  const { data: clients, error: clientsError } = await query;
  if (clientsError) throw clientsError;
  if (!clients?.length) return [];

  const clientIds = clients.map((client) => client.id);
  const { data: details, error: detailsError } = await supabase
    .from("details_completed")
    .select("client_id, completed_at, service_type")
    .in("client_id", clientIds);

  if (detailsError) throw detailsError;

  const latestByClient = getLatestDetailByClient(details ?? []);
  const now = new Date();

  return clients.map((client) => mapManualSmsClient(client, latestByClient, now));
}

export function pickManualMessageBody(messages, preferredLanguage) {
  const lang = normalizeLanguage(preferredLanguage);
  const en = messages?.en?.trim() ?? "";
  const fr = messages?.fr?.trim() ?? "";

  if (lang === "fr" && fr) return fr;
  if (en) return en;
  if (fr) return fr;

  return "";
}

export function buildManualSmsBody(messageBody, client, smsLogRow) {
  const template = messageBody?.trim();
  if (!template) {
    throw new Error("Message body is required");
  }

  return renderMessageTemplate(template, {
    name: client.name ?? "",
    firstName: getFirstName(client.name),
    serviceType: client.lastServiceType,
    lastDetailDate: client.lastDetailDate,
    daysSince: client.daysSince,
    shortRef: smsLogRow.shortRef,
    smsLogId: smsLogRow.id,
  });
}

async function insertManualSmsLog(supabase, clientId) {
  return insertPendingSmsLog(supabase, clientId, null, MANUAL_SMS_TRIGGER_TYPE);
}

export async function sendManualSmsToClient(supabase, client, messages) {
  if (!isProductionSmsEnabled()) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      reason: "Production SMS sends are disabled (SMS_PRODUCTION_SENDS_ENABLED is not true)",
      productionBlocked: true,
    };
  }

  const preferredLanguage = normalizeLanguage(client.preferredLanguage);
  const messageBody = pickManualMessageBody(messages, preferredLanguage);

  if (!messageBody) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      reason:
        preferredLanguage === "fr"
          ? "French message is empty (and no English fallback)"
          : "English message is empty",
    };
  }

  const smsGate = await assertClientCanReceiveSms(supabase, client.clientId);
  if (!smsGate.ok) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      reason: smsGate.reason,
      optedOut: Boolean(smsGate.optedOut),
    };
  }

  const { client: twilioClient, from } = getTwilioClient();
  const { to, testMode } = resolveSendToNumber(client.phone);

  let smsLogRow;
  try {
    smsLogRow = await insertManualSmsLog(supabase, client.clientId);
  } catch (error) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      reason: getTwilioErrorMessage(error),
    };
  }

  let body;
  try {
    body = appendOptOutFooter(
      buildManualSmsBody(messageBody, client, smsLogRow),
      preferredLanguage,
    );
  } catch (error) {
    const reason = getTwilioErrorMessage(error);
    try {
      await markSmsLogFailed(supabase, smsLogRow.id, reason);
    } catch {
      // ignore
    }
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      smsLogId: smsLogRow.id,
      reason,
    };
  }

  try {
    await twilioClient.messages.create({ body, from, to });
    await markSmsLogSent(supabase, smsLogRow.id);
    return {
      ok: true,
      clientId: client.clientId,
      name: client.name,
      phone: to,
      smsLogId: smsLogRow.id,
      shortRef: smsLogRow.shortRef,
      testMode,
      body,
      language: preferredLanguage,
    };
  } catch (error) {
    const reason = getTwilioErrorMessage(error);
    try {
      await markSmsLogFailed(supabase, smsLogRow.id, reason);
    } catch {
      // ignore
    }
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      smsLogId: smsLogRow.id,
      reason,
    };
  }
}

export async function sendManualSmsBulk(supabase, clients, messages) {
  const sent = [];
  const failed = [];

  for (let i = 0; i < clients.length; i += 1) {
    const result = await sendManualSmsToClient(supabase, clients[i], messages);
    if (result.ok) sent.push(result);
    else failed.push(result);

    if (i < clients.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return { sent, failed };
}

export async function loadManualSmsClientsByIds(supabase, clientIds) {
  const uniqueIds = [...new Set((clientIds ?? []).map((id) => String(id).trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name, phone, city, opted_out, preferred_language")
    .in("id", uniqueIds)
    .eq("opted_out", false)
    .not("phone", "is", null);

  if (clientsError) throw clientsError;
  if (!clients?.length) return [];

  const ids = clients.map((client) => client.id);
  const { data: details, error: detailsError } = await supabase
    .from("details_completed")
    .select("client_id, completed_at, service_type")
    .in("client_id", ids);

  if (detailsError) throw detailsError;

  const latestByClient = getLatestDetailByClient(details ?? []);
  const now = new Date();

  return clients.map((client) => mapManualSmsClient(client, latestByClient, now));
}
