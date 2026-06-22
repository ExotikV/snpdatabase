import { resolveSmsLogId, resolveBookingSource } from "./booking-url.js";
import { normalizeLanguage } from "./languages.js";
import { isQrBookingSource } from "./tracks.js";

const PAGE_SIZE = 1000;

async function fetchUnprocessedAttempts(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select(
        "id, ref, source, square_customer_id, phone, booked_at, raw_note, preferred_language",
      )
      .eq("processed", false)
      .order("booked_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function syncClientLanguageFromAttempt(supabase, attempt) {
  if (!attempt.preferred_language) return;

  const preferredLanguage = normalizeLanguage(attempt.preferred_language);
  const payload = { preferred_language: preferredLanguage };

  if (attempt.square_customer_id) {
    const { error } = await supabase
      .from("clients")
      .update(payload)
      .eq("square_customer_id", attempt.square_customer_id);
    if (!error) return;
  }

  if (attempt.phone?.trim()) {
    await supabase.from("clients").update(payload).eq("phone", attempt.phone.trim());
  }
}

async function markAttemptProcessed(supabase, attemptId) {
  const { error } = await supabase
    .from("booking_attempts")
    .update({ processed: true })
    .eq("id", attemptId);
  if (error) throw error;
}

async function markSmsLogConverted(supabase, smsLogId) {
  const { data, error } = await supabase
    .from("sms_log")
    .update({ converted: true })
    .eq("id", smsLogId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data != null;
}

function normalizeSource(source) {
  return typeof source === "string" ? source.trim().toLowerCase() : "";
}

export async function runMatchConversions(supabase) {
  const attempts = await fetchUnprocessedAttempts(supabase);
  const stats = {
    processed: 0,
    smsReminderConverted: 0,
    smsReminderOrphaned: 0,
    qrCodeBookings: 0,
    directBookings: 0,
    unknownSource: 0,
    errors: 0,
  };

  for (const attempt of attempts) {
    try {
      await syncClientLanguageFromAttempt(supabase, attempt);

      const source = normalizeSource(attempt.source);

      if (
        source === "sms_reminder" ||
        source === "general_reminder" ||
        source === "general_after_maintenance_reminder"
      ) {
        if (!attempt.ref) {
          stats.smsReminderOrphaned += 1;
        } else {
          const smsLogId = await resolveSmsLogId(supabase, attempt.ref);
          if (!smsLogId) {
            stats.smsReminderOrphaned += 1;
          } else {
            const authoritativeSource = await resolveBookingSource(supabase, {
              ref: attempt.ref,
              sourceCode: null,
            });
            if (authoritativeSource !== source) {
              await supabase
                .from("booking_attempts")
                .update({ source: authoritativeSource })
                .eq("id", attempt.id);
            }

            const matched = await markSmsLogConverted(supabase, smsLogId);
            if (matched) stats.smsReminderConverted += 1;
            else stats.smsReminderOrphaned += 1;
          }
        }
        await markAttemptProcessed(supabase, attempt.id);
        stats.processed += 1;
      } else if (isQrBookingSource(source)) {
        stats.qrCodeBookings += 1;
        await markAttemptProcessed(supabase, attempt.id);
        stats.processed += 1;
      } else if (source === "direct") {
        stats.directBookings += 1;
        await markAttemptProcessed(supabase, attempt.id);
        stats.processed += 1;
      } else {
        stats.unknownSource += 1;
        await markAttemptProcessed(supabase, attempt.id);
        stats.processed += 1;
      }
    } catch {
      stats.errors += 1;
    }
  }

  return { attempts: attempts.length, ...stats };
}
