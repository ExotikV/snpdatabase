import twilio from "twilio";
import { buildBookingUrl, hasShortRefColumn } from "./booking-url.js";
import { generateShortRef } from "./short-ref.js";
import { toInstantForDaysCalc } from "./dates.js";
import { buildMaintenanceReminderMessage } from "./message-template.js";
import { isProductionSmsEnabled, getTestPhoneNumber } from "./sms-config.js";
import { assertClientSmsCooldown } from "./sms-cooldown.js";
import { assertSmsSendWindow } from "./sms-send-window.js";
import { appendOptOutFooter, assertClientCanReceiveSms } from "./sms-opt-out.js";
import { getBookingSourceForTrack, getTriggerTypeForTrack } from "./tracks.js";

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

async function insertPendingSmsLog(supabase, clientId, sequenceNumber, triggerType) {
  const supportsShortRef = await hasShortRefColumn(supabase);

  if (!supportsShortRef) {
    const { data, error } = await supabase
      .from("sms_log")
      .insert({
        client_id: clientId,
        trigger_type: triggerType,
        status: "pending",
        sequence_number: sequenceNumber,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: data.id, shortRef: null };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shortRef = generateShortRef();
    const { data, error } = await supabase
      .from("sms_log")
      .insert({
        client_id: clientId,
        trigger_type: triggerType,
        status: "pending",
        sequence_number: sequenceNumber,
        short_ref: shortRef,
      })
      .select("id, short_ref")
      .single();

    if (!error) {
      return { id: data.id, shortRef: data.short_ref };
    }

    if (error.code === "23505") continue;
    throw error;
  }

  throw new Error("Failed to generate a unique booking short link code");
}

async function markSmsLogSent(supabase, smsLogId) {
  const { error } = await supabase
    .from("sms_log")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", smsLogId);

  if (error) throw error;
}

async function markSmsLogFailed(supabase, smsLogId, errorMessage) {
  const { error } = await supabase
    .from("sms_log")
    .update({ status: "failed", error_message: errorMessage })
    .eq("id", smsLogId);

  if (error) throw error;
}

export {
  insertPendingSmsLog,
  markSmsLogSent,
  markSmsLogFailed,
};

export async function sendReminderToClient(supabase, client) {
  if (!isProductionSmsEnabled()) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      track: client.track,
      reason: "Production SMS sends are disabled (SMS_PRODUCTION_SENDS_ENABLED is not true)",
      productionBlocked: true,
    };
  }

  const smsGate = await assertClientCanReceiveSms(supabase, client.clientId);
  if (!smsGate.ok) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      track: client.track,
      reason: smsGate.reason,
      optedOut: Boolean(smsGate.optedOut),
    };
  }

  const cooldownGate = await assertClientSmsCooldown(supabase, client.clientId);
  if (!cooldownGate.ok) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      track: client.track,
      reason: cooldownGate.reason,
      inCooldown: true,
    };
  }

  const sendWindowGate = assertSmsSendWindow();
  if (!sendWindowGate.ok) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      track: client.track,
      reason: sendWindowGate.reason,
      outsideSendWindow: true,
    };
  }

  const { client: twilioClient, from } = getTwilioClient();

  let to;
  let testMode;
  try {
    ({ to, testMode } = resolveSendToNumber(client.phone));
  } catch (error) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      track: client.track,
      reason: getTwilioErrorMessage(error),
    };
  }

  const triggerType = getTriggerTypeForTrack(client.track);
  const bookingSource = getBookingSourceForTrack(client.track);

  let smsLogRow;
  try {
    smsLogRow = await insertPendingSmsLog(
      supabase,
      client.clientId,
      client.sequenceNumber,
      triggerType,
    );
  } catch (error) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      track: client.track,
      reason: getTwilioErrorMessage(error),
    };
  }

  const body = appendOptOutFooter(
    buildMaintenanceReminderMessage({
      messageBody: client.messageBody,
      clientName: client.name,
      smsLogId: smsLogRow.id,
      shortRef: smsLogRow.shortRef,
      serviceType: client.lastServiceType,
      lastDetailDate: client.lastDetailDate,
      daysSince: client.daysSince,
      bookingSource,
    }),
    client.preferredLanguage,
  );

  try {
    await twilioClient.messages.create({ body, from, to });
    await markSmsLogSent(supabase, smsLogRow.id);
    return {
      ok: true,
      clientId: client.clientId,
      name: client.name,
      track: client.track,
      phone: to,
      smsLogId: smsLogRow.id,
      testMode,
      body,
    };
  } catch (error) {
    const reason = getTwilioErrorMessage(error);
    try {
      await markSmsLogFailed(supabase, smsLogRow.id, reason);
    } catch {
      // ignore secondary failure
    }
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      track: client.track,
      smsLogId: smsLogRow.id,
      reason,
    };
  }
}

