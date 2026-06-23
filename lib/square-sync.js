import { SquareError } from "square";
import { syncSquareAppointments } from "./appointment-sync.js";
import { getSupabase } from "./supabase.js";
import { createSquareClient } from "./square-bookings.js";

function formatCustomerName(customer) {
  const parts = [customer.givenName, customer.familyName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return customer.companyName ?? null;
}

export function getCustomerCity(customer) {
  const fromPrimary = customer.address?.locality?.trim();
  if (fromPrimary) return fromPrimary;

  for (const address of customer.addresses ?? []) {
    const city = address?.locality?.trim();
    if (city) return city;
  }

  return null;
}

const PAGE_LIMIT = 100;

async function fetchAllCustomers(squareClient) {
  const customers = [];
  const pager = await squareClient.customers.list({
    limit: PAGE_LIMIT,
    sortField: "DEFAULT",
    sortOrder: "ASC",
  });

  for await (const customer of pager) {
    customers.push(customer);
  }

  return customers;
}

async function upsertClient(supabase, customer) {
  const { data, error } = await supabase
    .from("clients")
    .upsert(
      {
        square_customer_id: customer.id,
        phone: customer.phoneNumber ?? null,
        name: formatCustomerName(customer),
        email: customer.emailAddress ?? null,
        city: getCustomerCity(customer),
      },
      { onConflict: "square_customer_id" },
    )
    .select("id, square_customer_id, city")
    .single();

  if (error) throw error;
  return data;
}

/**
 * Pull customers (with city) and sync all Square appointments.
 * @param {{ customersOnly?: boolean, recentBookingsOnly?: boolean, appointmentSyncMode?: 'hourly' | 'full' }} options
 */
export async function runSquareSync({
  customersOnly = false,
  recentBookingsOnly = false,
  appointmentSyncMode,
} = {}) {
  const squareClient = createSquareClient();
  const supabase = getSupabase();
  const syncMode = appointmentSyncMode ?? (recentBookingsOnly ? "hourly" : "full");

  const stats = {
    customersFetched: 0,
    clientsProcessed: 0,
    clientsWithCity: 0,
    clientErrors: 0,
  };

  console.log("[square-sync] Fetching customers...");
  const customers = await fetchAllCustomers(squareClient);
  stats.customersFetched = customers.length;

  for (const customer of customers) {
    if (!customer.id) {
      stats.clientErrors += 1;
      continue;
    }

    try {
      const row = await upsertClient(supabase, customer);
      stats.clientsProcessed += 1;
      if (row.city) stats.clientsWithCity += 1;
    } catch (error) {
      stats.clientErrors += 1;
      console.error(
        `[square-sync] Client error (${customer.id}):`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (customersOnly) {
    console.log("[square-sync] Customers-only sync complete.", stats);
    return stats;
  }

  console.log(`[square-sync] Syncing appointments (${syncMode})...`);
  const appointmentStats = await syncSquareAppointments(supabase, { mode: syncMode });
  Object.assign(stats, appointmentStats);

  const { runMatchConversions } = await import("./conversions.js");
  stats.conversions = await runMatchConversions(supabase);

  console.log("[square-sync] Sync complete.", stats);
  return stats;
}

export { syncSquareAppointments } from "./appointment-sync.js";
export { SquareError };
