import "dotenv/config";
import { createSupabaseClient } from "./eligibility.js";

const PAGE_SIZE = 1000;
const REQUIRED_COLUMNS = ["id", "ref", "source", "processed"];

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function requireEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    if ("message" in error) {
      return String(error.message);
    }
    if ("code" in error && "details" in error) {
      return `${error.code}: ${error.details ?? error.message ?? JSON.stringify(error)}`;
    }
    return JSON.stringify(error);
  }
  return String(error);
}

async function assertBookingAttemptsSchema(supabase) {
  for (const column of REQUIRED_COLUMNS) {
    const { error } = await supabase
      .from("booking_attempts")
      .select(column)
      .limit(0);

    if (error) {
      throw new Error(
        `booking_attempts is missing required column "${column}". Run schema_booking_attempts_fix.sql in Supabase. (${formatError(error)})`,
      );
    }
  }
}

async function fetchUnprocessedAttempts(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select("id, ref, source, square_customer_id, phone, booked_at, raw_note")
      .eq("processed", false)
      .order("booked_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

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

async function markAttemptProcessed(supabase, attemptId) {
  const { error } = await supabase
    .from("booking_attempts")
    .update({ processed: true })
    .eq("id", attemptId);

  if (error) {
    throw error;
  }
}

async function markSmsLogConverted(supabase, smsLogId) {
  const { data, error } = await supabase
    .from("sms_log")
    .update({ converted: true })
    .eq("id", smsLogId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data != null;
}

async function handleSmsReminderAttempt(supabase, attempt, stats) {
  if (!attempt.ref) {
    stats.smsReminderOrphaned += 1;
    console.warn(
      `Orphaned sms_reminder booking (missing ref): attempt ${attempt.id}`,
    );
    await markAttemptProcessed(supabase, attempt.id);
    stats.processed += 1;
    return;
  }

  const matched = await markSmsLogConverted(supabase, attempt.ref);

  if (matched) {
    stats.smsReminderConverted += 1;
    console.log(
      `Converted sms_log ${attempt.ref} from booking attempt ${attempt.id}`,
    );
  } else {
    stats.smsReminderOrphaned += 1;
    console.warn(
      `Orphaned sms_reminder ref ${attempt.ref} (no matching sms_log row): attempt ${attempt.id}`,
    );
  }

  await markAttemptProcessed(supabase, attempt.id);
  stats.processed += 1;
}

async function handleQrCodeAttempt(supabase, attempt, stats) {
  stats.qrCodeBookings += 1;
  console.log(
    `QR maintenance booking: attempt ${attempt.id}${attempt.phone ? ` (${attempt.phone})` : ""}${attempt.square_customer_id ? ` customer=${attempt.square_customer_id}` : ""}`,
  );
  await markAttemptProcessed(supabase, attempt.id);
  stats.processed += 1;
}

async function handleDirectAttempt(supabase, attempt, stats) {
  stats.directBookings += 1;
  console.log(
    `Direct booking (no program link): attempt ${attempt.id}${attempt.phone ? ` (${attempt.phone})` : ""}${attempt.square_customer_id ? ` customer=${attempt.square_customer_id}` : ""}`,
  );
  await markAttemptProcessed(supabase, attempt.id);
  stats.processed += 1;
}

function normalizeSource(source) {
  return typeof source === "string" ? source.trim().toLowerCase() : "";
}

export async function runMatchConversions() {
  requireEnv();

  const supabase = createSupabaseClient();

  console.log("Matching booking attempts to conversions...\n");

  await assertBookingAttemptsSchema(supabase);

  const attempts = await fetchUnprocessedAttempts(supabase);
  console.log(`Found ${attempts.length} unprocessed booking attempt(s).\n`);

  const stats = {
    processed: 0,
    smsReminderConverted: 0,
    smsReminderOrphaned: 0,
    qrCodeBookings: 0,
    directBookings: 0,
    errors: 0,
  };

  for (const attempt of attempts) {
    try {
      const source = normalizeSource(attempt.source);

      switch (source) {
        case "sms_reminder":
          await handleSmsReminderAttempt(supabase, attempt, stats);
          break;
        case "qr_code":
          await handleQrCodeAttempt(supabase, attempt, stats);
          break;
        case "direct":
          await handleDirectAttempt(supabase, attempt, stats);
          break;
        default:
          stats.errors += 1;
          console.warn(
            `Unknown source "${attempt.source}" on attempt ${attempt.id}; marking processed.`,
          );
          await markAttemptProcessed(supabase, attempt.id);
          stats.processed += 1;
          break;
      }
    } catch (error) {
      stats.errors += 1;
      console.error(`Error handling attempt ${attempt.id}: ${formatError(error)}`);
    }
  }

  console.log("\nSummary");
  console.log(`Total unprocessed at start: ${attempts.length}`);
  console.log(`Marked processed: ${stats.processed}`);
  console.log(`sms_reminder converted (sms_log matched): ${stats.smsReminderConverted}`);
  console.log(`sms_reminder orphaned ref: ${stats.smsReminderOrphaned}`);
  console.log(`qr_code bookings: ${stats.qrCodeBookings}`);
  console.log(`direct bookings: ${stats.directBookings}`);
  console.log(`Errors (left unprocessed): ${stats.errors}`);

  if (attempts.length === 0) {
    console.log("\nNo rows to process. Run: npm run diagnose-booking-attempts");
  }
}

import { fileURLToPath } from "node:url";
import path from "node:path";

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  runMatchConversions().catch((error) => {
    console.error(`Fatal error: ${formatError(error)}`);
    process.exit(1);
  });
}
