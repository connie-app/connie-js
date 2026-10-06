import { describe, expect, it, vi } from "vitest";
import { openSignPage } from "../src/v1/embed.js";
import { CSS } from "../src/v1/styles.js";
import { FRAME_ORIGIN, SESSION_URL, flush, open, overlays } from "./helpers.js";

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
    expect(overlays()).toHaveLength(0);
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

  it("uses namespaced class names only", () => {
    const { overlay } = open();
    const classes = [overlay, ...overlay.querySelectorAll("*")].map((el) => el.className);
    expect(classes).toEqual([
      "connie-js-overlay",
      "connie-js-dialog",
      "connie-js-frame",
      "connie-js-loading",
      "connie-js-spinner",
      "connie-js-close",
    ]);
  });

  it("styles itself with an adopted stylesheet: top z-index, spinner keyframes, full screen below 640px", () => {
    open();
    const sheet = document.adoptedStyleSheets.at(-1)!;
    const text = Array.from(sheet.cssRules, (r) => r.cssText).join("\n");
    expect(CSS).toContain("z-index:2147483000");
    expect(text).toContain("2147483000");
    expect(CSS).toContain("@keyframes connie-js-spin");
    expect(CSS).toMatch(
      /@media \(max-width:639\.98px\)\{\.connie-js-overlay\{padding:0!important\}\.connie-js-dialog\{max-width:none!important;max-height:none!important;border-radius:0!important/,
    );
  });

  it("adopts the stylesheet once however many embeds open", () => {
    open();
    const count = document.adoptedStyleSheets.length;
    open();
    open();
    expect(document.adoptedStyleSheets.length).toBe(count);
  });

  it("shows a spinner and a close button until ready", () => {
    const { overlay } = open();
    expect(overlay.querySelector(".connie-js-spinner")).not.toBeNull();
    const close = overlay.querySelector<HTMLButtonElement>(".connie-js-close")!;
    expect(close.type).toBe("button");
    expect(close.getAttribute("aria-label")).toBe("Close");
  });

  it("closes from its own close button before ready", () => {
    const onClose = vi.fn();
    const { overlay } = open({ onClose });
    overlay.querySelector<HTMLButtonElement>(".connie-js-close")!.click();
    expect(overlays()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("focus", () => {
  it("moves into the iframe on open and back to the previously focused element on close", () => {
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();
    const { embed, frame } = open();
    expect(document.activeElement).toBe(frame);
    embed.close();
    expect(document.activeElement).toBe(button);
  });

  it("is kept inside the dialog", () => {
    const outside = document.createElement("input");
    document.body.append(outside);
    const { frame } = open();
    outside.focus();
    expect(document.activeElement).toBe(frame);
  });

  it("moves from the close button to the iframe when ready removes the button", () => {
    const { overlay, frame, post } = open();
    overlay.querySelector<HTMLButtonElement>(".connie-js-close")!.focus();
    post("ready", { title: "Data processing addendum" });
    expect(document.activeElement).toBe(frame);
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
    expect(overlays()).toHaveLength(0);
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
    expect(overlays()).toEqual([a.overlay]);
  });

  it("ignores other keys", () => {
    open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(overlays()).toHaveLength(1);
  });
});

describe("messages", () => {
  it("ready: hides the spinner, labels the dialog and iframe with the title, calls onReady once", () => {
    const onReady = vi.fn();
    const { dialog, frame, overlay, post } = open({ onReady });
    post("ready", { title: "AI Processing Addendum" });
    expect(overlay.querySelector(".connie-js-spinner")).toBeNull();
    expect(overlay.querySelector(".connie-js-close")).toBeNull();
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

  it("signed: closes the modal, calls onSigned and then onClose", () => {
    const calls: string[] = [];
    const { post } = open({
      onSigned: () => calls.push("signed"),
      onClose: () => calls.push("close"),
    });
    post("ready", { title: "T" });
    post("signed");
    expect(overlays()).toHaveLength(0);
    expect(calls).toEqual(["signed", "close"]);
  });

  it("close: tears down and calls onClose once", () => {
    const onClose = vi.fn();
    const { post, embed } = open({ onClose });
    post("close");
    post("close");
    embed.close();
    expect(overlays()).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("error: calls onError with the payload, tears down, then onClose", () => {
    const calls: unknown[] = [];
    const { post } = open({
      onError: (e) => calls.push(e),
      onClose: () => calls.push("close"),
    });
    post("error", { code: "expired", message: "This link has expired." });
    expect(overlays()).toHaveLength(0);
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
    expect(overlays()).toHaveLength(1);
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
    expect(overlays()).toHaveLength(1);
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
    expect(overlays()).toEqual([hb.overlay]);

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
    expect(overlays()).toHaveLength(0);
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
    expect(overlays()).toHaveLength(0);
    expect(() => vi.runAllTimers()).toThrow("host bug");
    vi.useRealTimers();
  });
});

describe("fetchUrl", () => {
  it("shows the spinner while fetching, then frames the url it resolves with", async () => {
    let resolve!: (url: string) => void;
    const fetchUrl = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const { frame, overlay } = open({ fetchUrl });
    expect(overlay.querySelector(".connie-js-spinner")).not.toBeNull();
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
    expect(overlays()).toHaveLength(0);
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
    expect(overlays()).toHaveLength(0);
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
