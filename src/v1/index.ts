import type { ConnieJs } from "../types.js";
import { openSignPage } from "./embed.js";
import { allowedHosts, enhanceLinks } from "./links.js";

declare const __VERSION__: string;

// An element with `id="Connie"` is reachable as `window.Connie` too, so only a
// global with a callable `openSignPage` counts as connie-js already loaded.
// Defining the property shadows such an element, and `writable: false` keeps a
// later script from swapping it with an ordinary assignment. A global the page
// declared with `var Connie` cannot be redefined, only assigned. Links marked
// `data-connie-signpage` are enhanced by the copy that defines it, so a page
// loading the script twice opens one modal per click; the hosts they may open
// are read from that copy's own script tag, once, while it runs.
if (typeof window.Connie?.openSignPage !== "function") {
  enhanceLinks(document, allowedHosts(document.currentScript));
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
}
