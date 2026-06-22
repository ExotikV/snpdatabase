/** Stop retrying a sequence step after this many failed send attempts in one detail cycle. */
export const MAX_SMS_FAILURES_PER_STEP = 2;

/**
 * All automated reminder log rows for the current detail cycle (any status).
 */
export function getCycleSmsAttempts(reminderRows, cycleAnchor) {
  return reminderRows.filter((row) => row.createdAt > cycleAnchor);
}

/** Sent or pending rows used to determine sequence progress. */
export function getCycleReminders(reminderRows, cycleAnchor) {
  return reminderRows.filter(
    (row) =>
      row.createdAt > cycleAnchor &&
      (row.status === "sent" || row.status === "pending"),
  );
}

export function countSequenceFailures(attemptRows, sequenceNumber) {
  return attemptRows.filter(
    (row) => row.sequenceNumber === sequenceNumber && row.status === "failed",
  ).length;
}

export function hasExceededSmsFailureLimit(
  attemptRows,
  sequenceNumber,
  maxFailures = MAX_SMS_FAILURES_PER_STEP,
) {
  return countSequenceFailures(attemptRows, sequenceNumber) >= maxFailures;
}

export function formatSmsFailureLimitReason(sequenceNumber, failureCount) {
  return `Step ${sequenceNumber} failed ${failureCount} times — automated retries stopped for this detail cycle`;
}

export async function assertSequenceCanBeRetried(
  supabase,
  { clientId, triggerType, sequenceNumber, cycleAnchor },
) {
  const anchorIso =
    cycleAnchor instanceof Date ? cycleAnchor.toISOString() : new Date(cycleAnchor).toISOString();

  const { data, error } = await supabase
    .from("sms_log")
    .select("id")
    .eq("client_id", clientId)
    .eq("trigger_type", triggerType)
    .eq("sequence_number", sequenceNumber)
    .eq("status", "failed")
    .gt("created_at", anchorIso);

  if (error) throw error;

  const failureCount = data?.length ?? 0;
  if (failureCount >= MAX_SMS_FAILURES_PER_STEP) {
    return {
      ok: false,
      failureCount,
      reason: formatSmsFailureLimitReason(sequenceNumber, failureCount),
    };
  }

  return { ok: true, failureCount };
}
