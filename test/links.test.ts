import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedHosts, enhanceLinks, READY_TIMEOUT_MS, runningScript } from "../src/v1/links.js";
import { frameOf, hosts, rootOf, stubFrameWindow } from "./helpers.js";

// The script tag a site's author writes, listing their custom sign domain and
// a local development host.
const script = document.createElement("script");
script.setAttribute("data-connie-hosts", "SIGN.customer.com, sign.connie.localhost:4000");
enhanceLinks(document, allowedHosts(script));

const PAGE = "https://app.example.com";
const frameUrl = (pin: string, host = "https://sign.page") =>
  `${host}/${pin}/embed?origin=${encodeURIComponent(PAGE)}`;

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

/**
 * A click as the visitor makes it. Browsers mark those `isTrusted`, and a
 * click a script dispatches not; happy-dom marks none, so the test does.
 */
function click(target: Element, init: MouseEventInit = {}, trusted = true): void {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  if (trusted) Object.defineProperty(event, "isTrusted", { value: true });
  target.dispatchEvent(event);
}

/** Posts a message to the page as the SignPage in `frame` would. */
function post(frame: HTMLIFrameElement, type: string, payload: unknown = {}): void {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { source: "connie-js", v: 1, embedId: embedIdOf(frame), type, payload },
      origin: new URL(frame.src).origin,
      source: stubFrameWindow(frame),
    } as MessageEventInit),
  );
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

  it("send the page's origin and nothing else of its location", () => {
    history.replaceState(null, "", "/members/join?token=secret#section-2");
    try {
      expect(location.href).toBe(PAGE + "/members/join?token=secret#section-2");
      click(link("https://sign.page/EA0990"));
      const src = frameOf(hosts()[0]).src;
      expect(src).toBe(`${frameUrl("EA0990")}&embed_id=${embedIdOf(frameOf(hosts()[0]))}`);
      for (const part of ["members", "join", "token", "secret", "section-2", "return_url"]) {
        expect(src).not.toContain(part);
      }
    } finally {
      history.replaceState(null, "", "/");
    }
  });

  it("frame the allowed host, with the camera allowed", () => {
    click(link("https://sign.page/EA0990"));
    const frame = frameOf(hosts()[0]);
    expect(new URL(frame.src).host).toBe("sign.page");
    expect(frame.getAttribute("allow")).toBe("camera");
  });

  it("keep a custom domain listed in data-connie-hosts and accept a trailing slash", () => {
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

  it("accept http on a loopback host listed with its port", () => {
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
    ["a host not allowed", "https://evil.example/EA0990", {}],
    ["a sign.page lookalike", "https://sign.page.evil.example/EA0990", {}],
    ["a subdomain of an allowed host", "https://x.sign.page/EA0990", {}],
    ["an allowed host on another port", "https://sign.customer.com:8443/EA0990", {}],
    ["a listed loopback host on another port", "http://sign.connie.localhost:4001/EA0990", {}],
    ["an unlisted loopback host", "http://localhost:4000/EA0990", {}],
  ])("open normally with %s", (_name, href, attrs) => {
    click(link(href, attrs));
    expect(prevented).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  it("never create a frame for a host that is not allowed, so nothing there gets the camera or a navigate", () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    click(link("https://evil.example/EA0990"));
    expect(hosts()).toHaveLength(0);
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
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
    post(frameOf(hosts()[0]), "error", { code: "not_allowed", message: "m" });
    expect(hosts()).toHaveLength(0);
    expect(assign).toHaveBeenCalledWith("https://sign.page/EA0990");
  });

  it("go to the address checked at the click when the embed fails, though the href changed since", () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    const a = link("https://sign.page/EA0990");
    click(a);
    a.setAttribute("href", "javascript:void(window.pwned = true)");
    post(frameOf(hosts()[0]), "error", { code: "not_allowed", message: "m" });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("https://sign.page/EA0990");
  });

  it("open normally on a click a script dispatched, which the visitor did not make", () => {
    click(link("https://sign.page/EA0990"), {}, false);
    expect(prevented).toBe(false);
    expect(hosts()).toHaveLength(0);
  });

  describe("that never get ready", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("close and go to the address checked at the click after READY_TIMEOUT_MS", () => {
      const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
      const a = link("https://sign.customer.com/EA0990");
      click(a);
      a.setAttribute("href", "https://evil.example/phish");
      vi.advanceTimersByTime(READY_TIMEOUT_MS - 1);
      expect(hosts()).toHaveLength(1);
      expect(assign).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(hosts()).toHaveLength(0);
      expect(assign).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith("https://sign.customer.com/EA0990");
    });

    it("stay open once the SignPage is ready", () => {
      const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
      click(link("https://sign.page/EA0990"));
      post(frameOf(hosts()[0]), "ready", { title: "t" });
      vi.advanceTimersByTime(READY_TIMEOUT_MS * 2);
      expect(hosts()).toHaveLength(1);
      expect(assign).not.toHaveBeenCalled();
    });

    it("go nowhere once the visitor closed the modal", () => {
      const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
      click(link("https://sign.page/EA0990"));
      rootOf(hosts()[0]).querySelector<HTMLButtonElement>("button")!.click();
      vi.advanceTimersByTime(READY_TIMEOUT_MS * 2);
      expect(assign).not.toHaveBeenCalled();
    });

    it("go to the SignPage's own page once when it fails before the timeout", () => {
      const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
      click(link("https://sign.page/EA0990"));
      post(frameOf(hosts()[0]), "error", { code: "unavailable", message: "m" });
      vi.advanceTimersByTime(READY_TIMEOUT_MS * 2);
      expect(assign).toHaveBeenCalledTimes(1);
    });
  });
});

