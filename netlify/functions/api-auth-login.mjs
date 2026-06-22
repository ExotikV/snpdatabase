import { jsonResponse, parseJsonBody } from "../../lib/auth.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) {
    return jsonResponse({ error: "DASHBOARD_PASSWORD is not configured" }, 503);
  }

  const body = parseJsonBody(event);
  if (!body) {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  if (body.password !== password) {
    return jsonResponse({ error: "Invalid password" }, 401);
  }

  return jsonResponse({ ok: true, token: password });
}
