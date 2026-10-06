// Builds dist/: the hosted script (v1.js), the npm wrapper (ESM + CJS) and its types.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const banner = `/*! @getconnie/connie-js v${version} | MIT License | https://github.com/connie-app/connie-js */`;

rmSync(dist, { recursive: true, force: true });

await build({
  entryPoints: [join(root, "src/v1/index.ts")],
  outfile: join(dist, "v1.js"),
  bundle: true,
  format: "iife",
  target: ["es2022", "safari16", "chrome110", "firefox110", "edge110"],
  minify: true,
  legalComments: "none",
  banner: { js: banner },
  define: { __VERSION__: JSON.stringify(version) },
});

for (const [format, ext] of [
  ["esm", "js"],
  ["cjs", "cjs"],
]) {
  await build({
    entryPoints: [join(root, "src/index.ts")],
    outfile: join(dist, `index.${ext}`),
    bundle: true,
    format,
    platform: "neutral",
    target: "es2020",
    minify: true,
    banner: { js: banner },
  });
}

execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", join(root, "tsconfig.build.json")], {
  stdio: "inherit",
});

// The CommonJS entry gets its own declaration files, so `require` resolves
// CommonJS-flavoured types.
for (const name of ["index", "types"]) {
  const dts = readFileSync(join(dist, `${name}.d.ts`), "utf8");
  writeFileSync(join(dist, `${name}.d.cts`), dts.replaceAll('"./types.js"', '"./types.cjs"'));
}

console.log(`built dist/ for v${version}`);
