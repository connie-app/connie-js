import { openSignPage } from "./embed.js";
import { parseAllowedUrl, signPageFrameUrl } from "./url.js";

const SELECTOR = "a[data-connie-signpage]";
/** A SignPage's public link: one path segment, its PIN, with an optional trailing slash. */
const SIGN_PAGE_PATH = /^\/[^/]+\/?$/;
/** Connie's own sign host, always allowed. */
const SIGN_HOST = "sign.page";

/**
 * The hosts a link may be framed from: `sign.page`, and the hosts the site's
 * author listed in the script tag's `data-connie-hosts` (space- or
 * comma-separated, each a hostname with an optional port, such as a custom
 * sign domain `sign.customer.com` or a local `sign.connie.localhost:4000`).
 * Read from the tag that runs the script, which the site's author wrote; trust
 * is never taken from a link.
 */
export function allowedHosts(script: Element | null): Set<string> {
  const listed = (script?.getAttribute("data-connie-hosts") || "")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
  return new Set([SIGN_HOST, ...listed]);
}

/**
 * The frame URL a click on a `data-connie-signpage` link should open in the
 * modal, and the link, or `null` when the browser should follow the link as it
 * would without connie-js: a click the page already handled, a modified or
 * non-primary click, a link that opens elsewhere, or an href that is not a
 * SignPage's public link on an allowed host.
 *
 * Only an allowed Connie sign host is ever framed from a link, so the frame's
 * camera delegation (`allow="camera"`) and its one navigation (`navigate` to
 * `/openid/authorize/` on its own origin) can only reach Connie through page
 * markup. `Connie.openSignPage({url})` is not limited this way: its URL comes
 * from the integrator's own backend, not from a link on the page.
 */
function signPageLink(
  event: MouseEvent,
  hosts: Set<string>,
): { link: HTMLAnchorElement; url: string } | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target;
  if (!target || typeof (target as Element).closest !== "function") return null;
  const link = (target as Element).closest<HTMLAnchorElement>(SELECTOR);
  if (!link || !link.hasAttribute("href")) return null;
  const opens = (link.getAttribute("target") || "").toLowerCase();
  if (opens && opens !== "_self") return null;
  const page = window.location;
  if (page.protocol !== "https:" && page.protocol !== "http:") return null;
  const href = parseAllowedUrl(link.href);
  if (!href || !hosts.has(href.host.toLowerCase())) return null;
  if (!SIGN_PAGE_PATH.test(href.pathname)) return null;
  return { link, url: signPageFrameUrl(href, page.origin) };
}

/**
 * Opens `data-connie-signpage` links to an allowed host's SignPage in the
 * modal instead of following them. Delegated from `document`, so links added
 * after the script loaded work too. When the embed fails (the website is not
 * allowed to show the SignPage, the SignPage is unavailable), the visitor goes
 * to the link's own page, which is where the link leads without connie-js.
 */
export function enhanceLinks(doc: Document, hosts: Set<string>): void {
  doc.addEventListener("click", (event: MouseEvent) => {
    const found = signPageLink(event, hosts);
    if (!found) return;
    event.preventDefault();
    const { link, url } = found;
    openSignPage({ url, onError: () => window.location.assign(link.href) });
  });
}
