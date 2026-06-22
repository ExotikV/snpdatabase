export function checkDashboardAuth(event) {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  if (!password) {
    return { ok: false, status: 503, error: "DASHBOARD_PASSWORD is not configured" };
  }

  const headers = event.headers ?? {};
  const header = headers.authorization ?? headers.Authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token !== password) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}

export function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function parseJsonBody(event) {
  try {
    return JSON.parse(event.body ?? "{}");
  } catch {
    return null;
  }
}

export function withAuth(handlerFn) {
  return async (event, context) => {
    const auth = checkDashboardAuth(event);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error }, auth.status);
    }
    return handlerFn(event, context);
  };
}
