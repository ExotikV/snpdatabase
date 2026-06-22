import { TRIGGER_TO_BOOKING_SOURCE } from "./tracks.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

/** Short codes in SMS links — /r/{ref}/m|g|a or ?s=m|g|a */
export const BOOKING_SOURCE_SHORT_CODES = {
  sms_reminder: "m",
  general_reminder: "g",
  general_after_maintenance_reminder: "a",
};

/** Named keys used in SMS template variables ({booking_url_maintenance}, etc.). */
export const BOOKING_LINK_TRACK_KEYS = {
  maintenance: "sms_reminder",
  general: "general_reminder",
  after_maintenance: "general_after_maintenance_reminder",
};

const SHORT_CODE_TO_SOURCE = Object.fromEntries(
  Object.entries(BOOKING_SOURCE_SHORT_CODES).map(([source, code]) => [code, source]),
);

export function getBookingSourceCode(source) {
  return BOOKING_SOURCE_SHORT_CODES[source] ?? BOOKING_SOURCE_SHORT_CODES.sms_reminder;
}

export function getBookingSourceFromCode(code) {
  const normalized = String(code ?? "").trim().toLowerCase();
  return SHORT_CODE_TO_SOURCE[normalized] ?? "sms_reminder";
}

/**
 * Prefer sms_log.trigger_type (authoritative) over the URL short code.
 * Use when recording booking_attempts so /g legacy links still attribute correctly.
 */
export async function resolveBookingSource(supabase, { ref, sourceCode } = {}) {
  const fromCode = sourceCode ? getBookingSourceFromCode(sourceCode) : null;
  const smsLogId = await resolveSmsLogId(supabase, ref);
  if (!smsLogId) return fromCode ?? "sms_reminder";

  const { data, error } = await supabase
    .from("sms_log")
    .select("trigger_type")
    .eq("id", smsLogId)
    .maybeSingle();

  if (error) throw error;

  const fromLog = data?.trigger_type
    ? TRIGGER_TO_BOOKING_SOURCE[data.trigger_type]
    : null;

  return fromLog ?? fromCode ?? "sms_reminder";
}

function normalizeBookingHost(domain) {
  const host = (domain ?? process.env.BOOKING_WEBSITE_DOMAIN ?? "snpdetailing.ca")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (process.env.BOOKING_WEBSITE_KEEP_WWW === "true") {
    return host;
  }

  return host.replace(/^www\./, "");
}

/**
 * Compact tracked booking link for SMS.
 * Default: https://snpdetailing.ca/r/{shortRef}/m|g|a
 *   m = maintenance (sms_reminder)
 *   g = general (general_reminder)
 *   a = after maintenance miss (general_after_maintenance_reminder)
 * Query style (BOOKING_URL_STYLE=query): https://snpdetailing.ca/book?r={shortRef}&s=m
 */
export function buildBookingUrl({ shortRef, smsLogId, domain, source = "sms_reminder" }) {
  const host = normalizeBookingHost(domain);
  const ref = shortRef?.trim() || smsLogId?.trim();
  if (!ref) return `https://${host}/book`;

  const sourceCode = getBookingSourceCode(source);
  const useQuery = process.env.BOOKING_URL_STYLE === "query";

  if (useQuery) {
    const path = (process.env.BOOKING_URL_PATH || "book").replace(/^\/|\/$/g, "");
    return `https://${host}/${path}?r=${encodeURIComponent(ref)}&s=${sourceCode}`;
  }

  const prefix = (process.env.BOOKING_URL_PATH || "r").replace(/^\/|\/$/g, "");
  return `https://${host}/${prefix}/${encodeURIComponent(ref)}/${sourceCode}`;
}

/**
 * Tracked booking URLs for all SMS attribution types (same ref, different /m|g|a).
 * Use shortRef "preview" in dashboard previews when no sms_log row exists yet.
 */
export function buildTrackedBookingUrls({ shortRef, smsLogId, domain } = {}) {
  const ref = shortRef?.trim() || smsLogId?.trim() || "preview";

  return {
    maintenance: buildBookingUrl({
      shortRef: ref,
      smsLogId,
      domain,
      source: BOOKING_LINK_TRACK_KEYS.maintenance,
    }),
    general: buildBookingUrl({
      shortRef: ref,
      smsLogId,
      domain,
      source: BOOKING_LINK_TRACK_KEYS.general,
    }),
    after_maintenance: buildBookingUrl({
      shortRef: ref,
      smsLogId,
      domain,
      source: BOOKING_LINK_TRACK_KEYS.after_maintenance,
    }),
  };
}

export async function resolveSmsLogId(supabase, ref) {
  const trimmed = String(ref ?? "").trim();
  if (!trimmed) return null;
  if (isUuid(trimmed)) return trimmed;

  const { data, error } = await supabase
    .from("sms_log")
    .select("id")
    .eq("short_ref", trimmed)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
}

export async function hasShortRefColumn(supabase) {
  const { error } = await supabase.from("sms_log").select("short_ref").limit(1);
  return !error;
}
