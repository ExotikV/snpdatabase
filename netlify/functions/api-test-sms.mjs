import { jsonResponse, parseJsonBody, withAuth } from "../../lib/auth.js";
import { getTestPhoneNumber, sendTestReminderSms } from "../../lib/sms.js";

export const handler = withAuth(async (event) => {
  if (event.httpMethod === "GET") {
    return jsonResponse({ testPhone: getTestPhoneNumber() });
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = parseJsonBody(event) ?? {};
    const result = await sendTestReminderSms({
      messageBody: body.message_body,
      daysSince: body.days_since_last_detail,
      phone: body.phone,
    });

    if (!result.ok) {
      return jsonResponse({ ok: false, ...result }, 500);
    }

    return jsonResponse({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send test SMS";
    return jsonResponse({ error: message }, 500);
  }
});
