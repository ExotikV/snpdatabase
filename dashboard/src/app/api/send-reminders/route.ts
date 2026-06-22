import { NextResponse } from "next/server";
import { getEligibleClients } from "@/lib/eligibility";
import { getSupabase } from "@/lib/supabase";
import { sendMaintenanceReminders } from "@/lib/sms";

export async function POST() {
  try {
    const supabase = getSupabase();
    const eligible = await getEligibleClients(supabase);

    if (eligible.length === 0) {
      return NextResponse.json({
        totalEligible: 0,
        sentCount: 0,
        failedCount: 0,
        sent: [],
        failed: [],
      });
    }

    const { sent, failed } = await sendMaintenanceReminders(
      supabase,
      eligible.map((client) => ({
        clientId: client.clientId,
        name: client.name,
        phone: client.phone,
        sequenceNumber: client.sequenceNumber,
        messageBody: client.messageBody,
        lastServiceType: client.lastServiceType,
        lastDetailDate: client.lastDetailDate,
        daysSince: client.daysSince,
      })),
    );

    return NextResponse.json({
      totalEligible: eligible.length,
      sentCount: sent.length,
      failedCount: failed.length,
      sent,
      failed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send reminders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
