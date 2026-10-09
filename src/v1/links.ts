import { openSignPage } from "./embed.js";
import { parseAllowedUrl, signPageFrameUrl } from "./url.js";

const SELECTOR = "a[data-connie-signpage]";
/** A SignPage's public link: one path segment, its PIN, with an optional trailing slash. */
const SIGN_PAGE_PATH = /^\/[^/]+\/?$/;
/** Connie's own sign host, always allowed. */
const SIGN_HOST = "sign.page";

/** How long a link's SignPage has to say it is `ready` before the visitor goes to its own page. */
export const READY_TIMEOUT_MS = 15_000;

/**
 * A host listed in `data-connie-hosts`, as a URL's `host` spells it: lowercase,
 * an internationalised domain in its punycode form, a default port dropped.
 * `null` for an entry that is not a bare host with an optional port.
 */
function normaliseHost(entry: string): string | null {
  if (/[/\\?#@]/.test(entry)) return null;
  try {
    return new URL("https://" + entry).host || null;
  } catch {
    return null;
  }
}

/**
 * The hosts a link may be framed from: `sign.page`, and the hosts the site's
 * author listed in the script tag's `data-connie-hosts` (space- or
 * comma-separated, each a hostname with an optional port, such as a custom
 * sign domain `sign.customer.com` or a local `sign.connie.localhost:4000`).
 * Each is compared as a link's host is, so an internationalised domain matches
 * its punycode form; an entry that is not a bare host is ignored. Read from
 * the tag that runs the script, which the site's author wrote; trust is never
 * taken from a link.
 */
export function allowedHosts(script: Element | null): Set<string> {
  const hosts = new Set([SIGN_HOST]);
  for (const entry of (script?.getAttribute("data-connie-hosts") || "").split(/[\s,]+/)) {
    const host = entry ? normaliseHost(entry) : null;
    if (host) hosts.add(host);
  }
  return hosts;
}

/**
 * The `<script>` element running this script, or `null`. Read through the
 * `currentScript` getter on the document's prototype chain, because markup on
 * the page can shadow `document.currentScript`: an `<img name="currentScript">`
 * or a `<form name="currentScript">` is a named property of the document
 * itself, and is what `document.currentScript` returns while it is in the
 * document. Such an element is never a `<script>`, so anything that is not one
 * is refused as well.
 */
export function runningScript(doc: Document): HTMLScriptElement | null {
  let script: unknown = null;
  for (let proto = Object.getPrototypeOf(doc); proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, "currentScript");
    if (descriptor) {
      script = descriptor.get ? descriptor.get.call(doc) : null;
      break;
    }
  }
  return script instanceof HTMLScriptElement ? script : null;
}

/**
 * The frame URL a click on a `data-connie-signpage` link should open in the
 * modal, and the link's address as validated now, or `null` when the browser
 * should follow the link as it would without connie-js: a click a script
 * dispatched rather than the visitor, a click the page already handled, a
 * modified or non-primary click, a link that opens elsewhere, or an href that
 * is not a SignPage's public link on an allowed host.
 *
 * Only an allowed Connie sign host is ever framed from a link, so the frame's
 * camera delegation (`allow="camera"`) and its one navigation (`navigate` to
 * `/openid/authorize/` on its own origin) can only reach Connie through page
 * markup. `Connie.openSignPage({url})` is not limited this way: its URL comes
 * from the integrator's own backend, not from a link on the page.
 */
function signPageLink(event: MouseEvent, hosts: Set<string>): { href: string; url: string } | null {
  if (!event.isTrusted) return null;
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
  return { href: href.href, url: signPageFrameUrl(href, page.origin) };
}

/**
 * Opens `data-connie-signpage` links to an allowed host's SignPage in the
 * modal instead of following them. Delegated from `document`, so links added
 * after the script loaded work too. When the embed fails (the website is not
 * allowed to show the SignPage, the SignPage is unavailable), or the SignPage
 * is not `ready` within `READY_TIMEOUT_MS` (a `frame-src` that leaves out its
 * host, a network that never delivers it), the modal closes and the visitor
 * goes to the link's own page, which is where the link leads without
 * connie-js: the address checked at the click, whatever the link's `href` has
 * become since.
 */
export function enhanceLinks(doc: Document, hosts: Set<string>): void {
  doc.addEventListener("click", (event: MouseEvent) => {
    const found = signPageLink(event, hosts);
    if (!found) return;
    event.preventDefault();
    const { href, url } = found;
    const fallBack = () => window.location.assign(href);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => clearTimeout(timer);
    const embed = openSignPage({ url, onReady: stop, onClose: stop, onError: fallBack });
    timer = setTimeout(() => {
      embed.close();
      fallBack();
    }, READY_TIMEOUT_MS);
  });
}
