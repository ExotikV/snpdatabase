import { normalizePhone, phoneLast10 } from "./phone.js";

export const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
export const START_KEYWORDS = ["START", "UNSTOP", "YES"];

export const OPT_OUT_SOURCES = {
  MANUAL: "manual",
  STOP_REPLY: "stop_reply",
};

/** @param {string | null | undefined} body */
export function parseInboundKeyword(body) {
  if (!body?.trim()) return null;

  const word = body.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (STOP_KEYWORDS.includes(word)) return "stop";
  if (START_KEYWORDS.includes(word)) return "start";
  return null;
}

export function getOptOutFooter(preferredLanguage) {
  return preferredLanguage === "fr"
    ? "\n\nRépondez STOP pour vous désabonner."
    : "\n\nReply STOP to unsubscribe.";
}

export function appendOptOutFooter(messageBody, preferredLanguage) {
  const body = messageBody?.trim() ?? "";
  const footer = getOptOutFooter(preferredLanguage);
  const footerText = footer.trim();

  if (
    body.toLowerCase().includes("reply stop") ||
    body.toLowerCase().includes("répondez stop")
  ) {
    return body;
  }

  return `${body}${footer}`;
}

export function getStopConfirmationMessage() {
  return "You have been unsubscribed from SNP Detailing SMS reminders. You will not receive further reminder texts. Reply START to resubscribe.";
}

export function getStartConfirmationMessage() {
  return "You have been resubscribed to SNP Detailing SMS reminders. Reply STOP to unsubscribe.";
}

export function getOptOutStatusLabel(source) {
  if (source === OPT_OUT_SOURCES.STOP_REPLY) return "Unsubscribed (STOP reply)";
  if (source === OPT_OUT_SOURCES.MANUAL) return "Excluded manually";
  return "Excluded from SMS";
}

export async function findClientByPhone(supabase, fromPhone) {
  const normalized = normalizePhone(fromPhone);
  const last10 = phoneLast10(fromPhone);

  if (normalized) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, phone, opted_out, opted_out_source")
      .eq("phone", normalized)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (fromPhone?.trim()) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, phone, opted_out, opted_out_source")
      .eq("phone", fromPhone.trim())
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (last10.length !== 10) return null;

  const { data: clients, error: listError } = await supabase
    .from("clients")
    .select("id, name, phone, opted_out, opted_out_source")
    .not("phone", "is", null)
    .limit(1000);

  if (listError) throw listError;

  return (
    (clients ?? []).find((client) => phoneLast10(client.phone) === last10) ?? null
  );
}

export async function optOutClientFromStopReply(supabase, clientId) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("clients")
    .update({
      opted_out: true,
      opted_out_at: now,
      opted_out_source: OPT_OUT_SOURCES.STOP_REPLY,
    })
    .eq("id", clientId);

  if (error) throw error;
  return now;
}

export async function optInClientFromStartReply(supabase, clientId) {
  const { error } = await supabase
    .from("clients")
    .update({
      opted_out: false,
      opted_out_at: null,
      opted_out_source: null,
    })
    .eq("id", clientId);

  if (error) throw error;
}
