import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  isAuthenticated,
  sessionCookieOptions,
  verifyPassword,
  getSessionToken,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = body.password ?? "";

    if (!verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, getSessionToken(), sessionCookieOptions);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const authenticated = isAuthenticated(cookieStore.get(SESSION_COOKIE)?.value);
  return NextResponse.json({ authenticated });
}
