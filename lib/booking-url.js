const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

export function getBookingSourceCode(source) {
  if (source === "general_reminder" || source === "general_after_maintenance_reminder") {
    return "g";
  }
  return "m";
}

export function getBookingSourceFromCode(code) {
  const normalized = String(code ?? "").trim().toLowerCase();
  if (normalized === "g") return "general_reminder";
  return "sms_reminder";
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
 * Default: https://snpdetailing.ca/r/{shortRef}/m
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
