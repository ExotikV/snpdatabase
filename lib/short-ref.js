import { randomBytes } from "node:crypto";

/** Avoid ambiguous characters (0/O, 1/l/I). */
const SHORT_REF_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";

export function generateShortRef(length = 6) {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += SHORT_REF_ALPHABET[bytes[i] % SHORT_REF_ALPHABET.length];
  }
  return result;
}
