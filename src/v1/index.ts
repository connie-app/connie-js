import type { ConnieJs } from "../types.js";
import { openSignPage } from "./embed.js";

declare const __VERSION__: string;

// An element with `id="Connie"` is reachable as `window.Connie` too, so only a
// global with a callable `openSignPage` counts as connie-js already loaded.
// Defining the property shadows such an element, and `writable: false` keeps a
// later script from swapping it with an ordinary assignment. A global the page
// declared with `var Connie` cannot be redefined, only assigned.
if (typeof window.Connie?.openSignPage !== "function") {
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
