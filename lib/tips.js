import { BUSINESS_TIMEZONE, getTorontoDateParts, torontoCalendarToInstant } from "./dates.js";

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

export const TIP_PERIOD_OPTIONS = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "last_30_days", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
  { id: "all", label: "All time" },
  ...MONTH_NAMES.map((label, index) => ({
    id: `month_${index + 1}`,
    label,
  })),
];

let tipsTableChecked = false;
let tipsTableExists = false;
let tipsTableProbeMessage = null;

function isMissingTipsTableError(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /could not find the table/i.test(message) ||
    /schema cache/i.test(message) ||
    /relation "tips" does not exist/i.test(message)
  );
}

export async function probeTipsTable(supabase) {
  const { error } = await supabase.from("tips").select("id").limit(1);
  if (!error) {
    return { ready: true, message: null };
  }

  return {
    ready: false,
    missing: isMissingTipsTableError(error),
    message: error.message ?? "Tips table is not available",
    code: error.code ?? null,
  };
}

export async function hasTipsTable(supabase) {
  const probe = await probeTipsTable(supabase);
  tipsTableChecked = true;
  tipsTableExists = probe.ready;
  tipsTableProbeMessage = probe.ready ? null : probe.message;
  return probe.ready;
}

export function getTipsTableProbeMessage() {
  return tipsTableProbeMessage;
}

async function loadDetailsByIds(supabase, detailIds) {
  const uniqueIds = [...new Set(detailIds.filter(Boolean))];
  const byId = new Map();
  if (!uniqueIds.length) return byId;

  const chunkSize = 200;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("details_completed")
      .select("id, completed_at, service_type, square_booking_id")
      .in("id", chunk);

    if (error) throw error;
    for (const row of data ?? []) {
      byId.set(row.id, row);
    }
  }

  return byId;
}

function torontoMidnight({ year, month, day }) {
  return torontoCalendarToInstant({ year, month, day }, 0, 0);
}

function addTorontoDays(parts, days) {
  const anchor = torontoCalendarToInstant(parts, 12);
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return getTorontoDateParts(anchor);
}

function getMondayOfWeek(parts) {
  const anchor = torontoCalendarToInstant(parts, 12);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    weekday: "short",
  }).format(anchor);

  const offsets = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const offset = offsets[weekday] ?? 0;
  return addTorontoDays(parts, -offset);
}

function dayRangeFromParts(startParts, endPartsExclusive) {
  const start = torontoMidnight(startParts).toISOString();
  const end = torontoMidnight(endPartsExclusive).toISOString();
  return { start, end };
}

function monthRange(year, month) {
  const startParts = { year, month, day: 1 };
  const nextMonth = month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
  return dayRangeFromParts(startParts, nextMonth);
}

export function resolveTipPeriodBounds(period, now = new Date()) {
  const today = getTorontoDateParts(now);
  if (!today) {
    return { period: "all", label: "All time", start: null, end: null };
  }

  if (period === "all") {
    return { period: "all", label: "All time", start: null, end: null };
  }

  if (period === "today") {
    const tomorrow = addTorontoDays(today, 1);
    const range = dayRangeFromParts(today, tomorrow);
    return { period, label: "Today", ...range };
  }

  if (period === "this_week") {
    const monday = getMondayOfWeek(today);
    const nextMonday = addTorontoDays(monday, 7);
    const range = dayRangeFromParts(monday, nextMonday);
    return { period, label: "This week", ...range };
  }

  if (period === "last_week") {
    const thisMonday = getMondayOfWeek(today);
    const lastMonday = addTorontoDays(thisMonday, -7);
    const range = dayRangeFromParts(lastMonday, thisMonday);
    return { period, label: "Last week", ...range };
  }

  if (period === "last_30_days") {
    const startParts = addTorontoDays(today, -29);
    const tomorrow = addTorontoDays(today, 1);
    const range = dayRangeFromParts(startParts, tomorrow);
    return { period, label: "Last 30 days", ...range };
  }

  if (period === "this_month") {
    const range = monthRange(today.year, today.month);
    return { period, label: "This month", ...range };
  }

  const monthMatch = /^month_(\d{1,2})$/.exec(period ?? "");
  if (monthMatch) {
    const month = Number(monthMatch[1]);
    if (month >= 1 && month <= 12) {
      const range = monthRange(today.year, month);
      return { period, label: MONTH_NAMES[month - 1], ...range };
    }
  }

  const yearMatch = /^year_(\d{4})$/.exec(period ?? "");
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    const startParts = { year, month: 1, day: 1 };
    const endParts = { year: year + 1, month: 1, day: 1 };
    const range = dayRangeFromParts(startParts, endParts);
    return { period, label: String(year), ...range };
  }

  return resolveTipPeriodBounds("this_month", now);
}

