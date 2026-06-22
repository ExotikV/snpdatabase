const PAGE_SIZE = 1000;

async function fetchUnprocessedAttempts(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("booking_attempts")
      .select("id, ref, source, square_customer_id, phone, booked_at, raw_note")
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
      const source = normalizeSource(attempt.source);

      if (source === "sms_reminder" || source === "general_reminder") {
        if (!attempt.ref) {
          stats.smsReminderOrphaned += 1;
        } else {
          const matched = await markSmsLogConverted(supabase, attempt.ref);
          if (matched) stats.smsReminderConverted += 1;
          else stats.smsReminderOrphaned += 1;
        }
        await markAttemptProcessed(supabase, attempt.id);
        stats.processed += 1;
      } else if (source === "qr_code") {
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
