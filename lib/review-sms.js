import twilio from "twilio";
import { daysSinceLastDetail } from "./dates.js";
import { getFirstName, renderMessageTemplate } from "./message-template.js";
import { normalizeLanguage } from "./languages.js";
import { pickManualMessageBody } from "./manual-sms.js";
import { isProductionSmsEnabled } from "./sms-config.js";
import { appendOptOutFooter, assertClientCanReceiveSms } from "./sms-opt-out.js";
import {
  insertPendingSmsLog,
  markSmsLogFailed,
  markSmsLogSent,
} from "./sms.js";
import { REVIEW_SMS_TRIGGER_TYPE } from "./tracks.js";
import { clientHasLifetimeReviewSms } from "./review-sms-eligibility.js";

export const MAX_REVIEW_SMS_PER_RUN = 20;

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

function buildReviewSmsBody(messageBody, client, settings) {
  const template = messageBody?.trim();
  if (!template) {
    throw new Error("Message body is required");
  }

  const lastDetailDate = client.completedAt?.slice(0, 10) ?? null;
  const daysSince = lastDetailDate
    ? daysSinceLastDetail(lastDetailDate, new Date())
    : null;

  return renderMessageTemplate(template, {
    name: client.name ?? "",
    firstName: getFirstName(client.name),
    serviceType: client.serviceType,
    lastDetailDate,
    daysSince,
    reviewUrl: settings.reviewUrl,
  });
}

export async function sendReviewSmsToClient(supabase, client, settings) {
  if (!isProductionSmsEnabled()) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      reason: "Production SMS sends are disabled (SMS_PRODUCTION_SENDS_ENABLED is not true)",
      productionBlocked: true,
    };
  }

  if (await clientHasLifetimeReviewSms(supabase, client.clientId)) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      reason: "Review SMS already sent to this client (one-time only)",
      alreadySent: true,
    };
  }

  const preferredLanguage = normalizeLanguage(client.preferredLanguage);
  const messages = {
    en: settings.messageBodyEn,
    fr: settings.messageBodyFr,
  };
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

  if (!settings.reviewUrl?.trim()) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      reason: "Review URL is not configured",
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
    smsLogRow = await insertPendingSmsLog(supabase, client.clientId, null, REVIEW_SMS_TRIGGER_TYPE);
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
      buildReviewSmsBody(messageBody, client, settings),
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

export async function sendDueReviewSmsBatch(supabase, settings, clients) {
  const sent = [];
  const failed = [];

  for (let i = 0; i < clients.length; i += 1) {
    const result = await sendReviewSmsToClient(supabase, clients[i], settings);
    if (result.ok) sent.push(result);
    else failed.push(result);

    if (i < clients.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return { sent, failed };
}

export async function runReviewSmsJob(supabase, now = new Date()) {
  const { loadReviewSmsSettings } = await import("./review-sms-settings.js");
  const { getClientsDueForReviewSms } = await import("./review-sms-eligibility.js");

  const settings = await loadReviewSmsSettings(supabase);
  if (settings.migrationRequired) {
    return {
      ok: true,
      skipped: true,
      reason: "Run schema/review_sms_settings.sql and schema/sms_log_review.sql in Supabase",
    };
  }

  if (!settings.active) {
    return { ok: true, skipped: true, reason: "Review SMS is disabled" };
  }

  if (!isProductionSmsEnabled()) {
    return {
      ok: true,
      skipped: true,
      reason: "SMS_PRODUCTION_SENDS_ENABLED is not true",
    };
  }

  const due = await getClientsDueForReviewSms(supabase, settings, now);
  const batch = due.slice(0, MAX_REVIEW_SMS_PER_RUN);
  const deferred = Math.max(0, due.length - batch.length);

  if (!batch.length) {
    return {
      ok: true,
      dueCount: 0,
      sentCount: 0,
      failedCount: 0,
      deferred,
    };
  }

  const { sent, failed } = await sendDueReviewSmsBatch(supabase, settings, batch);

  return {
    ok: true,
    dueCount: due.length,
    sentCount: sent.length,
    failedCount: failed.length,
    deferred,
    sent,
    failed,
  };
}
