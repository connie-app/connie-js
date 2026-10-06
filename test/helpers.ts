import { afterEach } from "vitest";
import { openSignPage } from "../src/v1/embed.js";
import type { OpenSignPageOptions, SignPageEmbed } from "../src/types.js";

export const SESSION_URL = "https://sign.page/embed/cs_test_123";
export const FRAME_ORIGIN = "https://sign.page";

export interface Harness {
  embed: SignPageEmbed;
  overlay: HTMLElement;
  dialog: HTMLElement;
  frame: HTMLIFrameElement;
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

/** The overlays connie-js currently has on the page, oldest first. */
export const overlays = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(".connie-js-overlay"));

export function stubFrameWindow(frame: HTMLIFrameElement): Window {
  const frameWindow = { name: "frame" } as unknown as Window;
  Object.defineProperty(frame, "contentWindow", { value: frameWindow, configurable: true });
  return frameWindow;
}

export function open(options: Partial<OpenSignPageOptions> = {}): Harness {
  const embed = openSignPage(options.fetchUrl ? options : { url: SESSION_URL, ...options });
  opened.push(embed);
  const overlay = overlays().at(-1)!;
  const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
  const frame = overlay.querySelector("iframe")!;
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
  return { embed, overlay, dialog, frame, frameWindow, embedId, post };
}

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
