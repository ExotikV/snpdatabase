import { schedule } from "@netlify/functions";

/**
 * Nightly backend job on Netlify: pull Square → send reminders → match conversions.
 * Invokes the Next.js API route so the same code path runs as manual/debug calls.
 *
 * Schedule: 10pm Eastern during EDT = 02:00 UTC.
 * When EST begins (~November): change to "0 3 * * *".
 */
const handler = schedule("0 2 * * *", async () => {
  const siteUrl = process.env.URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET?.trim();

  if (!siteUrl) {
    throw new Error("URL is not set — is this running on Netlify?");
  }
  if (!secret) {
    throw new Error("CRON_SECRET is not set in Netlify environment variables");
  }

  const response = await fetch(`${siteUrl}/api/cron/daily-sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Daily sync HTTP ${response.status}: ${body}`);
  }

  console.log("Daily sync completed:", body);

  return {
    statusCode: 200,
    body,
  };
});

export { handler };
