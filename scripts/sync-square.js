import "dotenv/config";
import { runSquareSync } from "../lib/square-sync.js";

const customersOnly = process.argv.includes("--customers-only");

runSquareSync({ customersOnly })
  .then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
