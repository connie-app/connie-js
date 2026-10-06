import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Gzipped size budgets, in bytes, for the files a browser downloads. */
export const BUDGETS = {
  "dist/v1.js": 10 * 1024,
  "dist/index.js": 1024,
  "dist/index.cjs": 1024,
};

export function sizes() {
  return Object.entries(BUDGETS).map(([file, budget]) => {
    const raw = readFileSync(join(root, file));
    return { file, raw: raw.length, gzip: gzipSync(raw, { level: 9 }).length, budget };
  });
}
