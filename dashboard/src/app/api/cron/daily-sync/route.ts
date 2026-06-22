import { NextResponse } from "next/server";
import { runDailySyncOnNetlify } from "@/lib/backend/run-daily-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const auth = request.headers.get("authorization")?.trim();
  if (auth === `Bearer ${secret}`) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  return headerSecret === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDailySyncOnNetlify();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Daily sync failed: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
