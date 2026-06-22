const encoder = new TextEncoder();
const SESSION_PAYLOAD = "authenticated";

async function getExpectedSessionToken(): Promise<string | null> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password?.trim()) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(SESSION_PAYLOAD),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function isAuthenticated(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) {
    return false;
  }

  const expected = await getExpectedSessionToken();
  if (!expected) {
    return false;
  }

  return constantTimeEqual(cookieValue, expected);
}

export const SESSION_COOKIE = "snpdash_session";