function applyPeriodFilter(query, bounds) {
  if (!bounds.start || !bounds.end) return query;
  return query.gte("tipped_at", bounds.start).lt("tipped_at", bounds.end);
}

async function fetchAllTips(supabase, bounds) {
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("tips")
      .select(
        "id, client_id, detail_id, square_booking_id, amount_cents, tipped_at, notes, created_at, clients(name, phone)",
      )
      .order("tipped_at", { ascending: false })
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

async function enrichTipRows(supabase, rows) {
  const detailsById = await loadDetailsByIds(
    supabase,
    rows.map((row) => row.detail_id),
  );

  return rows.map((row) => mapTipRow(row, detailsById.get(row.detail_id ?? "") ?? null));
}

function mapTipRow(row, detail = null) {
  const resolvedDetail = detail ?? row.details_completed ?? null;
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.clients?.name ?? null,
    clientPhone: row.clients?.phone ?? null,
    detailId: row.detail_id ?? null,
    amountCents: row.amount_cents,
    tippedAt: row.tipped_at,
    notes: row.notes ?? null,
    jobCompletedAt: resolvedDetail?.completed_at ?? null,
    jobServiceType: resolvedDetail?.service_type ?? null,
    squareBookingId: row.square_booking_id ?? resolvedDetail?.square_booking_id ?? null,
    createdAt: row.created_at,
  };
}

function summarizeTips(rows) {
  const totalCents = rows.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  const tipCount = rows.length;
  const averageCents = tipCount > 0 ? Math.round(totalCents / tipCount) : 0;
  return { totalCents, tipCount, averageCents };
}

async function fetchTipsForYearByMonth(supabase, year) {
  const start = torontoMidnight({ year, month: 1, day: 1 }).toISOString();
  const endExclusive = torontoMidnight({ year: year + 1, month: 1, day: 1 }).toISOString();

  const { data, error } = await supabase
    .from("tips")
    .select("amount_cents, tipped_at")
    .gte("tipped_at", start)
    .lt("tipped_at", endExclusive);

  if (error) throw error;

  const buckets = MONTH_NAMES.map((label, index) => ({
    month: index + 1,
    label,
    totalCents: 0,
    tipCount: 0,
  }));

  for (const row of data ?? []) {
    const parts = getTorontoDateParts(row.tipped_at);
    if (!parts || parts.year !== year) continue;
    const bucket = buckets[parts.month - 1];
    bucket.totalCents += row.amount_cents ?? 0;
    bucket.tipCount += 1;
  }

  return buckets;
}

export async function getTodayJobsForTips(supabase, now = new Date()) {
  const today = getTorontoDateParts(now);
  if (!today) return [];

  const tomorrow = addTorontoDays(today, 1);
  const { start, end } = dayRangeFromParts(today, tomorrow);

  const { data: completed, error: completedError } = await supabase
    .from("details_completed")
    .select("id, client_id, completed_at, service_type, square_booking_id, clients(id, name, phone, city)")
    .gte("completed_at", start)
    .lt("completed_at", end)
    .order("completed_at", { ascending: false });

  if (completedError) throw completedError;

  const jobs = [];

  for (const row of completed ?? []) {
    jobs.push({
      detailId: row.id,
      clientId: row.client_id,
      clientName: row.clients?.name ?? "(no name)",
      clientPhone: row.clients?.phone ?? null,
      clientCity: row.clients?.city ?? null,
      completedAt: row.completed_at,
      serviceType: row.service_type ?? null,
      squareBookingId: row.square_booking_id ?? null,
      source: "completed",
    });
  }

  const { data: appointments, error: appointmentsError } = await supabase
    .from("square_appointments")
    .select("square_booking_id, client_id, start_at, end_at, service_type, clients(id, name, phone, city)")
    .gte("start_at", start)
    .lt("start_at", end)
    .order("start_at", { ascending: false });

  if (!appointmentsError) {
    const seenBookingIds = new Set(jobs.map((job) => job.squareBookingId).filter(Boolean));

    for (const row of appointments ?? []) {
      if (row.square_booking_id && seenBookingIds.has(row.square_booking_id)) continue;
      if (!row.client_id) continue;

      jobs.push({
        detailId: null,
        clientId: row.client_id,
        clientName: row.clients?.name ?? "(no name)",
        clientPhone: row.clients?.phone ?? null,
        clientCity: row.clients?.city ?? null,
        completedAt: row.end_at ?? row.start_at,
        serviceType: row.service_type ?? null,
        squareBookingId: row.square_booking_id ?? null,
        source: "appointment",
      });
    }
  }

  jobs.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  return jobs;
}

