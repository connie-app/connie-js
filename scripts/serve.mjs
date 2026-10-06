// Serves the repo for manual testing of examples/ (run with `npm run example`).
//
// The host page is at http://localhost:5173/examples/ and the mock SignPage at
// http://127.0.0.1:5173/examples/mock-frame.html: two origins, so origin checks
// run for real. The host page is served under a strict CSP with no 'unsafe-inline'
// anywhere, which connie-js must work under.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.EXAMPLE_PORT || 5173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const HOST_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `frame-src http://127.0.0.1:${port} https:`,
].join("; ");

const FRAME_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  `frame-ancestors http://localhost:${port}`,
].join("; ");

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const file = join(root, path.endsWith("/") ? join(path, "index.html") : path);
  if (!file.startsWith(join(root, "examples")) && !file.startsWith(join(root, "dist"))) {
    res.writeHead(404).end("not found");
    return;
  }
  try {
    const body = await readFile(file);
    const headers = { "content-type": types[extname(file)] || "application/octet-stream" };
    if (extname(file) === ".html") {
      headers["content-security-policy"] = file.includes("mock-") ? FRAME_CSP : HOST_CSP;
    }
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => {
  console.log(`host page:  http://localhost:${port}/examples/`);
  console.log(`mock frame: http://127.0.0.1:${port}/examples/mock-frame.html`);
});