/** @deprecated use sendReminderToClient */
export const sendMaintenanceReminderToClient = sendReminderToClient;

export async function sendReminders(supabase, eligibleClients) {
  const sent = [];
  const failed = [];

  for (let i = 0; i < eligibleClients.length; i += 1) {
    const result = await sendReminderToClient(supabase, eligibleClients[i]);
    if (result.ok) sent.push(result);
    else failed.push(result);

    if (i < eligibleClients.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return { sent, failed };
}

/** @deprecated use sendReminders */
export const sendMaintenanceReminders = sendReminders;

export { isProductionSmsEnabled, getSmsSafetyStatus, getTestPhoneNumber } from "./sms-config.js";

export async function sendTestReminderSms(
  supabase,
  {
    messageBody,
    daysSince,
    phone,
    track = "maintenance",
    clientId,
    clientName,
    serviceType,
    lastDetailDate,
    preferredLanguage = "en",
    sequenceNumber = 0,
  },
) {
  if (!clientId) {
    return {
      ok: false,
      reason: "Select a client before sending test SMS so the booking link is tracked in sms_log",
    };
  }

  const smsGate = await assertClientCanReceiveSms(supabase, clientId);
  if (!smsGate.ok) {
    return { ok: false, reason: smsGate.reason, optedOut: Boolean(smsGate.optedOut) };
  }

  const { client: twilioClient, from } = getTwilioClient();
  const to = getTestPhoneNumber(phone);
  const triggerType = getTriggerTypeForTrack(track);
  const bookingSource = getBookingSourceForTrack(track);

  let smsLogRow;
  try {
    smsLogRow = await insertPendingSmsLog(supabase, clientId, sequenceNumber, triggerType);
  } catch (error) {
    return { ok: false, to, reason: getTwilioErrorMessage(error) };
  }

  let detailDate;
  if (lastDetailDate) {
    detailDate = toInstantForDaysCalc(lastDetailDate);
    if (Number.isNaN(detailDate.getTime())) {
      return { ok: false, to, reason: "Invalid last_detail_date" };
    }
  } else {
    const days = daysSince ?? 30;
    detailDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  const computedDaysSince = Math.max(
    0,
    Math.floor((Date.now() - detailDate.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const days = daysSince ?? computedDaysSince;

  const body = appendOptOutFooter(
    buildMaintenanceReminderMessage({
      messageBody,
      clientName: clientName?.trim() || "Test Client",
      smsLogId: smsLogRow.id,
      shortRef: smsLogRow.shortRef,
      serviceType: serviceType?.trim() || "Interior + Exterior",
      lastDetailDate: lastDetailDate ?? detailDate,
      daysSince: days,
      bookingSource,
    }),
    preferredLanguage,
  );

  try {
    await twilioClient.messages.create({ body, from, to });
    await markSmsLogSent(supabase, smsLogRow.id);
    return {
      ok: true,
      to,
      body,
      smsLogId: smsLogRow.id,
      shortRef: smsLogRow.shortRef,
      bookingUrl: buildBookingUrl({
        shortRef: smsLogRow.shortRef,
        smsLogId: smsLogRow.id,
        source: bookingSource,
      }),
    };
  } catch (error) {
    const reason = getTwilioErrorMessage(error);
    try {
      await markSmsLogFailed(supabase, smsLogRow.id, reason);
    } catch {
      // ignore secondary failure
    }
    return { ok: false, to, reason };
  }
}
