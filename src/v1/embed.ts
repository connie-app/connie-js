import type { ConnieEmbedError, OpenSignPageOptions, SignPageEmbed } from "../types.js";
import { FADE_MS, LINE_WIDTHS, shadow, type Styler } from "./styles.js";
import { parseAllowedUrl, randomId, withEmbedId } from "./url.js";

const FALLBACK_LABEL = "SignPage";
const SVG = "http://www.w3.org/2000/svg";

interface OpenEmbed {
  /** The shadow host on `document.body`; everything else is inside its closed root. */
  host: HTMLElement;
  root: ShadowRoot;
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

/**
 * Esc reaches this listener only while focus is on the host page or on
 * connie-js's close button. While focus is inside the iframe, the keystroke
 * belongs to the frame, which closes its own popovers first and otherwise
 * forwards Esc as a `close` message.
 */
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
  // Browsers retarget focus inside the shadow root to its host at the document.
  const target = event.target as Node;
  if (top && target !== top.host && !top.root.contains(target)) top.frame.focus();
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

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A placeholder of the SignPage, shown until `ready`, laid out as the SignPage
 * is so nothing moves when it fades in: the frame's header band with a title
 * bar, then on the canvas the SignPage's title and subtitle, and the paper
 * with a heading and lines of text.
 */
function skeleton(styler: Styler): HTMLElement {
  const loading = styler.part("div", "skeleton");
  loading.setAttribute("aria-hidden", "true");
  const head = styler.part("div", "head");
  head.append(styler.part("div", "bar", "title"));
  const canvas = styler.part("div", "canvas");
  const page = styler.part("div", "page");
  page.append(
    styler.part("div", "bar", "heading"),
    ...LINE_WIDTHS.map(() => styler.part("div", "bar", "line")),
  );
  canvas.append(styler.part("div", "bar", "h1"), styler.part("div", "bar", "h2"), page);
  loading.append(head, canvas);
  return loading;
}

/**
 * The modal's one close button, shown from open to teardown at the same
 * place: 40×40, 8px from the dialog's top and right edges, centred in the
 * right 56px of the frame's header band, which the frame leaves empty when
 * connie-js frames it.
 */
function closeButtonOf(doc: Document, styler: Styler): HTMLButtonElement {
  const button = styler.part("button", "close");
  button.type = "button";
  button.setAttribute("aria-label", "Close");
  const icon = doc.createElementNS(SVG, "svg");
  for (const [k, v] of [
    ["width", "20"],
    ["height", "20"],
    ["viewBox", "0 0 24 24"],
    ["fill", "none"],
    ["stroke", "currentColor"],
    ["stroke-width", "2"],
    ["stroke-linecap", "round"],
    ["stroke-linejoin", "round"],
    ["aria-hidden", "true"],
  ]) {
    icon.setAttribute(k, v);
  }
  const path = doc.createElementNS(SVG, "path");
  path.setAttribute("d", "M18 6 6 18M6 6l12 12");
  icon.append(path);
  button.append(icon);
  return button;
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

  const { host, root, styler } = shadow(doc);
  const overlay = styler.part("div", "overlay");
  const dialog = styler.part("div", "dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", FALLBACK_LABEL);
  dialog.setAttribute("aria-busy", "true");

  // The iframe sits under the skeleton from the start, invisible until `ready`.
  const frame = styler.part("iframe", "frame");
  frame.title = FALLBACK_LABEL;
  frame.setAttribute("allow", "camera");

  const loading = skeleton(styler);
  const closeButton = closeButtonOf(doc, styler);

  dialog.append(frame, loading, closeButton);
  overlay.append(dialog);
  root.append(overlay);

  const finish = (callback?: () => void): void => {
    if (closed) return;
    closed = true;
    window.removeEventListener("message", onMessage);
    const wasTop = stack[stack.length - 1] === embed;
    stack.splice(stack.indexOf(embed), 1);
    host.remove();
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
    if (dialog.hasAttribute("aria-busy")) {
      dialog.removeAttribute("aria-busy");
      styler.mark(frame, "shown");
      if (reducedMotion()) {
        loading.remove();
      } else {
        styler.mark(loading, "faded");
        setTimeout(() => loading.remove(), FADE_MS);
      }
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
  const embed: OpenEmbed = { host, root, frame, close: () => finish() };

  stack.push(embed);
  if (!unlockScroll) unlockScroll = lockScroll(doc);
  listen(doc, true);
  window.addEventListener("message", onMessage);
  doc.body.append(host);
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
