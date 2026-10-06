// Fails when a built file is over its gzipped size budget. Run after `npm run build`.
import { sizes } from "./sizes.mjs";

let over = false;
for (const { file, raw, gzip, budget } of sizes()) {
  const ok = gzip <= budget;
  over ||= !ok;
  console.log(`${ok ? "ok  " : "OVER"} ${file}: ${raw} B, ${gzip} B gzipped (budget ${budget} B)`);
}
process.exit(over ? 1 : 0);
