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

/** @deprecated Auth removed — passthrough wrapper kept for handler shape compatibility */
export function withAuth(handlerFn) {
  return handlerFn;
}
