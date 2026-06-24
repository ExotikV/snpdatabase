/** Eastern Time — handles EST/EDT automatically. */
export const BUSINESS_TIMEZONE = "America/Toronto";

function parseCalendarDateString(str) {
  const match = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(year, month - 1, day);
  if (
    probe.getFullYear() !== year ||
    probe.getMonth() !== month - 1 ||
    probe.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function torontoPartsFromInstant(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(date);

  const read = (type) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Calendar date in Eastern time for a UTC instant. */
export function getTorontoDateParts(value) {
  if (!value) return null;

  const calendar = parseCalendarDateString(value);
  if (calendar) return calendar;

  const date = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(date.getTime())) return null;

  const { year, month, day } = torontoPartsFromInstant(date);
  return { year, month, day };
}

/** YYYY-MM-DD in Eastern time (for HTML date inputs). */
export function toDateInputValue(value) {
  const parts = getTorontoDateParts(value);
  if (!parts) return "";

  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

function ordinalSuffix(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";

  const mod10 = day % 10;
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}

function formatEnglishCalendarParts({ year, month, day }) {
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: BUSINESS_TIMEZONE,
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));

  const dayWithOrdinal = `${day}${ordinalSuffix(day)}`;
  const nowYear = getTorontoDateParts(new Date())?.year;
  const sameYear = nowYear != null && year === nowYear;

  return sameYear
    ? `${monthName} ${dayWithOrdinal}`
    : `${monthName} ${dayWithOrdinal}, ${year}`;
}

/** Human-friendly date for SMS, e.g. "June 14th" or "June 14th, 2025". */
export function formatDetailDate(value) {
  const parts = getTorontoDateParts(value);
  if (!parts) return "";
  return formatEnglishCalendarParts(parts);
}

function formatFrenchCalendarParts({ year, month, day }) {
  const monthName = new Intl.DateTimeFormat("fr-CA", {
    month: "long",
    timeZone: BUSINESS_TIMEZONE,
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));

  const dayLabel = day === 1 ? "1er" : String(day);
  const nowYear = getTorontoDateParts(new Date())?.year;
  const sameYear = nowYear != null && year === nowYear;

  return sameYear
    ? `${dayLabel} ${monthName}`
    : `${dayLabel} ${monthName} ${year}`;
}

/** French date for SMS, e.g. "14 juin" or "14 juin 2025". */
export function formatDetailDateFr(value) {
  const parts = getTorontoDateParts(value);
  if (!parts) return "";
  return formatFrenchCalendarParts(parts);
}

/** Instant at a given clock time on a Toronto calendar day (for day-diff math). */
export function torontoCalendarToInstant({ year, month, day }, hour = 12, minute = 0) {
  for (let utcHour = 0; utcHour < 48; utcHour += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day, utcHour, minute, 0));
    const parts = torontoPartsFromInstant(candidate);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour) {
      return candidate;
    }
  }

  for (let utcHour = 0; utcHour < 48; utcHour += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day - 1, utcHour, minute, 0));
    const parts = torontoPartsFromInstant(candidate);
    if (parts.year === year && parts.month === month && parts.day === day && parts.hour === hour) {
      return candidate;
    }
  }

  return new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
}

export function toInstantForDaysCalc(value) {
  const calendar = parseCalendarDateString(value);
  if (calendar) return torontoCalendarToInstant(calendar, 12);

  const date = value instanceof Date ? value : new Date(String(value).trim());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days since last detail, using Eastern calendar dates (matches SMS copy). */
export function daysSinceLastDetail(earlier, later = new Date()) {
  const fromParts = getTorontoDateParts(earlier);
  const toParts = getTorontoDateParts(later);
  if (!fromParts || !toParts) return null;

  const from = torontoCalendarToInstant(fromParts, 12);
  const to = torontoCalendarToInstant(toParts, 12);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY));
}

/** Elapsed whole hours since an instant (for hour-based schedule steps). */
export function hoursSinceInstant(earlier, later = new Date()) {
  const from = earlier instanceof Date ? earlier : new Date(String(earlier));
  const to = later instanceof Date ? later : new Date(String(later));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.max(0, (to.getTime() - from.getTime()) / (60 * 60 * 1000));
}
