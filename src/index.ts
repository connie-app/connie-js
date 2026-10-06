import type { ConnieJs } from "./types.js";

export type {
  ConnieEmbedError,
  ConnieEmbedErrorCode,
  ConnieJs,
  OpenSignPageOptions,
  SignPageEmbed,
} from "./types.js";

export interface LoadConnieOptions {
  /** Internal: loads the script from another Connie environment. */
  scriptUrl?: string;
}

const SCRIPT_URL = "https://assets.getconnie.com/js/v1.js";

let pending: Promise<ConnieJs | null> | null = null;

const base = (href: string): string => href.split(/[?#]/)[0];

/**
 * Loads Connie's hosted script once and resolves with `window.Connie`.
 *
 * Reuses a `<script>` tag for the same URL already on the page, and an already
 * defined `window.Connie`. Resolves with `null` where there is no `window`
 * (server-side rendering). Rejects when the script fails to load; a later call
 * tries again.
 */
export function loadConnie(options: LoadConnieOptions = {}): Promise<ConnieJs | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  if (window.Connie) return Promise.resolve(window.Connie);
  if (pending) return pending;

  const src = new URL(options.scriptUrl || SCRIPT_URL, document.baseURI).href;
  pending = new Promise<ConnieJs | null>((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll("script[src]")).find(
      (s): s is HTMLScriptElement => base((s as HTMLScriptElement).src) === base(src),
    );
    const injected = !existing;
    const script = existing || document.createElement("script");
    const fail = (message: string): void => {
      pending = null;
      if (injected) script.remove();
      reject(new Error(message));
    };
    script.addEventListener("load", () => {
      if (window.Connie) resolve(window.Connie);
      else fail("Connie.js loaded but did not define window.Connie");
    });
    script.addEventListener("error", () => fail("Failed to load Connie.js from " + src));
    if (injected) {
      script.src = src;
      script.async = true;
      (document.head || document.body).append(script);
    }
  });
  return pending;
}
