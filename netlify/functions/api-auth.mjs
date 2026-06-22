import { jsonResponse, parseJsonBody } from "../../lib/auth.js";

export const handler = async (event) => {
  const password = process.env.DASHBOARD_PASSWORD?.trim();

  if (event.httpMethod === "GET") {
    return jsonResponse({ configured: Boolean(password) });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!password) {
    return jsonResponse({ error: "DASHBOARD_PASSWORD is not configured" }, 503);
  }

  const body = parseJsonBody(event);
  const submitted = typeof body?.password === "string" ? body.password.trim() : "";

  if (!submitted || submitted !== password) {
    return jsonResponse({ error: "Invalid password" }, 401);
  }

  return jsonResponse({ ok: true });
};
