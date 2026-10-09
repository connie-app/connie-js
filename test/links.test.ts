import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enhanceLinks } from "../src/v1/links.js";
import { frameOf, hosts, rootOf, stubFrameWindow } from "./helpers.js";

enhanceLinks(document);

const PAGE = "https://app.example.com";
const frameUrl = (pin: string, host = "https://sign.page") =>
  `${host}/${pin}/embed?origin=${encodeURIComponent(PAGE)}` +
  `&return_url=${encodeURIComponent(PAGE + "/")}`;

/**
 * Whether connie-js prevented the last click, read after it, at the window,
 * which then prevents it anyway so happy-dom does not follow the link.
 */
let prevented: boolean | null = null;
const record = (event: Event) => {
  prevented = event.defaultPrevented;
  event.preventDefault();
};

beforeEach(() => {
  prevented = null;
  window.addEventListener("click", record);
});

afterEach(() => {
  window.removeEventListener("click", record);
  for (const host of hosts()) rootOf(host).querySelector<HTMLButtonElement>("button")!.click();
});

function link(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = "Sign the agreement";
  a.setAttribute("data-connie-signpage", "");
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  document.body.append(a);
  return a;
}

function click(target: Element, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
}

const embedIdOf = (frame: HTMLIFrameElement) => new URL(frame.src).searchParams.get("embed_id")!;

describe("data-connie-signpage links", () => {
  it("open the SignPage in the modal, framed at /<pin>/embed with the page's origin", () => {
    click(link("https://sign.page/EA0990"));
    expect(prevented).toBe(true);
    expect(hosts()).toHaveLength(1);
    const frame = frameOf(hosts()[0]);
    expect(frame.src).toBe(`${frameUrl("EA0990")}&embed_id=${embedIdOf(frame)}`);
    expect(embedIdOf(frame)).toBeTruthy();
  });

  it("keep a custom domain and accept a trailing slash", () => {
    click(link("https://sign.customer.com/EA0990/"));
    expect(
      frameOf(hosts()[0]).src.startsWith(frameUrl("EA0990", "https://sign.customer.com")),
    ).toBe(true);
  });

  it("each open their own SignPage, two on one page", () => {
    const first = link("https://sign.page/AA1111");
    const second = link("https://sign.page/BB2222");
    click(second);
    click(first);
    expect(hosts().map((host) => new URL(frameOf(host).src).pathname)).toEqual([
      "/BB2222/embed",
      "/AA1111/embed",
    ]);
  });

  it("work for a link added after the script loaded", async () => {
    await Promise.resolve();
    const later = link("https://sign.page/EA0990");
    click(later);
    expect(hosts()).toHaveLength(1);
  });

  it("open on keyboard activation, a click with detail 0", () => {
    click(link("https://sign.page/EA0990"), { detail: 0 });
    expect(prevented).toBe(true);
    expect(hosts()).toHaveLength(1);
  });

  it("open from a click on an element inside the link", () => {
    const a = link("https://sign.page/EA0990");
    const span = document.createElement("span");
    a.replaceChildren(span);
    click(span);
    expect(hosts()).toHaveLength(1);
  });

  it("accept http on a loopback host for development", () => {
    click(link("http://sign.connie.localhost:4000/EA0990"));
    expect(new URL(frameOf(hosts()[0]).src).origin).toBe("http://sign.connie.localhost:4000");
  });

  it.each([
    ["ctrl", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["alt", { altKey: true }],
    ["the middle button", { button: 1 }],
  ])("open normally on a %s click", (_name, init) => {
    click(link("https://sign.page/EA0990"), init);
    expect(prevented).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it.each([
    ["target=_blank", "https://sign.page/EA0990", { target: "_blank" }],
    ["target=other", "https://sign.page/EA0990", { target: "other" }],
    ["more than one path segment", "https://sign.page/EA0990/qr", {}],
    ["no path", "https://sign.page/", {}],
    ["plain http on a public host", "http://sign.page/EA0990", {}],
    ["javascript:", "javascript:void(0)", {}],
  ])("open normally with %s", (_name, href, attrs) => {
    click(link(href, attrs));
    expect(prevented).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it("are enhanced with target=_self", () => {
    click(link("https://sign.page/EA0990", { target: "_SELF" }));
    expect(hosts()).toHaveLength(1);
  });

  it("leave a click the page already handled alone", () => {
    const a = link("https://sign.page/EA0990");
    a.addEventListener("click", (event) => event.preventDefault());
    click(a);
    expect(hosts()).toHaveLength(0);
  });

  it("leave links without the attribute alone", () => {
    const a = link("https://sign.page/EA0990");
    a.removeAttribute("data-connie-signpage");
    click(a);
    expect(prevented).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it("go to the SignPage's own page when the embed fails", () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    click(link("https://sign.page/EA0990"));
    const frame = frameOf(hosts()[0]);
    const frameWindow = stubFrameWindow(frame);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: "connie-js",
          v: 1,
          embedId: embedIdOf(frame),
          type: "error",
          payload: { code: "not_allowed", message: "m" },
        },
        origin: "https://sign.page",
        source: frameWindow,
      } as MessageEventInit),
    );
    expect(hosts()).toHaveLength(0);
    expect(assign).toHaveBeenCalledWith("https://sign.page/EA0990");
  });
});
