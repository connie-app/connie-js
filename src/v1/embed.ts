import type { ConnieEmbedError, OpenSignPageOptions, SignPageEmbed } from "../types.js";
import { part } from "./styles.js";
import { parseAllowedUrl, randomId, withEmbedId } from "./url.js";

const FALLBACK_LABEL = "SignPage";

interface OpenEmbed {
  overlay: HTMLElement;
  frame: HTMLIFrameElement;
  close(): void;
}

/** Open embeds, oldest first. Only the last one answers Esc and holds focus. */
const stack: OpenEmbed[] = [];
let unlockScroll: (() => void) | null = null;
let listening = false;

function call<A extends unknown[]>(fn: ((...args: A) => void) | undefined, ...args: A): void {
  if (typeof fn !== "function") return;
  try {
    fn(...args);
  } catch (error) {
    setTimeout(() => {
      throw error;
    });
  }
}

/** Sets inline properties through CSSOM and returns a function that puts the previous values back. */
function setStyles(el: HTMLElement, props: Record<string, string>): () => void {
  const hadAttribute = el.hasAttribute("style");
  const previous = Object.keys(props).map(
    (k) => [k, el.style.getPropertyValue(k), el.style.getPropertyPriority(k)] as const,
  );
  for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v, "important");
  return () => {
    for (const [k, v, priority] of previous) {
      if (v) el.style.setProperty(k, v, priority);
      else el.style.removeProperty(k);
    }
    if (!hadAttribute && !el.style.length) el.removeAttribute("style");
  };
}

function lockScroll(doc: Document): () => void {
  const root = doc.documentElement;
  const gap = (doc.defaultView?.innerWidth ?? 0) - root.clientWidth;
  const restoreRoot = setStyles(root, { overflow: "hidden" });
  const restoreBody =
    gap > 0 && doc.body
      ? setStyles(doc.body, {
          "padding-right": (parseFloat(getComputedStyle(doc.body).paddingRight) || 0) + gap + "px",
        })
      : () => {};
  return () => {
    restoreRoot();
    restoreBody();
  };
}

function onKeydown(event: KeyboardEvent): void {
  const top = stack[stack.length - 1];
  if (top && event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    top.close();
  }
}

function onFocusin(event: FocusEvent): void {
  const top = stack[stack.length - 1];
  if (top && !top.overlay.contains(event.target as Node)) top.frame.focus();
}

function listen(doc: Document, on: boolean): void {
  if (listening === on) return;
  listening = on;
  if (on) {
    doc.addEventListener("keydown", onKeydown, true);
    doc.addEventListener("focusin", onFocusin, true);
  } else {
    doc.removeEventListener("keydown", onKeydown, true);
    doc.removeEventListener("focusin", onFocusin, true);
  }
}

function toError(payload: Record<string, unknown>): ConnieEmbedError {
  return {
    code: typeof payload.code === "string" ? payload.code : "unknown",
    message: typeof payload.message === "string" ? payload.message : "",
  };
}

/**
 * Opens a SignPage in a modal over the current page.
 *
 * Throws a `TypeError` for options that can never work: neither or both of
 * `url` and `fetchUrl`, or a `url` that is not `https:` (`http:` is accepted
 * on loopback hosts for local development). Everything that goes wrong after
 * that, including a bad URL from `fetchUrl`, is reported through `onError`.
 */
