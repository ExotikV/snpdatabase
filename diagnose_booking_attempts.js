import "dotenv/config";
import { createSupabaseClient } from "./eligibility.js";

const REQUIRED_COLUMNS = [
  "id",
  "ref",
  "source",
  "square_customer_id",
  "phone",
  "booked_at",
  "processed",
  "raw_note",
];

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
    return JSON.stringify(error);
  }
  return String(error);
}

function getProjectRef(url) {
  const match = url?.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? "(unknown)";
}

async function probeColumn(supabase, column) {
  const { error } = await supabase
    .from("booking_attempts")
    .select(column)
    .limit(0);

  return error ? null : column;
}

async function main() {
  requireEnv();

  const supabase = createSupabaseClient();
  const projectRef = getProjectRef(process.env.SUPABASE_URL);

  console.log("=== booking_attempts diagnostics ===\n");
  console.log(`Supabase project: ${projectRef}`);
  console.log("Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n");

  const { count: totalCount, error: countError } = await supabase
    .from("booking_attempts")
    .select("*", { count: "exact", head: true });

  if (countError) {
    console.error(`Cannot read booking_attempts: ${formatError(countError)}`);
    console.log("\nIf the table does not exist, run schema_booking_attempts.sql first.");
    process.exit(1);
  }

  const presentColumns = [];
  const missingColumns = [];

  for (const column of REQUIRED_COLUMNS) {
    const present = await probeColumn(supabase, column);
    if (present) {
      presentColumns.push(column);
    } else {
      missingColumns.push(column);
    }
  }

  console.log(`Table exists. Total rows: ${totalCount ?? 0}`);
  console.log(`Columns present: ${presentColumns.join(", ") || "(none)"}`);

  if (missingColumns.length > 0) {
    console.log(`Columns MISSING: ${missingColumns.join(", ")}`);
    console.log("\nBLOCKER: Run schema_booking_attempts_fix.sql in the Supabase SQL editor.");
    console.log("Until source exists, match_conversions.js and website INSERTs will fail.");
  }

  if (!missingColumns.includes("source") && !missingColumns.includes("processed")) {
    const { count: unprocessedCount } = await supabase
      .from("booking_attempts")
      .select("*", { count: "exact", head: true })
      .eq("processed", false);

    console.log(`Unprocessed rows: ${unprocessedCount ?? 0}`);

    for (const source of ["sms_reminder", "qr_code", "direct"]) {
      const { count } = await supabase
        .from("booking_attempts")
        .select("*", { count: "exact", head: true })
        .eq("source", source);
      console.log(`  source = ${source}: ${count ?? 0}`);
    }

    const { data: recent, error: recentError } = await supabase
      .from("booking_attempts")
      .select("id, source, ref, phone, square_customer_id, booked_at, processed, raw_note")
      .order("booked_at", { ascending: false })
      .limit(10);

    if (recentError) {
      console.error(`Recent rows query failed: ${formatError(recentError)}`);
    } else if (!recent?.length) {
      console.log("\nNo booking_attempts rows yet.");
      console.log("If snpdetailing.ca bookings are completing, the website Netlify function");
      console.log("is likely failing INSERT (check function logs) or using a different Supabase project.");
    } else {
      console.log("\nMost recent rows:");
      for (const row of recent) {
        console.log(
          `  ${row.booked_at} | ${row.source} | processed=${row.processed} | ref=${row.ref ?? "null"} | phone=${row.phone ?? "null"}`,
        );
      }
    }
  }

  console.log("\nManual matcher test: npm run match-conversions");
}

main().catch((error) => {
  console.error(`Fatal error: ${formatError(error)}`);
  process.exit(1);
});
