import { describe, expect, it, vi } from "vitest";
import { openSignPage } from "../src/v1/embed.js";
import { CSS } from "../src/v1/styles.js";
import {
  FRAME_ORIGIN,
  SESSION_URL,
  flush,
  frameOf,
  hosts,
  open,
  stubFrameWindow,
} from "./helpers.js";

describe("options", () => {
  it("throws without options", () => {
    expect(() => openSignPage(undefined as never)).toThrow(TypeError);
  });

  it("throws when neither url nor fetchUrl is given", () => {
    expect(() => openSignPage({})).toThrow(/exactly one of `url` and `fetchUrl`/);
  });

  it("throws when both url and fetchUrl are given", () => {
    expect(() =>
      openSignPage({ url: SESSION_URL, fetchUrl: () => Promise.resolve(SESSION_URL) }),
    ).toThrow(/exactly one/);
  });

  it("throws when fetchUrl is not a function", () => {
    expect(() => openSignPage({ fetchUrl: "https://x" as never })).toThrow(/must be a function/);
  });

  it("throws synchronously for a url that is not https, and opens nothing", () => {
    const onError = vi.fn();
    expect(() => openSignPage({ url: "http://sign.page/embed/x", onError })).toThrow(
      /must be an https URL/,
    );
    expect(() => openSignPage({ url: "javascript:alert(1)" })).toThrow(TypeError);
    expect(hosts()).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it("accepts http on localhost for development", () => {
    const { frame } = open({ url: "http://localhost:4000/embed/x" });
    expect(frame.src).toMatch(/^http:\/\/localhost:4000\/embed\/x\?embed_id=/);
  });
});

describe("the iframe", () => {
  it("frames the session url with embed_id appended", () => {
    const { frame, embedId } = open();
    expect(frame.src).toBe(`${SESSION_URL}?embed_id=${embedId()}`);
  });

  it("uses & when the session url already has a query", () => {
    const { frame, embedId } = open({ url: `${SESSION_URL}?locale=da` });
    expect(frame.src).toBe(`${SESSION_URL}?locale=da&embed_id=${embedId()}`);
  });

  it("gets a fresh embed id per call", () => {
    const a = open();
    const b = open();
    expect(a.embedId()).not.toBe(b.embedId());
  });

  it("allows the camera, is not sandboxed, and has a title", () => {
    const { frame } = open();
    expect(frame.getAttribute("allow")).toBe("camera");
    expect(frame.hasAttribute("sandbox")).toBe(false);
    expect(frame.title).toBe("SignPage");
  });
});

describe("the overlay", () => {
  it("is a modal dialog with a fallback label, busy until ready", () => {
    const { dialog } = open();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("SignPage");
    expect(dialog.getAttribute("aria-busy")).toBe("true");
  });

  it("lives in a closed shadow root on a single host appended to body", () => {
    const { host, root, dialog, frame } = open();
    expect(host.parentNode).toBe(document.body);
    expect(host.tagName).toBe("DIV");
    expect(host.shadowRoot).toBeNull();
    expect(root.mode).toBe("closed");
    expect(host.childNodes).toHaveLength(0);
    expect(dialog.getRootNode()).toBe(root);
    expect(frame.getRootNode()).toBe(root);
    expect(document.querySelector("iframe, [role=dialog], button")).toBeNull();
  });

  it("gives the host all: initial and a fixed full-viewport box, inline and !important", () => {
    const { host } = open();
    const prop = (name: string) => [
      host.style.getPropertyValue(name),
      host.style.getPropertyPriority(name),
    ];
    expect(prop("position")).toEqual(["fixed", "important"]);
    expect(prop("display")).toEqual(["block", "important"]);
    expect(prop("z-index")).toEqual(["2147483000", "important"]);
    expect(prop("top")).toEqual(["0px", "important"]);
    expect(prop("left")).toEqual(["0px", "important"]);
    expect(prop("right")).toEqual(["0px", "important"]);
    expect(host.style.getPropertyValue("all")).toBe("initial");
    expect(host.style.getPropertyPriority("all")).toBe("important");
  });

  it("styles the inside with one shared adopted stylesheet, never the document's", () => {
    const before = document.adoptedStyleSheets.length;
    const a = open();
    const b = open();
    expect(document.adoptedStyleSheets.length).toBe(before);
    expect(a.root.adoptedStyleSheets).toHaveLength(1);
    expect(a.root.adoptedStyleSheets[0]).toBe(b.root.adoptedStyleSheets[0]);
    const text = Array.from(a.root.adoptedStyleSheets[0].cssRules, (r) => r.cssText).join("\n");
    expect(text).toContain("connie-shimmer");
  });

  it("has a 760 × 900 panel, 12px radius, white, and full screen with safe-area insets below 640px", () => {
    expect(CSS).toMatch(/\.dialog\{[^}]*max-width:760px;[^}]*max-height:900px;/);
    expect(CSS).toMatch(/\.dialog\{[^}]*background:#ffffff;border-radius:12px/);
    expect(CSS).toMatch(/\.overlay\{[^}]*padding:24px;/);
    expect(CSS).toContain(
      "@media (max-width:639.98px){.overlay{padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);background:#ffffff}.dialog{max-width:none;max-height:none;border-radius:0;box-shadow:none}}",
    );
  });

  it("is laid out in the dialog's own computed styles, out of reach of hostile page styles", () => {
    const hostile = new CSSStyleSheet();
    hostile.replaceSync(
      "*{all:unset}button{display:none!important}iframe{display:none!important;opacity:.1!important}div{display:none!important}",
    );
    document.adoptedStyleSheets = [hostile];
    try {
      const { host, dialog, frame, closeButton } = open();
      expect(getComputedStyle(dialog).maxWidth).toBe("760px");
      expect(getComputedStyle(dialog).borderRadius).toBe("12px");
      expect(getComputedStyle(closeButton).display).toBe("flex");
      expect(getComputedStyle(closeButton).width).toBe("40px");
      expect(getComputedStyle(frame).display).toBe("block");
      expect(getComputedStyle(frame).opacity).toBe("0");
      expect(getComputedStyle(host).position).toBe("fixed");
      expect(getComputedStyle(host).display).toBe("block");
    } finally {
      document.adoptedStyleSheets = [];
    }
  });
});

describe("the close button", () => {
  it("is a labelled button with an SVG X drawn through the DOM", () => {
    const { closeButton } = open();
    expect(closeButton.type).toBe("button");
    expect(closeButton.getAttribute("aria-label")).toBe("Close");
    expect(closeButton.textContent).toBe("");
    const svg = closeButton.firstElementChild!;
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.getAttribute("width")).toBe("20");
    expect(svg.getAttribute("height")).toBe("20");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.querySelector("path")!.getAttribute("d")).toBe("M18 6 6 18M6 6l12 12");
  });

  it("is 40 × 40 at 8px from the dialog's top and right, above the frame, in Connie's colours", () => {
    const { closeButton, frame } = open();
    const style = getComputedStyle(closeButton);
    expect([style.position, style.top, style.right, style.width, style.height]).toEqual([
      "absolute",
      "8px",
      "8px",
      "40px",
      "40px",
    ]);
    expect(style.borderRadius).toBe("8px");
    expect(Number(style.zIndex)).toBeGreaterThan(Number(getComputedStyle(frame).zIndex));
    expect(CSS).toMatch(/\.close\{[^}]*color:#525252/);
    expect(CSS).toContain(".close:hover{background:#f5f5f5}");
    expect(CSS).toContain(".close:focus-visible{outline:2px solid #9e36ff;outline-offset:2px}");
  });

  it("is the same element, in the same place, from open to teardown", () => {
    const h = open();
    const place = () => {
      const style = getComputedStyle(h.closeButton);
      return [style.position, style.top, style.right, style.zIndex];
    };
    const buttons = () => Array.from(h.root.querySelectorAll("button"));
    const before = place();
    expect(buttons()).toEqual([h.closeButton]);
    h.post("ready", { title: "Data processing addendum" });
    expect(buttons()).toEqual([h.closeButton]);
    expect(h.closeButton.parentNode).toBe(h.dialog);
    expect(place()).toEqual(before);
    h.post("signed");
    expect(buttons()).toEqual([h.closeButton]);
    expect(place()).toEqual(before);
  });

  it("tears down and calls onClose once, before ready", () => {
    const onClose = vi.fn();
    const { closeButton } = open({ onClose });
    closeButton.click();
    closeButton.click();
    expect(hosts()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("tears down and calls onClose once, after ready", () => {
    const onClose = vi.fn();
    const { closeButton, post } = open({ onClose });
    post("ready", { title: "T" });
    closeButton.click();
    expect(hosts()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("the skeleton", () => {
  it("is a hidden placeholder of the SignPage: a header band with a title bar, then the title, subtitle and paper on the canvas", () => {
    const { skeleton, dialog } = open();
    const el = skeleton()!;
    expect(el.parentNode).toBe(dialog);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    const [head, canvas] = Array.from(el.children);
    expect(head.className).toBe("head");
    expect(Array.from(head.children, (c) => c.className)).toEqual(["bar title"]);
    expect(canvas.className).toBe("canvas");
    expect(Array.from(canvas.children, (c) => c.className)).toEqual(["bar h1", "bar h2", "page"]);
    const page = canvas.lastElementChild!;
    const lines = Array.from(page.children).filter((c) => c.className === "bar line");
    expect(page.firstElementChild!.className).toBe("bar heading");
    expect(lines.length).toBeGreaterThanOrEqual(8);
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(getComputedStyle(head).height).toBe("56px");
  });

  it("matches the frame's header band and colours, and shimmers", () => {
    expect(CSS).toMatch(
      /\.head\{[^}]*height:56px;padding:0 72px 0 16px;[^}]*border-bottom:1px solid #e5e5e5/,
    );
    expect(CSS).toMatch(/\.head\{[^}]*background:#ffffff/);
    expect(CSS).toMatch(/\.skeleton\{[^}]*background:#e2e8f0/);
    expect(CSS).toMatch(/\.title\{width:40%/);
    expect(CSS).toMatch(/\.bar\{[^}]*#ebebeb[^}]*animation:connie-shimmer/);
    expect(CSS).toMatch(/\.h1\{[^}]*#cbd5e1/);
    expect(CSS).toMatch(/\.h2\{[^}]*#cbd5e1/);
    expect(CSS).toContain("@keyframes connie-shimmer");
  });

  it("lays the paper out where the SignPage's own sits, so nothing moves on ready", () => {
    // The column: 48px above the title and 24px either side of the paper, the
    // title's 32px line and the subtitle's 28px line 8px apart, then 48px to
    // the paper, which is square with 96px by 48px of padding.
    expect(CSS).toMatch(/\.canvas\{[^}]*padding:48px 24px 0;/);
    expect(CSS).toMatch(/\.canvas\{[^}]*scrollbar-gutter:stable/);
    expect(CSS).toMatch(/\.h1\{[^}]*height:24px;margin:4px auto 0;/);
    expect(CSS).toMatch(/\.h2\{[^}]*height:18px;margin:17px auto 0;/);
    expect(CSS).toMatch(
      /\.page\{max-width:848px;[^}]*margin:53px auto 0;padding:96px 48px 0;[^}]*border-radius:0;background:#ffffff;box-shadow:/,
    );
  });

  it("narrows the column with the frame, not the host page, below 640px", () => {
    expect(CSS).toMatch(/\.skeleton\{[^}]*container-type:inline-size/);
    expect(CSS).toContain(
      "@container (max-width:639.98px){.canvas{padding:32px 16px 0}.page{margin-top:37px}}",
    );
  });

  it("stops shimmering and fading under prefers-reduced-motion", () => {
    expect(CSS).toContain(
      "@media (prefers-reduced-motion:reduce){.bar{animation:none}.frame,.skeleton{transition:none}}",
    );
  });

  it("covers the frame until ready, then cross-fades to it and is removed", () => {
    vi.useFakeTimers();
    try {
      const { skeleton, frame, dialog, post } = open();
      const el = skeleton()!;
      expect(getComputedStyle(frame).opacity).toBe("0");
      expect(getComputedStyle(el).opacity).not.toBe("0");
      expect(Number(getComputedStyle(el).zIndex)).toBeGreaterThan(
        Number(getComputedStyle(frame).zIndex),
      );
      expect(CSS).toMatch(/\.frame\{[^}]*transition:opacity 200ms/);
      expect(CSS).toMatch(/\.skeleton\{[^}]*transition:opacity 200ms/);

      post("ready", { title: "T" });
      expect(dialog.hasAttribute("aria-busy")).toBe(false);
      expect(getComputedStyle(frame).opacity).toBe("1");
      expect(skeleton()).toBe(el);
      expect(getComputedStyle(el).opacity).toBe("0");

      vi.advanceTimersByTime(200);
      expect(skeleton()).toBeNull();
      expect(el.isConnected).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is swapped for the frame at once under prefers-reduced-motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: query.includes("reduce"), media: query })),
    );
    try {
      const { skeleton, frame, post } = open();
      expect(skeleton()).not.toBeNull();
      post("ready", { title: "T" });
      expect(skeleton()).toBeNull();
      expect(getComputedStyle(frame).opacity).toBe("1");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("focus", () => {
  it("moves into the iframe on open and back to the previously focused element on close", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const { embed, frame, host, root } = open();
    expect(document.activeElement).toBe(host);
    expect(root.activeElement).toBe(frame);
    embed.close();
    expect(document.activeElement).toBe(button);
  });

  it("is kept inside the dialog", () => {
    const outside = document.createElement("input");
    document.body.append(outside);
    const { frame, root } = open();
    outside.focus();
    expect(root.activeElement).toBe(frame);
  });

  it("may rest on the close button, inside the shadow root", () => {
    const { closeButton, host, root } = open();
    closeButton.focus();
    expect(document.activeElement).toBe(host);
    expect(root.activeElement).toBe(closeButton);
  });

  it("stays on the close button when ready arrives", () => {
    const { closeButton, root, post } = open();
    closeButton.focus();
    post("ready", { title: "Data processing addendum" });
    expect(root.activeElement).toBe(closeButton);
  });

  it("moves to the next embed's iframe when the top one closes", () => {
    const a = open();
    const b = open();
    b.embed.close();
    expect(document.activeElement).toBe(a.host);
    expect(a.root.activeElement).toBe(a.frame);
  });
});

describe("scroll lock", () => {
  it("locks the host page's scroll while open and restores it after", () => {
    const root = document.documentElement;
    expect(root.hasAttribute("style")).toBe(false);
    const { embed } = open();
    expect(root.style.overflow).toBe("hidden");
    embed.close();
    expect(root.style.overflow).toBe("");
    expect(root.hasAttribute("style")).toBe(false);
  });

  it("restores an inline overflow the host had set", () => {
    const root = document.documentElement;
    root.style.overflow = "scroll";
    const { embed } = open();
    expect(root.style.overflow).toBe("hidden");
    embed.close();
    expect(root.style.overflow).toBe("scroll");
    root.removeAttribute("style");
  });

  it("stays locked until the last of several embeds closes", () => {
    const root = document.documentElement;
    const a = open();
    const b = open();
    a.embed.close();
    expect(root.style.overflow).toBe("hidden");
    b.embed.close();
    expect(root.style.overflow).toBe("");
  });
});

describe("Esc", () => {
  const esc = () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  it("closes the embed and calls onClose once", () => {
    const onClose = vi.fn();
    open({ onClose });
    esc();
    esc();
    expect(hosts()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes only the topmost of two embeds", () => {
    const first = vi.fn();
    const second = vi.fn();
    const a = open({ onClose: first });
    open({ onClose: second });
    esc();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(hosts()).toEqual([a.host]);
  });

  it("closes while focus is on the close button inside the shadow root", () => {
    const onClose = vi.fn();
    const { closeButton } = open({ onClose });
    closeButton.focus();
    closeButton.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(hosts()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("ignores other keys", () => {
    open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(hosts()).toHaveLength(1);
  });
});

describe("messages", () => {
  it("ready: shows the frame, labels the dialog and iframe with the title, calls onReady once", () => {
    const onReady = vi.fn();
    const { dialog, frame, closeButton, post } = open({ onReady });
    post("ready", { title: "AI Processing Addendum" });
    expect(getComputedStyle(frame).opacity).toBe("1");
    expect(closeButton.isConnected).toBe(true);
    expect(dialog.hasAttribute("aria-busy")).toBe(false);
    expect(dialog.getAttribute("aria-label")).toBe("AI Processing Addendum");
    expect(frame.title).toBe("AI Processing Addendum");
    post("ready", { title: "AI Processing Addendum" });
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("ready without a usable title keeps the fallback label", () => {
    const { dialog, post } = open();
    post("ready", { title: 42 });
    expect(dialog.getAttribute("aria-label")).toBe("SignPage");
    post("ready");
    expect(dialog.getAttribute("aria-label")).toBe("SignPage");
  });

  it("signed: calls onSigned once and keeps the modal open on the frame's confirmation", () => {
    const calls: string[] = [];
    const { post } = open({
      onSigned: () => calls.push("signed"),
      onClose: () => calls.push("close"),
    });
    post("ready", { title: "T" });
    post("signed");
    post("signed");
    expect(hosts()).toHaveLength(1);
    expect(calls).toEqual(["signed"]);
  });

  it("signed: the frame's close after signing tears down and calls onClose once", () => {
    const calls: string[] = [];
    const { post } = open({
      onSigned: () => calls.push("signed"),
      onClose: () => calls.push("close"),
    });
    post("signed");
    post("close");
    expect(hosts()).toHaveLength(0);
    expect(calls).toEqual(["signed", "close"]);
  });

  it("signed: the host can auto-close with embed.close() inside onSigned", () => {
    const calls: string[] = [];
    const embed = openSignPage({
      url: SESSION_URL,
      onSigned: () => {
        calls.push("signed");
        embed.close();
      },
      onClose: () => calls.push("close"),
    });
    const frame = frameOf(hosts()[0]);
    const frameWindow = stubFrameWindow(frame);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: "connie-js",
          v: 1,
          embedId: new URL(frame.src).searchParams.get("embed_id"),
          type: "signed",
        },
        origin: FRAME_ORIGIN,
        source: frameWindow,
      }),
    );
    expect(hosts()).toHaveLength(0);
    expect(calls).toEqual(["signed", "close"]);
  });

  it("close: tears down and calls onClose once", () => {
    const onClose = vi.fn();
    const { post, embed } = open({ onClose });
    post("close");
    post("close");
    embed.close();
    expect(hosts()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("error: calls onError with the payload, tears down, then onClose", () => {
    const calls: unknown[] = [];
    const { post } = open({
      onError: (e) => calls.push(e),
      onClose: () => calls.push("close"),
    });
    post("error", { code: "expired", message: "This link has expired." });
    expect(hosts()).toHaveLength(0);
    expect(calls).toEqual([{ code: "expired", message: "This link has expired." }, "close"]);
  });

  it.each(["unavailable", "no_credits"])("error: passes %s through", (code) => {
    const onError = vi.fn();
    open({ onError }).post("error", { code, message: "m" });
    expect(onError).toHaveBeenCalledWith({ code, message: "m" });
  });

  it("error: normalises a malformed payload", () => {
    const onError = vi.fn();
    open({ onError }).post("error", "boom");
    expect(onError).toHaveBeenCalledWith({ code: "unknown", message: "" });
  });

  it("error: logs to the console when there is no onError", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    open().post("error", { code: "expired", message: "gone" });
    expect(log).toHaveBeenCalledWith("Connie: expired: gone");
  });

  it("navigate: moves the host page to a same-origin https url, without callbacks", () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    const callbacks = { onReady: vi.fn(), onSigned: vi.fn(), onClose: vi.fn(), onError: vi.fn() };
    const { post } = open(callbacks);
    post("navigate", { url: `${FRAME_ORIGIN}/openid/authorize/state123` });
    expect(assign).toHaveBeenCalledWith(`${FRAME_ORIGIN}/openid/authorize/state123`);
    for (const fn of Object.values(callbacks)) expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    ["another origin", "https://evil.example/openid/authorize/x"],
    ["plain http on the frame's host", "http://sign.page/openid/authorize/x"],
    ["javascript:", "javascript:alert(document.domain)"],
    ["a relative url", "/openid/authorize/x"],
    ["a non-string", 12],
  ])("navigate: ignores %s", (_name, url) => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    open().post("navigate", { url });
    expect(assign).not.toHaveBeenCalled();
  });

  it("ignores unknown message types", () => {
    const onClose = vi.fn();
    open({ onClose }).post("resize", { height: 10 });
    expect(hosts()).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("message rejection", () => {
  const cases: Array<[string, (h: ReturnType<typeof open>) => void]> = [
    ["from another origin", (h) => h.post("close", undefined, { origin: "https://evil.example" })],
    [
      "from the right origin but another window",
      (h) => h.post("close", undefined, { source: window }),
    ],
    ["without a source", (h) => h.post("close", undefined, { source: null })],
    [
      "with another embedId",
      (h) =>
        h.post("close", undefined, {
          data: { source: "connie-js", v: 1, embedId: "other", type: "close" },
        }),
    ],
    [
      "without the connie-js source tag",
      (h) =>
        h.post("close", undefined, {
          data: { source: "other", v: 1, embedId: h.embedId(), type: "close" },
        }),
    ],
    [
      "with another protocol version",
      (h) =>
        h.post("close", undefined, {
          data: { source: "connie-js", v: 2, embedId: h.embedId(), type: "close" },
        }),
    ],
    ["that is a string", (h) => h.post("close", undefined, { data: "close" })],
  ];

  it.each(cases)("ignores a message %s", (_name, send) => {
    const onClose = vi.fn();
    const h = open({ onClose });
    send(h);
    expect(hosts()).toHaveLength(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("two embeds", () => {
  it("never cross: each reacts only to its own frame's messages", () => {
    const a = { onSigned: vi.fn(), onClose: vi.fn() };
    const b = { onSigned: vi.fn(), onClose: vi.fn() };
    const ha = open(a);
    const hb = open(b);

    // b's frame replaying a's embedId is still b's window, so a ignores it.
    hb.post("signed", undefined, {
      data: { source: "connie-js", v: 1, embedId: ha.embedId(), type: "signed" },
    });
    expect(a.onSigned).not.toHaveBeenCalled();
    expect(b.onSigned).not.toHaveBeenCalled();

    ha.post("signed");
    expect(a.onSigned).toHaveBeenCalledOnce();
    expect(b.onSigned).not.toHaveBeenCalled();

    ha.post("close");
    expect(a.onClose).toHaveBeenCalledOnce();
    expect(b.onClose).not.toHaveBeenCalled();
    expect(hosts()).toEqual([hb.host]);

    hb.post("close");
    expect(b.onClose).toHaveBeenCalledOnce();
    expect(a.onClose).toHaveBeenCalledOnce();
  });
});

describe("embed.close()", () => {
  it("tears down and calls onClose exactly once", () => {
    const onClose = vi.fn();
    const { embed } = open({ onClose });
    embed.close();
    embed.close();
    expect(hosts()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stops listening for messages", () => {
    const onSigned = vi.fn();
    const { embed, post } = open({ onSigned });
    embed.close();
    post("signed");
    expect(onSigned).not.toHaveBeenCalled();
  });

  it("still closes when a callback throws", async () => {
    vi.useFakeTimers();
    const { post } = open({
      onSigned: () => {
        throw new Error("host bug");
      },
    });
    post("signed");
    post("close");
    expect(hosts()).toHaveLength(0);
    expect(() => vi.runAllTimers()).toThrow("host bug");
    vi.useRealTimers();
  });
});

describe("fetchUrl", () => {
  it("shows the skeleton while fetching, then frames the url it resolves with", async () => {
    let resolve!: (url: string) => void;
    const fetchUrl = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const { frame, skeleton } = open({ fetchUrl });
    expect(skeleton()).not.toBeNull();
    expect(frame.getAttribute("src")).toBeNull();
    resolve(SESSION_URL);
    await flush();
    expect(fetchUrl).toHaveBeenCalledOnce();
    expect(frame.src).toMatch(new RegExp(`^${SESSION_URL}\\?embed_id=`));
  });

  it("reports fetch_failed when it rejects, then closes", async () => {
    const calls: unknown[] = [];
    open({
      fetchUrl: () => Promise.reject(new Error("backend down")),
      onError: (e) => calls.push(e),
      onClose: () => calls.push("close"),
    });
    await flush();
    expect(calls).toEqual([{ code: "fetch_failed", message: "backend down" }, "close"]);
    expect(hosts()).toHaveLength(0);
  });

  it("reports fetch_failed when it throws synchronously", async () => {
    const onError = vi.fn();
    open({
      fetchUrl: () => {
        throw new Error("nope");
      },
      onError,
    });
    await flush();
    expect(onError).toHaveBeenCalledWith({ code: "fetch_failed", message: "nope" });
  });

  it("reports invalid_url when it resolves with something that is not https", async () => {
    const onError = vi.fn();
    open({ fetchUrl: () => Promise.resolve("http://sign.page/embed/x"), onError });
    await flush();
    expect(onError).toHaveBeenCalledWith({
      code: "invalid_url",
      message: "fetchUrl did not resolve with an https URL",
    });
    expect(hosts()).toHaveLength(0);
  });

  it("does nothing when the embed was closed before it resolved", async () => {
    let resolve!: (url: string) => void;
    const onError = vi.fn();
    const { embed, frame } = open({ fetchUrl: () => new Promise((r) => (resolve = r)), onError });
    embed.close();
    resolve(SESSION_URL);
    await flush();
    expect(frame.getAttribute("src")).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("accepts messages only from the origin of the url it resolved with", async () => {
    const onClose = vi.fn();
    const h = open({
      fetchUrl: () => Promise.resolve("https://sign.customer.com/embed/x"),
      onClose,
    });
    await flush();
    h.post("close");
    expect(onClose).not.toHaveBeenCalled();
    h.post("close", undefined, { origin: "https://sign.customer.com" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
