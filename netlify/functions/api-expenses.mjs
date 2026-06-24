import { withAuth, jsonResponse, parseJsonBody } from "../../lib/auth.js";
import {
  createExpense,
  createExpenseStore,
  getExpensesDashboard,
} from "../../lib/expenses.js";
import { getSupabase } from "../../lib/supabase.js";

export const handler = withAuth(async (event) => {
  const supabase = getSupabase();
  const method = event.httpMethod;

  if (method === "GET") {
    try {
      const params = event.queryStringParameters ?? {};
      const period = params.period ?? "this_month";
      const year = params.year ? Number(params.year) : undefined;
      const data = await getExpensesDashboard(supabase, { period, year });
      return jsonResponse(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load expenses";
      return jsonResponse({ error: message }, 500);
    }
  }

  if (method === "POST") {
    try {
      const body = parseJsonBody(event);
      if (!body) {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      if (body.action === "create_store") {
        const store = await createExpenseStore(supabase, body);
        return jsonResponse({ ok: true, store }, 201);
      }

      const expense = await createExpense(supabase, body);
      return jsonResponse({ ok: true, expense }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save expense";
      return jsonResponse({ error: message }, 400);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
