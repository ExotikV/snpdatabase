import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendBulkManualMessages } from "@/lib/sms";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clientIds?: string[];
      message?: string;
    };

    const clientIds = body.clientIds ?? [];
    const message = body.message ?? "";

    if (clientIds.length === 0) {
      return NextResponse.json({ error: "No clients selected" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, name, phone, opted_out")
      .in("id", clientIds);

    if (error) {
      throw error;
    }

    const recipients = (clients ?? [])
      .filter((client) => !client.opted_out)
      .map((client) => ({
        clientId: client.id,
        name: client.name ?? "(no name)",
        phone: client.phone,
      }));

    const { sent, failed } = await sendBulkManualMessages(
      supabase,
      recipients,
      message,
    );

    return NextResponse.json({
      totalSelected: clientIds.length,
      sentCount: sent.length,
      failedCount: failed.length,
      sent,
      failed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send bulk messages";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