describe("allowedHosts", () => {
  const tag = (value?: string) => {
    const el = document.createElement("script");
    if (value !== undefined) el.setAttribute("data-connie-hosts", value);
    return el;
  };

  it("is sign.page alone without a script tag or attribute", () => {
    expect([...allowedHosts(null)]).toEqual(["sign.page"]);
    expect([...allowedHosts(tag())]).toEqual(["sign.page"]);
  });

  it("adds the listed hosts, space- or comma-separated, lowercased, ports kept", () => {
    expect([...allowedHosts(tag(" Sign.Customer.com,sign.other.dk  localhost:4002 "))]).toEqual([
      "sign.page",
      "sign.customer.com",
      "sign.other.dk",
      "localhost:4002",
    ]);
  });

  it("normalises each listed host as a link's host is: punycode, no default port", () => {
    expect([
      ...allowedHosts(tag("sign.bücher.example sign.customer.com:443 local.localhost:4000")),
    ]).toEqual([
      "sign.page",
      "sign.xn--bcher-kva.example",
      "sign.customer.com",
      "local.localhost:4000",
    ]);
  });

  it("drops entries that are not a bare host", () => {
    expect([
      ...allowedHosts(
        tag(
          "evil.example/x user@evil.example evil.example?q evil.example#f bad:port [zz] sign.ok.dk",
        ),
      ),
    ]).toEqual(["sign.page", "sign.ok.dk"]);
  });
});

describe("runningScript", () => {
  // The browser's own getter, stood in for on the document's prototype.
  const proto = Object.getPrototypeOf(document);
  const original = Object.getOwnPropertyDescriptor(proto, "currentScript");
  let current: Element | null = null;

  beforeEach(() => {
    current = null;
    Object.defineProperty(proto, "currentScript", { get: () => current, configurable: true });
  });

  afterEach(() => {
    if (original) Object.defineProperty(proto, "currentScript", original);
    else delete proto.currentScript;
    delete (document as { currentScript?: unknown }).currentScript;
  });

  /**
   * Makes `el` what `document.currentScript` returns, the way browsers expose
   * an `<img name="currentScript">` or `<form name="currentScript">`: a named
   * property on the document itself, ahead of the prototype's getter.
   */
  const clobber = (el: Element) => {
    el.setAttribute("name", "currentScript");
    el.setAttribute("data-connie-hosts", "evil.example");
    document.body.append(el);
    Object.defineProperty(document, "currentScript", { get: () => el, configurable: true });
  };

  it("is the script tag running", () => {
    const script = document.createElement("script");
    script.setAttribute("data-connie-hosts", "sign.customer.com");
    current = script;
    expect(runningScript(document)).toBe(script);
    expect(allowedHosts(runningScript(document)).has("sign.customer.com")).toBe(true);
  });

  it.each([
    ["an <img name=currentScript>", "img"],
    ["a <form name=currentScript>", "form"],
  ])("is not %s in the page's markup", (_name, tagName) => {
    const script = document.createElement("script");
    script.setAttribute("data-connie-hosts", "sign.customer.com");
    current = script;
    clobber(document.createElement(tagName));
    expect(runningScript(document)).toBe(script);
    expect([...allowedHosts(runningScript(document))]).toEqual(["sign.page", "sign.customer.com"]);
  });

  it.each([
    ["an <img>", "img"],
    ["a <form>", "form"],
  ])("is null, never %s, whatever currentScript returns", (_name, tagName) => {
    const el = document.createElement(tagName);
    el.setAttribute("data-connie-hosts", "evil.example");
    current = el;
    expect(runningScript(document)).toBeNull();
    expect([...allowedHosts(runningScript(document))]).toEqual(["sign.page"]);
  });

  it("is null while no script runs, even with a clobbering element", () => {
    clobber(document.createElement("img"));
    expect(runningScript(document)).toBeNull();
  });
});
