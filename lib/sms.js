import twilio from "twilio";
import { buildMaintenanceReminderMessage } from "./message-template.js";

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

async function insertPendingSmsLog(supabase, clientId, sequenceNumber) {
  const { data, error } = await supabase
    .from("sms_log")
    .insert({
      client_id: clientId,
      trigger_type: "maintenance_reminder",
      status: "pending",
      sequence_number: sequenceNumber,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
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

export async function sendMaintenanceReminderToClient(supabase, client) {
  const { client: twilioClient, from } = getTwilioClient();
  const { to, testMode } = resolveSendToNumber(client.phone);

  let smsLogId;
  try {
    smsLogId = await insertPendingSmsLog(supabase, client.clientId, client.sequenceNumber);
  } catch (error) {
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      reason: getTwilioErrorMessage(error),
    };
  }

  const body = buildMaintenanceReminderMessage({
    messageBody: client.messageBody,
    clientName: client.name,
    smsLogId,
    serviceType: client.lastServiceType,
    lastDetailDate: client.lastDetailDate,
    daysSince: client.daysSince,
  });

  try {
    await twilioClient.messages.create({ body, from, to });
    await markSmsLogSent(supabase, smsLogId);
    return {
      ok: true,
      clientId: client.clientId,
      name: client.name,
      phone: to,
      smsLogId,
      testMode,
      body,
    };
  } catch (error) {
    const reason = getTwilioErrorMessage(error);
    try {
      await markSmsLogFailed(supabase, smsLogId, reason);
    } catch {
      // ignore secondary failure
    }
    return {
      ok: false,
      clientId: client.clientId,
      name: client.name,
      smsLogId,
      reason,
    };
  }
}

export async function sendMaintenanceReminders(supabase, eligibleClients) {
  const sent = [];
  const failed = [];

  for (let i = 0; i < eligibleClients.length; i += 1) {
    const result = await sendMaintenanceReminderToClient(supabase, eligibleClients[i]);
    if (result.ok) {
      sent.push(result);
    } else {
      failed.push(result);
    }

    if (i < eligibleClients.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return { sent, failed };
}

const DEFAULT_TEST_PHONE = "+15149841671";

export function getTestPhoneNumber(override) {
  return override?.trim() || process.env.SMS_TEST_PHONE_NUMBER?.trim() || DEFAULT_TEST_PHONE;
}

export async function sendTestReminderSms({ messageBody, daysSince, phone }) {
  const { client: twilioClient, from } = getTwilioClient();
  const to = getTestPhoneNumber(phone);
  const days = daysSince ?? 30;
  const lastDetailDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const body = buildMaintenanceReminderMessage({
    messageBody,
    clientName: "Test Client",
    smsLogId: "00000000-0000-0000-0000-000000000000",
    serviceType: "Interior + Exterior",
    lastDetailDate,
    daysSince: days,
  });

  try {
    await twilioClient.messages.create({ body, from, to });
    return { ok: true, to, body };
  } catch (error) {
    return { ok: false, to, reason: getTwilioErrorMessage(error) };
  }
}
