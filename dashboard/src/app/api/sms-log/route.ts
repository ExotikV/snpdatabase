import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const triggerType = searchParams.get("trigger_type") ?? "";
    const status = searchParams.get("status") ?? "";
    const sort = searchParams.get("sort") === "asc" ? "asc" : "desc";

    let countQuery = supabase
      .from("sms_log")
      .select("id", { count: "exact", head: true });

    if (triggerType) {
      countQuery = countQuery.eq("trigger_type", triggerType);
    }
    if (status) {
      countQuery = countQuery.eq("status", status);
    }

    const { count, error: countError } = await countQuery;
    if (countError) {
      throw countError;
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("sms_log")
      .select(
        "id, trigger_type, status, sent_at, converted, created_at, clients(name, phone)",
      )
      .order("sent_at", { ascending: sort === "asc", nullsFirst: false })
      .range(from, to);

    if (triggerType) {
      query = query.eq("trigger_type", triggerType);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const rows = (data ?? []).map((row) => {
      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      return {
        id: row.id,
        clientName: client?.name ?? "(unknown)",
        phone: client?.phone ?? "",
        triggerType: row.trigger_type,
        status: row.status,
        sentAt: row.sent_at,
        converted: row.converted,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({
      rows,
      page,
      pageSize: PAGE_SIZE,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load SMS log";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
