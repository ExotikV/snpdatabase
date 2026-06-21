import "dotenv/config";
import {
  createSupabaseClient,
  formatDetailDate,
  getEligibleClients,
  getReminderSchedule,
} from "./eligibility.js";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function requireEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

async function main() {
  requireEnv();

  const supabase = createSupabaseClient();

  const schedule = await getReminderSchedule(supabase);

  console.log("Checking maintenance reminder eligibility...");
  console.log(
    `Reminder schedule: ${schedule.map((step) => `step ${step.sequence_number} = ${step.days_since_last_detail} days`).join(", ") || "(none active)"}\n`,
  );

  const eligible = await getEligibleClients(supabase);

  if (eligible.length === 0) {
    console.log("No eligible clients found.");
  } else {
    console.log("Eligible clients:\n");
    for (const client of eligible) {
      console.log(
        `${client.name} | ${client.phone ?? "(no phone)"} | last detail: ${formatDetailDate(client.lastDetailDate)} | ${client.daysSince} days since last detail | due for step ${client.sequenceNumber} (${client.daysSinceLastDetail} days)`,
      );
    }
  }

  console.log(`\n${eligible.length} clients eligible for maintenance reminder`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
