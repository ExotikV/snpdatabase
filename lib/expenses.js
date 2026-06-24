import { toDateInputValue } from "./dates.js";
import { resolveTipPeriodBounds, TIP_PERIOD_OPTIONS } from "./tips.js";

const PAGE_SIZE = 1000;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export { TIP_PERIOD_OPTIONS as EXPENSE_PERIOD_OPTIONS };

function isMissingTableError(error, tableName) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    new RegExp(`relation "${tableName}" does not exist`, "i").test(message)
  );
}

export async function probeExpensesTables(supabase) {
  for (const table of ["expense_stores", "expenses"]) {
    const { error } = await supabase.from(table).select("id").limit(1);
    if (error) {
      return {
        ready: false,
        missing: isMissingTableError(error, table),
        message: error.message ?? `${table} is not available`,
        code: error.code ?? null,
      };
    }
  }

  return { ready: true, message: null };
}

function getDateRangeFromBounds(bounds) {
  if (!bounds.start || !bounds.end) return null;
  return {
    startYmd: toDateInputValue(bounds.start),
    endExclusiveYmd: toDateInputValue(bounds.end),
  };
}

function applyPeriodFilter(query, bounds) {
  const range = getDateRangeFromBounds(bounds);
  if (!range?.startYmd || !range.endExclusiveYmd) return query;
  return query.gte("expense_date", range.startYmd).lt("expense_date", range.endExclusiveYmd);
}

async function fetchAllStores(supabase) {
  const { data, error } = await supabase
    .from("expense_stores")
    .select("id, name, created_at")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function fetchAllExpenses(supabase, bounds) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("expenses")
      .select(
        "id, store_id, description, amount_cents, expense_date, created_at, expense_stores(name)",
      )
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    query = applyPeriodFilter(query, bounds);

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function mapStoreRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

function mapExpenseRow(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.expense_stores?.name ?? null,
    description: row.description,
    amountCents: row.amount_cents,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
  };
}

function summarizeExpenses(rows) {
  const totalCents = rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  const expenseCount = rows.length;
  const averageCents = expenseCount > 0 ? Math.round(totalCents / expenseCount) : 0;
  return { totalCents, expenseCount, averageCents };
}

async function fetchExpensesForYearByMonth(supabase, year) {
  const { data, error } = await supabase
    .from("expenses")
    .select("amount_cents, expense_date")
    .gte("expense_date", `${year}-01-01`)
    .lt("expense_date", `${year + 1}-01-01`);

  if (error) throw error;

  const buckets = MONTH_NAMES.map((label, index) => ({
    month: index + 1,
    label,
    totalCents: 0,
    expenseCount: 0,
  }));

  for (const row of data ?? []) {
    const month = Number(String(row.expense_date).slice(5, 7));
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    const bucket = buckets[month - 1];
    bucket.totalCents += row.amount_cents ?? 0;
    bucket.expenseCount += 1;
  }

  return buckets;
}

export async function getExpensesDashboard(supabase, { period = "this_month", year } = {}) {
  const probe = await probeExpensesTables(supabase);
  if (!probe.ready) {
    return {
      migrationRequired: probe.missing !== false,
      setupError: probe.message,
      period,
      periodLabel: "Expenses",
      stats: { totalCents: 0, expenseCount: 0, averageCents: 0 },
      monthlyBreakdown: [],
      expenses: [],
      stores: [],
      availablePeriods: TIP_PERIOD_OPTIONS,
      year: new Date().getFullYear(),
    };
  }

  const bounds = resolveTipPeriodBounds(period);
  const [stores, expenseRows] = await Promise.all([
    fetchAllStores(supabase),
    fetchAllExpenses(supabase, bounds),
  ]);
  const expenses = expenseRows.map(mapExpenseRow);
  const stats = summarizeExpenses(expenses);
  const currentYear = year ?? new Date().getFullYear();
  const monthlyBreakdown = await fetchExpensesForYearByMonth(supabase, currentYear);

  return {
    migrationRequired: false,
    setupError: null,
    period: bounds.period,
    periodLabel: bounds.label,
    stats,
    monthlyBreakdown,
    expenses,
    stores: stores.map(mapStoreRow),
    availablePeriods: TIP_PERIOD_OPTIONS,
    year: currentYear,
  };
}

function normalizeStoreName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

function normalizeExpenseDate(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("Expense date must be YYYY-MM-DD");
  }
  return raw;
}

export async function createExpenseStore(supabase, payload) {
  const probe = await probeExpensesTables(supabase);
  if (!probe.ready) {
    if (probe.missing !== false) {
      throw new Error("Run schema/expenses.sql in Supabase SQL Editor before adding stores.");
    }
    throw new Error(probe.message ?? "Expense tables are not available yet.");
  }

  const name = normalizeStoreName(payload.name);
  if (!name) throw new Error("Store name is required");

  const { data: existing, error: existingError } = await supabase
    .from("expense_stores")
    .select("id, name, created_at")
    .ilike("name", name)
    .limit(1);

  if (existingError) throw existingError;
  if (existing?.length) {
    return mapStoreRow(existing[0]);
  }

  const { data, error } = await supabase
    .from("expense_stores")
    .insert({ name })
    .select("id, name, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("A store with that name already exists");
    }
    throw error;
  }

  return mapStoreRow(data);
}

export async function createExpense(supabase, payload) {
  const probe = await probeExpensesTables(supabase);
  if (!probe.ready) {
    if (probe.missing !== false) {
      throw new Error("Run schema/expenses.sql in Supabase SQL Editor before logging expenses.");
    }
    throw new Error(probe.message ?? "Expense tables are not available yet.");
  }

  const storeId = String(payload.storeId ?? "").trim();
  if (!storeId) throw new Error("Store is required");

  const description = String(payload.description ?? "").trim();
  if (!description) throw new Error("Description is required");

  const amountCents = Number(payload.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const expenseDate = normalizeExpenseDate(payload.expenseDate);

  const { data: store, error: storeError } = await supabase
    .from("expense_stores")
    .select("id")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) throw storeError;
  if (!store) throw new Error("Selected store not found");

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      store_id: storeId,
      description,
      amount_cents: Math.round(amountCents),
      expense_date: expenseDate,
    })
    .select(
      "id, store_id, description, amount_cents, expense_date, created_at, expense_stores(name)",
    )
    .single();

  if (error) throw error;
  return mapExpenseRow(data);
}
