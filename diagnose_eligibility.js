import "dotenv/config";
import {
  createSupabaseClient,
  getEligibleClients,
  getReminderSchedule,
} from "./eligibility.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(earlier, later) {
  return Math.floor((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

async function fetchCount(supabase, table, applyFilters) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (applyFilters) {
    query = applyFilters(query);
  }
  const { count, error } = await query;
  if (error) {
    throw error;
  }
  return count ?? 0;
}

async function fetchAll(supabase, table, select, applyFilters) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (applyFilters) {
      query = applyFilters(query);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    if (!data?.length) {
      break;
    }
    rows.push(...data);
    if (data.length < pageSize) {
      break;
    }
    from += pageSize;
  }

  return rows;
}

async function main() {
  const supabase = createSupabaseClient();
  const now = new Date();
  const sixtyDaysAgo = new Date(now.getTime() - 60 * MS_PER_DAY);

  const schedule = await getReminderSchedule(supabase);
  const step1Days = schedule.find((s) => s.sequence_number === 1)?.days_since_last_detail ?? 30;

  console.log("=== Eligibility funnel diagnostic ===\n");
  console.log(`Today: ${now.toISOString().slice(0, 10)}`);
  console.log(
    `Active reminder schedule: ${schedule.map((s) => `step ${s.sequence_number}=${s.days_since_last_detail}d`).join(", ") || "(none)"}`,
  );
  console.log(`Step 1 threshold: ${step1Days} days since last detail\n`);

  const totalClients = await fetchCount(supabase, "clients");
  const optedOutClients = await fetchCount(supabase, "clients", (q) => q.eq("opted_out", true));
  const totalDetails = await fetchCount(supabase, "details_completed");
  const detailsLast60 = await fetchCount(supabase, "details_completed", (q) =>
    q.gte("completed_at", sixtyDaysAgo.toISOString()),
  );

  const activeEnrollments = await fetchAll(
    supabase,
    "maintenance_enrollment",
    "client_id, active, clients(id, name, opted_out)",
    (q) => q.eq("active", true),
  );

  const enrolledClientIds = new Set();
  let enrolledOptedOut = 0;
  let enrolledMissingClient = 0;

  for (const row of activeEnrollments) {
    if (!row.clients) {
      enrolledMissingClient += 1;
      continue;
    }
    if (row.clients.opted_out) {
      enrolledOptedOut += 1;
      continue;
    }
    enrolledClientIds.add(row.client_id);
  }

  const allDetails = await fetchAll(supabase, "details_completed", "client_id, completed_at");
  const latestDetailByClient = new Map();

  for (const row of allDetails) {
    if (!row.completed_at) {
      continue;
    }
    const completedAt = new Date(row.completed_at);
    const existing = latestDetailByClient.get(row.client_id);
    if (!existing || completedAt > existing) {
      latestDetailByClient.set(row.client_id, completedAt);
    }
  }

  let clientsWithDetailLast60 = 0;
  for (const completedAt of latestDetailByClient.values()) {
    if (completedAt >= sixtyDaysAgo) {
      clientsWithDetailLast60 += 1;
    }
  }

  let enrolledWithDetail = 0;
  let enrolledWithDetailLast60 = 0;
  let enrolledPastStep1 = 0;
  let enrolledAlreadySentStep1ThisCycle = 0;

  const reminders = await fetchAll(
    supabase,
    "sms_log",
    "client_id, sequence_number, created_at, status, trigger_type",
    (q) => q.eq("trigger_type", "maintenance_reminder"),
  );

  for (const clientId of enrolledClientIds) {
    const lastDetail = latestDetailByClient.get(clientId);
    if (!lastDetail) {
      continue;
    }

    enrolledWithDetail += 1;

    if (lastDetail >= sixtyDaysAgo) {
      enrolledWithDetailLast60 += 1;
    }

    const daysSince = daysBetween(lastDetail, now);
    if (daysSince >= step1Days) {
      enrolledPastStep1 += 1;

      const cycleReminders = reminders.filter(
        (r) =>
          r.client_id === clientId &&
          r.sequence_number === 1 &&
          new Date(r.created_at) > lastDetail &&
          (r.status === "sent" || r.status === "pending"),
      );
      if (cycleReminders.length > 0) {
        enrolledAlreadySentStep1ThisCycle += 1;
      }
    }
  }

  const eligible = await getEligibleClients(supabase);

  console.log("--- Table counts ---");
  console.log(`clients (total):                    ${totalClients}`);
  console.log(`clients (opted_out = true):         ${optedOutClients}`);
  console.log(`details_completed (total rows):     ${totalDetails}`);
  console.log(`details_completed (last 60 days):   ${detailsLast60} rows`);
  console.log(`clients with any detail:            ${latestDetailByClient.size}`);
  console.log(`clients with detail in last 60d:    ${clientsWithDetailLast60}`);
  console.log(`maintenance_enrollment (active):    ${activeEnrollments.length}`);
  console.log(`  └ missing clients join:           ${enrolledMissingClient}`);
  console.log(`  └ enrolled but opted_out:         ${enrolledOptedOut}`);
  console.log(`  └ enrolled + not opted_out:       ${enrolledClientIds.size}`);

  console.log("\n--- Enrolled clients only ---");
  console.log(`enrolled with at least one detail:  ${enrolledWithDetail}`);
  console.log(`enrolled, detail within 60 days:    ${enrolledWithDetailLast60}`);
  console.log(`enrolled, past step 1 (${step1Days}+ days):     ${enrolledPastStep1}`);
  console.log(`enrolled, already got step 1 cycle: ${enrolledAlreadySentStep1ThisCycle}`);
  console.log(`eligible (getEligibleClients):      ${eligible.length}`);

  if (eligible.length > 0 && eligible.length <= 10) {
    console.log("\n--- Eligible clients ---");
    for (const c of eligible) {
      console.log(
        `  ${c.name} | step ${c.sequenceNumber} | ${c.daysSince}d since detail | last: ${c.lastDetailDate.toISOString().slice(0, 10)}`,
      );
    }
  }

  console.log("\n--- Likely bottleneck ---");
  if (enrolledClientIds.size <= 1) {
    console.log(
      "Only enrolled clients are eligible. You likely need more rows in maintenance_enrollment.",
    );
    console.log(
      "Having a detail in the last 60 days does NOT auto-enroll someone — enrollment is separate.",
    );
  } else if (enrolledPastStep1 <= enrolledAlreadySentStep1ThisCycle) {
    console.log(
      "Most enrolled clients either haven't hit the step 1 day threshold yet, or already received step 1 this cycle.",
    );
  }

  const stepBreakdown = new Map();
  for (const c of eligible) {
    stepBreakdown.set(c.sequenceNumber, (stepBreakdown.get(c.sequenceNumber) ?? 0) + 1);
  }
  if (stepBreakdown.size > 0) {
    console.log("\nEligible by step:");
    for (const [step, count] of [...stepBreakdown.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`  step ${step}: ${count}`);
    }
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
