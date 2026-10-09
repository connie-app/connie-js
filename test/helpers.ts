import { afterEach } from "vitest";
import { openSignPage } from "../src/v1/embed.js";
import type { OpenSignPageOptions, SignPageEmbed } from "../src/types.js";

export const SESSION_URL = "https://sign.page/embed/cs_test_123";
export const FRAME_ORIGIN = "https://sign.page";

/**
 * connie-js attaches a closed shadow root, so `host.shadowRoot` is null. The
 * tests keep each root as it is attached, the way a debugger would see it.
 */
const roots = new WeakMap<Element, ShadowRoot>();
const attachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
  const root = attachShadow.call(this, init);
  roots.set(this, root);
  return root;
};

export const rootOf = (host: Element): ShadowRoot => roots.get(host)!;

export interface Harness {
  embed: SignPageEmbed;
  /** The shadow host on document.body. */
  host: HTMLElement;
  root: ShadowRoot;
  /** The element assistive technology reads as the modal dialog: the top layer's `<dialog>`, or the panel without one. */
  modal: HTMLElement;
  overlay: HTMLElement;
  /** The panel holding the frame, the skeleton and the close button. */
  dialog: HTMLElement;
  frame: HTMLIFrameElement;
  closeButton: HTMLButtonElement;
  /** The skeleton, or null once it is gone. */
  skeleton: () => HTMLElement | null;
  /** Stands in for the iframe's window, which happy-dom does not create without loading the page. */
  frameWindow: Window;
  embedId: () => string;
  post: (type: string, payload?: unknown, overrides?: Partial<MessageInit>) => void;
}

interface MessageInit {
  origin: string;
  source: unknown;
  data: unknown;
}

const opened: SignPageEmbed[] = [];

afterEach(() => {
  while (opened.length) opened.pop()!.close();
  document.body.replaceChildren();
});

/** The shadow hosts connie-js currently has on the page, oldest first. */
export const hosts = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>("[data-connie-js]"));

export function stubFrameWindow(frame: HTMLIFrameElement): Window {
  const frameWindow = { name: "frame" } as unknown as Window;
  Object.defineProperty(frame, "contentWindow", { value: frameWindow, configurable: true });
  return frameWindow;
}

export function frameOf(host: HTMLElement): HTMLIFrameElement {
  return rootOf(host).querySelector("iframe")!;
}

export function open(options: Partial<OpenSignPageOptions> = {}): Harness {
  const embed = openSignPage(options.fetchUrl ? options : { url: SESSION_URL, ...options });
  opened.push(embed);
  const host = hosts().at(-1)!;
  const root = rootOf(host);
  const modal = root.querySelector<HTMLElement>('dialog, [role="dialog"]')!;
  const overlay = root.querySelector<HTMLElement>(".overlay")!;
  const dialog = root.querySelector<HTMLElement>(".dialog")!;
  const frame = root.querySelector("iframe")!;
  const closeButton = root.querySelector<HTMLButtonElement>("button")!;
  const frameWindow = stubFrameWindow(frame);
  const embedId = () => new URL(frame.src).searchParams.get("embed_id")!;
  const post: Harness["post"] = (type, payload, overrides = {}) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: "connie-js", v: 1, embedId: embedId(), type, payload },
        origin: FRAME_ORIGIN,
        source: frameWindow,
        ...overrides,
      } as MessageEventInit),
    );
  };
  return {
    embed,
    host,
    root,
    modal,
    overlay,
    dialog,
    frame,
    closeButton,
    skeleton: () => root.querySelector<HTMLElement>(".skeleton"),
    frameWindow,
    embedId,
    post,
  };
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
