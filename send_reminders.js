import "dotenv/config";
import twilio from "twilio";
import { buildMaintenanceReminderMessage } from "./message-templates.js";
import {
  createSupabaseClient,
  getEligibleClients,
  getReminderSchedule,
} from "./eligibility.js";

// When true, all SMS go to TEST_PHONE_NUMBER instead of each client's phone.
// Set to false when you are ready to text real clients.
const TEST_MODE = true;
const TEST_PHONE_NUMBER = "+15149841671"; // Replace with your phone number

const SEND_DELAY_MS = 300;

const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
];

function requireEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTwilioErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return String(error);
}

function getSendToNumber(client) {
  if (TEST_MODE) {
    return TEST_PHONE_NUMBER;
  }
  return client.phone;
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

  if (error) {
    throw error;
  }

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

  if (error) {
    throw error;
  }
}

async function markSmsLogFailed(supabase, smsLogId, errorMessage) {
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

async function sendMaintenanceReminder(twilioClient, toNumber, clientName, smsLogId) {
  const body = buildMaintenanceReminderMessage(clientName, smsLogId);

  return twilioClient.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: toNumber,
  });
}

async function main() {
  requireEnv();

  if (TEST_MODE && (!TEST_PHONE_NUMBER || TEST_PHONE_NUMBER === "+10000000000")) {
    throw new Error(
      "TEST_MODE is enabled. Set TEST_PHONE_NUMBER in send_reminders.js to your phone number before running.",
    );
  }

  const supabase = createSupabaseClient();
  const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );

  const schedule = await getReminderSchedule(supabase);

  console.log("Sending maintenance reminder SMS...");
  console.log(
    `Reminder schedule: ${schedule.map((step) => `step ${step.sequence_number} = ${step.days_since_last_detail} days`).join(", ") || "(none active)"}`,
  );
  console.log(`TEST_MODE: ${TEST_MODE}${TEST_MODE ? ` (sending to ${TEST_PHONE_NUMBER})` : ""}\n`);

  const eligible = await getEligibleClients(supabase);
  console.log(`Found ${eligible.length} eligible client(s).\n`);

  let sentCount = 0;
  let failedCount = 0;
  const failedClients = [];

  for (let i = 0; i < eligible.length; i += 1) {
    const client = eligible[i];
    const toNumber = getSendToNumber(client);

    if (!toNumber) {
      failedCount += 1;
      failedClients.push({
        name: client.name,
        reason: "missing phone number",
      });
      console.error(`Failed for ${client.name}: missing phone number`);
      continue;
    }

    let smsLogId;

    try {
      smsLogId = await insertPendingSmsLog(
        supabase,
        client.clientId,
        client.sequenceNumber,
      );
    } catch (error) {
      failedCount += 1;
      const reason = getTwilioErrorMessage(error);
      failedClients.push({ name: client.name, reason });
      console.error(`Failed for ${client.name}: could not create sms_log row (${reason})`);
      continue;
    }

    try {
      await sendMaintenanceReminder(twilioClient, toNumber, client.name, smsLogId);
      await markSmsLogSent(supabase, smsLogId);
      sentCount += 1;
      console.log(
        `Sent to ${TEST_MODE ? `${client.name} (test -> ${toNumber})` : `${client.name} (${toNumber})`}`,
      );
    } catch (error) {
      const reason = getTwilioErrorMessage(error);
      failedCount += 1;
      failedClients.push({ name: client.name, reason });

      try {
        await markSmsLogFailed(supabase, smsLogId, reason);
      } catch (updateError) {
        console.error(
          `Failed for ${client.name}: SMS failed (${reason}), and sms_log update also failed (${getTwilioErrorMessage(updateError)})`,
        );
        continue;
      }

      console.error(`Failed for ${client.name}: ${reason}`);
    }

    if (i < eligible.length - 1) {
      await sleep(SEND_DELAY_MS);
    }
  }

  console.log("\nSummary");
  console.log(`Total eligible: ${eligible.length}`);
  console.log(`Sent successfully: ${sentCount}`);
  console.log(`Failed: ${failedCount}`);

  if (failedClients.length > 0) {
    console.log("\nFailed clients:");
    for (const failed of failedClients) {
      console.log(`- ${failed.name}: ${failed.reason}`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
