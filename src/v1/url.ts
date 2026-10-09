const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/;

/**
 * Parses a URL connie-js may frame or navigate to: `https:`, or `http:` on a
 * loopback host (`localhost`, `*.localhost`, `127.0.0.1`, `[::1]`) for local
 * development. Returns `null` for anything else.
 */
export function parseAllowedUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && LOOPBACK.test(url.hostname)) return url;
  return null;
}

/**
 * The session URL with `embed_id=<id>` appended to its query (`?` when it has
 * none, `&` when it has one), leaving the rest of the query and any fragment as
 * they are.
 */
export function withEmbedId(url: URL, embedId: string): string {
  const framed = new URL(url.href);
  const param = "embed_id=" + encodeURIComponent(embedId);
  framed.search = framed.search.length > 1 ? framed.search + "&" + param : "?" + param;
  return framed.href;
}

/**
 * The frame URL of a SignPage's website embed, for its public link `href`
 * (`https://sign.page/EA0990`) opened from `page`: `/<pin>/embed` on the
 * link's own host, so a custom domain is kept, with the page's origin, which
 * the SignPage must allow, and the page's origin and path as where "Back to"
 * returns after an eID. The page's query and fragment are never sent.
 */
export function signPageFrameUrl(href: URL, page: { origin: string; pathname: string }): string {
  const segment = href.pathname.replace(/^\/|\/$/g, "");
  return (
    href.origin +
    "/" +
    segment +
    "/embed?origin=" +
    encodeURIComponent(page.origin) +
    "&return_url=" +
    encodeURIComponent(page.origin + page.pathname)
  );
}

export function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
