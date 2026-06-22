import { NextResponse } from "next/server";
import { formatDetailDate, getEligibleClients, getReminderSchedule } from "@/lib/eligibility";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();
    const [schedule, eligible] = await Promise.all([
      getReminderSchedule(supabase),
      getEligibleClients(supabase),
    ]);

    return NextResponse.json({
      schedule: schedule.map((step) => ({
        sequenceNumber: step.sequence_number,
        daysSinceLastDetail: step.days_since_last_detail,
        messageBody: step.message_body,
      })),
      eligible: eligible.map((client) => ({
        clientId: client.clientId,
        name: client.name,
        phone: client.phone,
        lastDetailDate: formatDetailDate(client.lastDetailDate),
        lastServiceType: client.lastServiceType,
        daysSince: client.daysSince,
        sequenceNumber: client.sequenceNumber,
        messageBody: client.messageBody,
      })),
      count: eligible.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check eligibility";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
