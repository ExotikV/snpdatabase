export const REVIEW_SMS_DELAY_OPTIONS = [30, 60, 120];

export const DEFAULT_REVIEW_SMS_SETTINGS = {
  active: false,
  delayMinutes: 60,
  reviewUrl: "",
  messageBodyEn:
    "Hi {first_name}, thank you for choosing SNP Detailing! We'd love your feedback: {review_url}",
  messageBodyFr:
    "Bonjour {prenom}, merci d'avoir choisi SNP Detailing! Votre avis compte pour nous : {lien_avis}",
  activeSince: null,
  updatedAt: null,
};

let settingsTableExists = null;

function mapReviewSmsSettingsRow(row) {
  if (!row) return { ...DEFAULT_REVIEW_SMS_SETTINGS };

  return {
    active: Boolean(row.active),
    delayMinutes: row.delay_minutes ?? 60,
    reviewUrl: row.review_url ?? "",
    messageBodyEn: row.message_body_en ?? DEFAULT_REVIEW_SMS_SETTINGS.messageBodyEn,
    messageBodyFr: row.message_body_fr ?? DEFAULT_REVIEW_SMS_SETTINGS.messageBodyFr,
    activeSince: row.active_since ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function hasReviewSmsSettingsTable(supabase) {
  if (settingsTableExists != null) return settingsTableExists;

  const { error } = await supabase.from("review_sms_settings").select("id").limit(1);
  settingsTableExists = !error;
  return settingsTableExists;
}

export async function loadReviewSmsSettings(supabase) {
  const tableExists = await hasReviewSmsSettingsTable(supabase);
  if (!tableExists) {
    return {
      ...DEFAULT_REVIEW_SMS_SETTINGS,
      migrationRequired: true,
    };
  }

  const { data, error } = await supabase
    .from("review_sms_settings")
    .select(
      "active, delay_minutes, review_url, message_body_en, message_body_fr, active_since, updated_at",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;

  return {
    ...mapReviewSmsSettingsRow(data),
    migrationRequired: false,
  };
}

function normalizeDelayMinutes(value) {
  const parsed = Number(value);
  if (REVIEW_SMS_DELAY_OPTIONS.includes(parsed)) return parsed;
  return DEFAULT_REVIEW_SMS_SETTINGS.delayMinutes;
}

export async function saveReviewSmsSettings(supabase, payload) {
  const tableExists = await hasReviewSmsSettingsTable(supabase);
  if (!tableExists) {
    throw new Error("Run schema/review_sms_settings.sql in Supabase before saving review SMS settings");
  }

  const current = await loadReviewSmsSettings(supabase);
  const nextActive = Boolean(payload.active);
  const wasActive = Boolean(current.active);
  const now = new Date().toISOString();

  let activeSince = current.activeSince;
  if (nextActive && !wasActive) {
    activeSince = now;
  } else if (!nextActive) {
    activeSince = null;
  }

  const row = {
    id: 1,
    active: nextActive,
    delay_minutes: normalizeDelayMinutes(payload.delayMinutes ?? current.delayMinutes),
    review_url:
      typeof payload.reviewUrl === "string" ? payload.reviewUrl.trim() : current.reviewUrl,
    message_body_en:
      typeof payload.messageBodyEn === "string"
        ? payload.messageBodyEn.trim()
        : current.messageBodyEn,
    message_body_fr:
      typeof payload.messageBodyFr === "string"
        ? payload.messageBodyFr.trim()
        : current.messageBodyFr,
    active_since: activeSince,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("review_sms_settings")
    .upsert(row, { onConflict: "id" })
    .select(
      "active, delay_minutes, review_url, message_body_en, message_body_fr, active_since, updated_at",
    )
    .single();

  if (error) throw error;

  return mapReviewSmsSettingsRow(data);
}

export async function loadReviewSmsSentHistory(supabase, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("sms_log")
    .select("id, client_id, status, sent_at, created_at, error_message, clients(name, phone)")
    .eq("trigger_type", "review_sms")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    smsLogId: row.id,
    clientId: row.client_id,
    clientName: row.clients?.name ?? null,
    phone: row.clients?.phone ?? null,
    status: row.status,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    errorMessage: row.error_message,
  }));
}
