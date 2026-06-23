function getBookingStartAt(booking) {
  if (!booking?.startAt) return null;
  const startAt = new Date(booking.startAt);
  return Number.isNaN(startAt.getTime()) ? null : startAt;
}

function getBookingDurationMinutes(booking) {
  const segments = booking?.appointmentSegments ?? [];
  let total = 0;
  let hasDuration = false;

  for (const segment of segments) {
    const minutes = Number(segment?.durationMinutes);
    if (Number.isFinite(minutes) && minutes > 0) {
      total += minutes;
      hasDuration = true;
    }
  }

  return hasDuration ? total : null;
}

/** Appointment end = start + segment durations. Falls back to start when duration is missing. */
export function getBookingEndAt(booking) {
  const startAt = getBookingStartAt(booking);
  if (!startAt) return null;

  const durationMinutes = getBookingDurationMinutes(booking);
  if (durationMinutes == null) {
    return startAt;
  }

  return new Date(startAt.getTime() + durationMinutes * 60 * 1000);
}

/** A detail is complete only after the appointment end time has passed. */
export function isBookingCompleted(booking, now = new Date()) {
  const endAt = getBookingEndAt(booking);
  return endAt != null && endAt < now;
}

export function getBookingCompletedAtIso(booking) {
  const endAt = getBookingEndAt(booking);
  return endAt?.toISOString() ?? booking?.startAt ?? null;
}

export { getBookingStartAt, getBookingDurationMinutes };
