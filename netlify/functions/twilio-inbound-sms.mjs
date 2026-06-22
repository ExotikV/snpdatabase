import twilio from "twilio";
import { getSupabase } from "../../lib/supabase.js";
import {
  findClientByPhone,
  getStartConfirmationMessage,
  getStopConfirmationMessage,
  optInClientFromStartReply,
  optOutClientFromStopReply,
  parseInboundKeyword,
} from "../../lib/sms-opt-out.js";

function parseFormBody(body) {
  return Object.fromEntries(new URLSearchParams(body ?? ""));
}

function twimlResponse(message) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
  };
}

function emptyTwimlResponse() {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
  };
}

function getWebhookUrl(event) {
  const configured = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (configured) return configured;

  const host = event.headers["x-forwarded-host"] ?? event.headers.host;
  const proto = event.headers["x-forwarded-proto"] ?? "https";
  const path = event.rawPath ?? event.path ?? "/.netlify/functions/twilio-inbound-sms";
  return `${proto}://${host}${path}`;
}

function validateTwilioRequest(event, params) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = event.headers["x-twilio-signature"];

  if (!authToken || !signature) return false;

  return twilio.validateRequest(authToken, signature, getWebhookUrl(event), params);
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const params = parseFormBody(event.body);

  if (process.env.TWILIO_VALIDATE_SIGNATURE !== "false") {
    if (!validateTwilioRequest(event, params)) {
      console.error("[twilio-inbound-sms] Invalid Twilio signature");
      return { statusCode: 403, body: "Forbidden" };
    }
  }

  const fromPhone = params.From ?? "";
  const messageBody = params.Body ?? "";
  const keyword = parseInboundKeyword(messageBody);

  if (!keyword) {
    return emptyTwimlResponse();
  }

  console.log(
    `[twilio-inbound-sms] ${keyword.toUpperCase()} from ${fromPhone}: ${JSON.stringify(messageBody)}`,
  );

  try {
    const supabase = getSupabase();
    const client = await findClientByPhone(supabase, fromPhone);

    if (!client) {
      console.warn(`[twilio-inbound-sms] No client matched phone ${fromPhone}`);
      if (keyword === "stop") {
        return twimlResponse(getStopConfirmationMessage());
      }
      if (keyword === "start") {
        return twimlResponse(getStartConfirmationMessage());
      }
      return emptyTwimlResponse();
    }

    if (keyword === "stop") {
      await optOutClientFromStopReply(supabase, client.id);
      console.log(`[twilio-inbound-sms] Opted out client ${client.id} (${client.name ?? "unknown"})`);
      return twimlResponse(getStopConfirmationMessage());
    }

    if (keyword === "start") {
      await optInClientFromStartReply(supabase, client.id);
      console.log(`[twilio-inbound-sms] Opted in client ${client.id} (${client.name ?? "unknown"})`);
      return twimlResponse(getStartConfirmationMessage());
    }

    return emptyTwimlResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[twilio-inbound-sms] Fatal:", message);
    return { statusCode: 500, body: "Internal server error" };
  }
};
