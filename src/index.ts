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
 * `window.Connie` when it is connie-js. An element with `id="Connie"` shows up
 * as `window.Connie` too, and is never taken for it.
 */
const loaded = (): ConnieJs | null => {
  const connie = window.Connie;
  return typeof connie?.openSignPage === "function" ? connie : null;
};

interface ScriptUrlPolicy {
  createScriptURL(url: string): unknown;
}

interface TrustedTypesFactory {
  createPolicy(name: string, rules: { createScriptURL(url: string): string }): ScriptUrlPolicy;
}

/** Script URLs the `connie-js` Trusted Types policy has been asked to allow. */
const allowed = new Set<string>();
let policy: ScriptUrlPolicy | null = null;

/**
 * The value to assign to `script.src`: under Trusted Types, a `TrustedScriptURL`
 * from the `connie-js` policy, which passes only the exact URLs connie-js
 * itself loads. The policy is created once per page.
 */
function scriptUrl(src: string): string {
  const tt = (window as { trustedTypes?: TrustedTypesFactory }).trustedTypes;
  if (!tt) return src;
  allowed.add(src);
  policy ||= tt.createPolicy("connie-js", {
    createScriptURL(url) {
      if (allowed.has(url)) return url;
      throw new TypeError("connie-js: refusing to load " + url);
    },
  });
  return policy.createScriptURL(src) as string;
}

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
  const ready = loaded();
  if (ready) return Promise.resolve(ready);
  if (pending) return pending;

  const src = new URL(options.scriptUrl || SCRIPT_URL, document.baseURI).href;
  const loading = new Promise<ConnieJs | null>((resolve, reject) => {
    const existing = Array.from(document.querySelectorAll("script[src]")).find(
      (s): s is HTMLScriptElement => base((s as HTMLScriptElement).src) === base(src),
    );
    const injected = !existing;
    const script = existing || document.createElement("script");
    const fail = (message: string): void => {
      if (injected) script.remove();
      reject(new Error(message));
    };
    script.addEventListener("load", () => {
      const connie = loaded();
      if (connie) resolve(connie);
      else fail("Connie.js loaded but did not define window.Connie");
    });
    script.addEventListener("error", () => fail("Failed to load Connie.js from " + src));
    if (injected) {
      script.src = scriptUrl(src);
      script.async = true;
      (document.head || document.body).append(script);
    }
  });
  pending = loading;
  // Whatever made loading fail, a later call starts over.
  loading.catch(() => {
    if (pending === loading) pending = null;
  });
  return loading;
}
