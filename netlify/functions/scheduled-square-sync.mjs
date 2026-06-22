import { runSquareSync } from "../../lib/square-sync.js";

export const handler = async () => {
  console.log("[scheduled-square-sync] Starting full Square sync...");
  try {
    const stats = await runSquareSync();
    console.log("[scheduled-square-sync] Complete:", JSON.stringify(stats));
    return { statusCode: 200, body: JSON.stringify({ ok: true, stats }) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[scheduled-square-sync] Fatal:", message);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: message }) };
  }
};

export const config = {
  schedule: "0 6 * * *",
};
