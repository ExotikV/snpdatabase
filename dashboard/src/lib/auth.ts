import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "snpdash_session";
const SESSION_PAYLOAD = "authenticated";

export function getSessionToken(): string {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password?.trim()) {
    throw new Error("DASHBOARD_PASSWORD is not configured");
  }
  return createHmac("sha256", password).update(SESSION_PAYLOAD).digest("hex");
}

export function verifyPassword(input: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    return false;
  }

  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

export function isAuthenticated(cookieValue: string | undefined): boolean {
  if (!cookieValue || !process.env.DASHBOARD_PASSWORD) {
    return false;
  }

  try {
    const expected = getSessionToken();
    const actualBuffer = Buffer.from(cookieValue);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return timingSafeEqual(actualBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};