export async function getTipsDashboard(supabase, { period = "this_month", year } = {}) {
  const probe = await probeTipsTable(supabase);
  if (!probe.ready) {
    return {
      migrationRequired: probe.missing !== false,
      setupError: probe.message,
      period,
      periodLabel: "Tips",
      stats: { totalCents: 0, tipCount: 0, averageCents: 0 },
      monthlyBreakdown: [],
      tips: [],
      todayJobs: [],
      availablePeriods: TIP_PERIOD_OPTIONS,
      year: getTorontoDateParts(new Date())?.year ?? new Date().getFullYear(),
    };
  }

  const bounds = resolveTipPeriodBounds(period);
  const rows = await fetchAllTips(supabase, bounds);
  const tips = await enrichTipRows(supabase, rows);
  const stats = summarizeTips(tips);
  const currentYear = year ?? getTorontoDateParts(new Date())?.year ?? new Date().getFullYear();
  const monthlyBreakdown = await fetchTipsForYearByMonth(supabase, currentYear);
  const todayJobs = await getTodayJobsForTips(supabase);

  return {
    migrationRequired: false,
    period: bounds.period,
    periodLabel: bounds.label,
    stats,
    monthlyBreakdown,
    tips,
    todayJobs,
    availablePeriods: TIP_PERIOD_OPTIONS,
    year: currentYear,
  };
}

export async function createTip(supabase, payload) {
  const probe = await probeTipsTable(supabase);
  if (!probe.ready) {
    if (probe.missing !== false) {
      throw new Error("Run schema/tips.sql in Supabase SQL Editor before logging tips.");
    }
    throw new Error(probe.message ?? "Tips table is not available yet.");
  }

  const clientId = String(payload.clientId ?? "").trim();
  if (!clientId) throw new Error("clientId is required");

  const amountCents = Number(payload.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Tip amount must be greater than zero");
  }

  const detailId = payload.detailId ? String(payload.detailId).trim() : null;
  const squareBookingId = payload.squareBookingId
    ? String(payload.squareBookingId).trim()
    : null;
  const notes = payload.notes ? String(payload.notes).trim() : null;
  const tippedAt = payload.tippedAt ? new Date(payload.tippedAt) : new Date();
  if (Number.isNaN(tippedAt.getTime())) {
    throw new Error("Invalid tippedAt date");
  }

  let linkedSquareBookingId = squareBookingId;

  if (detailId) {
    const { data: detail, error: detailError } = await supabase
      .from("details_completed")
      .select("id, client_id, square_booking_id")
      .eq("id", detailId)
      .maybeSingle();

    if (detailError) throw detailError;
    if (!detail) throw new Error("Linked job not found");
    if (detail.client_id !== clientId) {
      throw new Error("Selected job does not belong to this client");
    }
    linkedSquareBookingId = detail.square_booking_id ?? linkedSquareBookingId;
  }

  const { data, error } = await supabase
    .from("tips")
    .insert({
      client_id: clientId,
      detail_id: detailId,
      square_booking_id: linkedSquareBookingId,
      amount_cents: Math.round(amountCents),
      tipped_at: tippedAt.toISOString(),
      notes: notes || null,
    })
    .select(
      "id, client_id, detail_id, square_booking_id, amount_cents, tipped_at, notes, created_at, clients(name, phone)",
    )
    .single();

  if (error) throw error;

  const detailsById = detailId
    ? await loadDetailsByIds(supabase, [detailId])
    : new Map();
  return mapTipRow(data, detailsById.get(detailId) ?? null);
}

export async function loadRecentDetailsForClient(supabase, clientId, limit = 10) {
  const { data, error } = await supabase
    .from("details_completed")
    .select("id, completed_at, service_type, square_booking_id")
    .eq("client_id", clientId)
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    detailId: row.id,
    completedAt: row.completed_at,
    serviceType: row.service_type ?? null,
    squareBookingId: row.square_booking_id ?? null,
  }));
}
