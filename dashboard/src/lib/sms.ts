import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";

const SEND_DELAY_MS = 300;

export type SendResult = {
  name: string;
  success: boolean;
  reason?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTwilioErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid?.trim() || !authToken?.trim() || !fromNumber?.trim()) {
    throw new Error("Twilio environment variables are not configured");
  }

  return {
    client: twilio(accountSid, authToken),
    fromNumber,
  };
}

async function insertPendingSmsLog(
  supabase: SupabaseClient,
  clientId: string,
  triggerType: string,
  sequenceNumber?: number,
) {
  const payload: Record<string, unknown> = {
    client_id: clientId,
    trigger_type: triggerType,
    status: "pending",
  };

  if (sequenceNumber != null) {
    payload.sequence_number = sequenceNumber;
  }

  const { data, error } = await supabase
    .from("sms_log")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

async function markSmsLogSent(supabase: SupabaseClient, smsLogId: string) {
  const { error } = await supabase
    .from("sms_log")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", smsLogId);

  if (error) {
    throw error;
  }
}

async function markSmsLogFailed(
  supabase: SupabaseClient,
  smsLogId: string,
  errorMessage: string,
) {
  const { error } = await supabase
    .from("sms_log")
    .update({
      status: "failed",
      error_message: errorMessage,
    })
    .eq("id", smsLogId);

  if (error) {
    throw error;
  }
}

async function sendSms(toNumber: string, body: string) {
  const { client, fromNumber } = getTwilioClient();
  return client.messages.create({
    body,
    from: fromNumber,
    to: toNumber,
  });
}

export async function sendMaintenanceReminders(
  supabase: SupabaseClient,
  clients: {
    clientId: string;
    name: string;
    phone: string | null;
    sequenceNumber: number;
    messageBody: string;
    lastServiceType: string | null;
    lastDetailDate: Date;
    daysSince: number;
  }[],
): Promise<{ sent: SendResult[]; failed: SendResult[] }> {
  const { buildMaintenanceReminderMessage } = await import("./message-templates");
  const sent: SendResult[] = [];
  const failed: SendResult[] = [];

  for (let i = 0; i < clients.length; i += 1) {
    const client = clients[i];

    if (!client.phone) {
      failed.push({ name: client.name, success: false, reason: "missing phone number" });
      continue;
    }

    let smsLogId: string;

    try {
      smsLogId = await insertPendingSmsLog(
        supabase,
        client.clientId,
        "maintenance_reminder",
        client.sequenceNumber,
      );
    } catch (error) {
      failed.push({
        name: client.name,
        success: false,
        reason: getTwilioErrorMessage(error),
      });
      continue;
    }

    try {
      const body = buildMaintenanceReminderMessage({
        messageBody: client.messageBody,
        clientName: client.name,
        smsLogId,
        serviceType: client.lastServiceType,
        lastDetailDate: client.lastDetailDate,
        daysSince: client.daysSince,
        sequenceNumber: client.sequenceNumber,
      });
      await sendSms(client.phone, body);
      await markSmsLogSent(supabase, smsLogId);
      sent.push({ name: client.name, success: true });
    } catch (error) {
      const reason = getTwilioErrorMessage(error);
      failed.push({ name: client.name, success: false, reason });
      try {
        await markSmsLogFailed(supabase, smsLogId, reason);
      } catch {
        // Best effort update only.
      }
    }

    if (i < clients.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return { sent, failed };
}

export async function sendBulkManualMessages(
  supabase: SupabaseClient,
  clients: { clientId: string; name: string; phone: string | null }[],
  message: string,
): Promise<{ sent: SendResult[]; failed: SendResult[] }> {
  const sent: SendResult[] = [];
  const failed: SendResult[] = [];
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    throw new Error("Message cannot be empty");
  }

  for (let i = 0; i < clients.length; i += 1) {
    const client = clients[i];

    if (!client.phone) {
      failed.push({ name: client.name, success: false, reason: "missing phone number" });
      continue;
    }

    let smsLogId: string;

    try {
      smsLogId = await insertPendingSmsLog(supabase, client.clientId, "bulk_manual");
    } catch (error) {
      failed.push({
        name: client.name,
        success: false,
        reason: getTwilioErrorMessage(error),
      });
      continue;
    }

    try {
      await sendSms(client.phone, trimmedMessage);
      await markSmsLogSent(supabase, smsLogId);
      sent.push({ name: client.name, success: true });
    } catch (error) {
      const reason = getTwilioErrorMessage(error);
      failed.push({ name: client.name, success: false, reason });
      try {
        await markSmsLogFailed(supabase, smsLogId, reason);
      } catch {
        // Best effort update only.
      }
    }

    if (i < clients.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return { sent, failed };
}
