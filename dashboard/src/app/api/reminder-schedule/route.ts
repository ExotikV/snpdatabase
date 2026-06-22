import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  DEFAULT_REMINDER_MESSAGE_BODY,
  REMINDER_MESSAGE_VARIABLES,
  getDefaultMessageBodyForStep,
} from "@/lib/reminder-message";

export type ReminderScheduleRow = {
  id: string;
  sequenceNumber: number;
  daysSinceLastDetail: number;
  active: boolean;
  messageBody: string;
  createdAt: string;
};

function mapRow(row: {
  id: string;
  sequence_number: number;
  days_since_last_detail: number;
  active: boolean;
  message_body?: string | null;
  created_at: string;
}): ReminderScheduleRow {
  return {
    id: row.id,
    sequenceNumber: row.sequence_number,
    daysSinceLastDetail: row.days_since_last_detail,
    active: row.active,
    messageBody: row.message_body?.trim() || DEFAULT_REMINDER_MESSAGE_BODY,
    createdAt: row.created_at,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (message.includes("message_body") && message.includes("does not exist")) {
      return "Database is missing reminder_schedule.message_body. Run schema_reminder_schedule_message_body.sql in Supabase SQL Editor, then try again.";
    }
    return message;
  }
  return fallback;
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("reminder_schedule")
      .select("id, sequence_number, days_since_last_detail, active, message_body, created_at")
      .order("sequence_number", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      rows: (data ?? []).map(mapRow),
      variables: REMINDER_MESSAGE_VARIABLES,
    });
  } catch (error) {
    const message = getErrorMessage(error, "Failed to load reminder schedule");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = getSupabase();
    const { data: existing, error: fetchError } = await supabase
      .from("reminder_schedule")
      .select("sequence_number, days_since_last_detail")
      .order("sequence_number", { ascending: false })
      .limit(1);

    if (fetchError) {
      throw fetchError;
    }

    const nextSequenceNumber =
      existing && existing.length > 0 ? existing[0].sequence_number + 1 : 1;
    const defaultDays =
      existing && existing.length > 0 ? existing[0].days_since_last_detail + 7 : 30;

    const { data, error } = await supabase
      .from("reminder_schedule")
      .insert({
        sequence_number: nextSequenceNumber,
        days_since_last_detail: defaultDays,
        active: true,
        message_body: getDefaultMessageBodyForStep(nextSequenceNumber),
      })
      .select("id, sequence_number, days_since_last_detail, active, message_body, created_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ row: mapRow(data) });
  } catch (error) {
    const message = getErrorMessage(error, "Failed to add reminder step");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      daysSinceLastDetail?: number;
      active?: boolean;
      messageBody?: string;
    };

    if (!body.id) {
      return NextResponse.json({ error: "Missing row id" }, { status: 400 });
    }

    if (
      body.daysSinceLastDetail != null &&
      (!Number.isInteger(body.daysSinceLastDetail) || body.daysSinceLastDetail < 1)
    ) {
      return NextResponse.json(
        { error: "days_since_last_detail must be a positive whole number" },
        { status: 400 },
      );
    }

    if (body.messageBody != null && !body.messageBody.trim()) {
      return NextResponse.json({ error: "Message body cannot be empty" }, { status: 400 });
    }

    const updates: {
      days_since_last_detail?: number;
      active?: boolean;
      message_body?: string;
    } = {};

    if (body.daysSinceLastDetail != null) {
      updates.days_since_last_detail = body.daysSinceLastDetail;
    }
    if (body.active != null) {
      updates.active = body.active;
    }
    if (body.messageBody != null) {
      updates.message_body = body.messageBody.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("reminder_schedule")
      .update(updates)
      .eq("id", body.id)
      .select("id, sequence_number, days_since_last_detail, active, message_body, created_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ row: mapRow(data) });
  } catch (error) {
    const message = getErrorMessage(error, "Failed to update reminder step");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
