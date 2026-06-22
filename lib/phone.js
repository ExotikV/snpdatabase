/** Normalize a phone number to E.164 when possible (North America). */
export function normalizePhone(phone) {
  if (!phone?.trim()) return null;

  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (trimmed.startsWith("+")) return trimmed;

  return trimmed;
}

export function phoneLast10(phone) {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}
