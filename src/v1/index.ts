import type { ConnieJs } from "../types.js";
import { openSignPage } from "./embed.js";
import { allowedHosts, enhanceLinks, runningScript } from "./links.js";

declare const __VERSION__: string;

/** Where the copy that enhances links records the hosts it allows, for a later copy to compare. */
const HOSTS_KEY = Symbol.for("connie-js.hosts");

const hosts = allowedHosts(runningScript(document));
const hostList = Array.from(hosts).sort().join(" ");

// An element with `id="Connie"` is reachable as `window.Connie` too, so only a
// global with a callable `openSignPage` counts as connie-js already loaded.
// Defining the property shadows such an element, and `writable: false` keeps a
// later script from swapping it with an ordinary assignment. A global the page
// declared with `var Connie` cannot be redefined, only assigned. Links marked
// `data-connie-signpage` are enhanced by the copy that defines it, so a page
// loading the script twice opens one modal per click; the hosts they may open
// are read from that copy's own script tag, once, while it runs. A later copy
// whose tag lists other hosts says so in the console, since its list is not
// the one in force.
if (typeof window.Connie?.openSignPage !== "function") {
  enhanceLinks(document, hosts);
  Object.defineProperty(window, HOSTS_KEY, { value: hostList, configurable: true });
  const connie: ConnieJs = Object.freeze({ openSignPage, version: __VERSION__ });
  try {
    Object.defineProperty(window, "Connie", {
      value: connie,
      configurable: true,
      writable: false,
      enumerable: false,
    });
  } catch {
    window.Connie = connie;
  }
} else {
  const active = (window as unknown as Record<symbol, unknown>)[HOSTS_KEY];
  if (typeof active === "string" && active !== hostList) {
    console.warn(
      "Connie: connie-js is already loaded on this page, so this script tag's data-connie-hosts is ignored. " +
        "Links open only on: " +
        active.replace(/ /g, ", "),
    );
  }
}
