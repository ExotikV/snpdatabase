import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { getSupabase } from "../lib/supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "schema", "reminder_schedule_track.sql");

async function runStatement(supabase, sql) {
  const { error } = await supabase.rpc("exec_sql", { query: sql });
  return error;
}

async function main() {
  const supabase = getSupabase();
  const sql = fs.readFileSync(sqlPath, "utf8");

  console.log("Checking if reminder_schedule.track exists...");
  const { error: probeError } = await supabase.from("reminder_schedule").select("track").limit(1);
  if (!probeError) {
    console.log("track column already exists — nothing to do.");
    return;
  }

  console.log("Attempting migration via exec_sql RPC...");
  const { error: rpcError } = await supabase.rpc("exec_sql", { query: sql });
  if (!rpcError) {
    console.log("Migration applied successfully.");
    return;
  }

  console.log("exec_sql RPC not available:", rpcError.message);
  console.log("\nPlease run this file manually in Supabase → SQL Editor:\n");
  console.log(sqlPath);
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
