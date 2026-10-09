import { openSignPage } from "./embed.js";
import { parseAllowedUrl, signPageFrameUrl } from "./url.js";

const SELECTOR = "a[data-connie-signpage]";
/** A SignPage's public link: one path segment, its PIN, with an optional trailing slash. */
const SIGN_PAGE_PATH = /^\/[^/]+\/?$/;

/**
 * The SignPage a click on a `data-connie-signpage` link should open in the
 * modal, or `null` when the browser should follow the link as it would
 * without connie-js: a click the page already handled, a modified or
 * non-primary click, a link that opens elsewhere, or an href that is not a
 * SignPage's public link.
 */
function signPageLink(event: MouseEvent): { link: HTMLAnchorElement; url: string } | null {
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
  if (!href || !SIGN_PAGE_PATH.test(href.pathname)) return null;
  return { link, url: signPageFrameUrl(href, page) };
}

/**
 * Opens a `data-connie-signpage` link's SignPage in the modal instead of
 * following it. Delegated from `document`, so links added after the script
 * loaded work too. When the embed fails (the website is not allowed to show
 * the SignPage, the SignPage is unavailable), the visitor goes to the link's
 * own page, which is where the link leads without connie-js.
 */
export function onLinkClick(event: MouseEvent): void {
  const found = signPageLink(event);
  if (!found) return;
  event.preventDefault();
  const { link, url } = found;
  openSignPage({ url, onError: () => window.location.assign(link.href) });
}

export function enhanceLinks(doc: Document): void {
  doc.addEventListener("click", onLinkClick);
}