export function openSignPage(options: OpenSignPageOptions): SignPageEmbed {
  if (!options || typeof options !== "object") {
    throw new TypeError("Connie.openSignPage: options are required");
  }
  const { url, fetchUrl } = options;
  if ((url == null) === (fetchUrl == null)) {
    throw new TypeError("Connie.openSignPage: pass exactly one of `url` and `fetchUrl`");
  }
  if (fetchUrl != null && typeof fetchUrl !== "function") {
    throw new TypeError("Connie.openSignPage: `fetchUrl` must be a function");
  }
  const initial = url == null ? null : parseAllowedUrl(url);
  if (url != null && !initial) {
    throw new TypeError("Connie.openSignPage: `url` must be an https URL");
  }

  const doc = document;
  const embedId = randomId();
  const returnFocus = doc.activeElement;
  let frameOrigin: string | null = null;
  let closed = false;
  let readyFired = false;
  let signedFired = false;

  const overlay = part(doc, "div", "overlay");
  const dialog = part(doc, "div", "dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", FALLBACK_LABEL);
  dialog.setAttribute("aria-busy", "true");

  const frame = part(doc, "iframe", "frame");
  frame.title = FALLBACK_LABEL;
  frame.setAttribute("allow", "camera");

  const loading = part(doc, "div", "loading");
  loading.setAttribute("aria-hidden", "true");
  loading.append(part(doc, "div", "spinner"));

  const closeButton = part(doc, "button", "close");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.textContent = "×";

  dialog.append(frame, loading, closeButton);
  overlay.append(dialog);

  const finish = (callback?: () => void): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener("message", onMessage);
    const wasTop = stack[stack.length - 1] === embed;
    stack.splice(stack.indexOf(embed), 1);
    overlay.remove();
    if (!stack.length) {
      listen(doc, false);
      unlockScroll?.();
      unlockScroll = null;
    }
    if (wasTop) {
      const next = stack[stack.length - 1];
      if (next) next.frame.focus();
      else if (returnFocus?.isConnected) (returnFocus as HTMLElement).focus?.();
    }
    call(callback);
    call(options.onClose);
  };

  const fail = (error: ConnieEmbedError): void =>
    finish(() => {
      if (typeof options.onError === "function") call(options.onError, error);
      else console.error("Connie: " + error.code + ": " + error.message);
    });

  const ready = (title: unknown): void => {
    if (typeof title === "string" && title.trim()) {
      const label = title.trim().slice(0, 200);
      dialog.setAttribute("aria-label", label);
      frame.title = label;
    }
    if (loading.isConnected) {
      if (doc.activeElement === closeButton) frame.focus();
      loading.remove();
      closeButton.remove();
      dialog.removeAttribute("aria-busy");
    }
    if (!readyFired) {
      readyFired = true;
      call(options.onReady);
    }
  };

  function onMessage(event: MessageEvent): void {
    if (
      !frameOrigin ||
      event.origin !== frameOrigin ||
      !event.source ||
      event.source !== frame.contentWindow
    ) {
      return;
    }
    const data = event.data;
    if (
      !data ||
      typeof data !== "object" ||
      data.source !== "connie-js" ||
      data.v !== 1 ||
      data.embedId !== embedId
    ) {
      return;
    }
    const payload: Record<string, unknown> =
      data.payload && typeof data.payload === "object" ? data.payload : {};
    switch (data.type) {
      case "ready":
        ready(payload.title);
        break;
      case "signed":
        if (!signedFired) {
          signedFired = true;
          call(options.onSigned);
        }
        break;
      case "close":
        finish();
        break;
      case "error":
        fail(toError(payload));
        break;
      case "navigate": {
        const target = parseAllowedUrl(payload.url);
        if (target && target.origin === frameOrigin) window.location.assign(target.href);
        break;
      }
    }
  }

  const start = (sessionUrl: URL): void => {
    frameOrigin = sessionUrl.origin;
    frame.src = withEmbedId(sessionUrl, embedId);
  };

  closeButton.addEventListener("click", () => finish());
  const embed: OpenEmbed = { overlay, frame, close: () => finish() };

  stack.push(embed);
  if (!unlockScroll) unlockScroll = lockScroll(doc);
  listen(doc, true);
  window.addEventListener("message", onMessage);
  doc.body.append(overlay);
  frame.focus();

  if (initial) {
    start(initial);
  } else {
    new Promise<string>((resolve) => resolve((fetchUrl as () => Promise<string>)())).then(
      (value) => {
        if (closed) return;
        const sessionUrl = parseAllowedUrl(value);
        if (sessionUrl) start(sessionUrl);
        else fail({ code: "invalid_url", message: "fetchUrl did not resolve with an https URL" });
      },
      (error: unknown) => {
        if (closed) return;
        const message = error instanceof Error ? error.message : String(error);
        fail({ code: "fetch_failed", message });
      },
    );
  }

  return { close: () => finish() };
}
