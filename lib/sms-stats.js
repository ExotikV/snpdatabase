import {
  ALL_SMS_TRIGGER_TYPES,
  MANUAL_SMS_TRIGGER_TYPE,
  SMS_LOG_TRIGGER_TYPES,
  TRIGGER_LABELS,
} from "./tracks.js";

async function countSmsLog(supabase, filters) {
  let query = supabase.from("sms_log").select("id", { count: "exact", head: true });

  for (const [column, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      query = query.in(column, value);
    } else {
      query = query.eq(column, value);
    }
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

async function countTrackStats(supabase, triggerType) {
  const [sent, failed, converted] = await Promise.all([
    countSmsLog(supabase, { trigger_type: triggerType, status: "sent" }),
    countSmsLog(supabase, { trigger_type: triggerType, status: "failed" }),
    countSmsLog(supabase, {
      trigger_type: triggerType,
      status: "sent",
      converted: true,
    }),
  ]);

  return {
    triggerType,
    label: TRIGGER_LABELS[triggerType] ?? triggerType,
    sent,
    failed,
    converted,
  };
}

export async function getSmsDashboardStats(supabase) {
  const trackTypes = [...ALL_SMS_TRIGGER_TYPES, MANUAL_SMS_TRIGGER_TYPE];

  const [sent, failed, converted, ...perTrack] = await Promise.all([
    countSmsLog(supabase, { trigger_type: SMS_LOG_TRIGGER_TYPES, status: "sent" }),
    countSmsLog(supabase, { trigger_type: SMS_LOG_TRIGGER_TYPES, status: "failed" }),
    countSmsLog(supabase, {
      trigger_type: SMS_LOG_TRIGGER_TYPES,
      status: "sent",
      converted: true,
    }),
    ...trackTypes.map((triggerType) => countTrackStats(supabase, triggerType)),
  ]);

  const conversionRate = sent > 0 ? Math.round((converted / sent) * 1000) / 10 : 0;

  return {
    sent,
    failed,
    converted,
    conversionRate,
    byTrack: perTrack,
  };
}
