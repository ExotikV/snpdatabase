import { ALL_SMS_TRIGGER_TYPES, TRIGGER_LABELS } from "./tracks.js";

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

export async function getSmsDashboardStats(supabase) {
  const [sent, failed, converted, ...perTrack] = await Promise.all([
    countSmsLog(supabase, { trigger_type: ALL_SMS_TRIGGER_TYPES, status: "sent" }),
    countSmsLog(supabase, { trigger_type: ALL_SMS_TRIGGER_TYPES, status: "failed" }),
    countSmsLog(supabase, {
      trigger_type: ALL_SMS_TRIGGER_TYPES,
      status: "sent",
      converted: true,
    }),
    ...ALL_SMS_TRIGGER_TYPES.map(async (triggerType) => {
      const [trackSent, trackFailed, trackConverted] = await Promise.all([
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
        sent: trackSent,
        failed: trackFailed,
        converted: trackConverted,
      };
    }),
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
