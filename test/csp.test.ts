import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hosts, open, rootOf } from "./helpers.js";

/**
 * connie-js must work under a host CSP with no `style-src` exception: it may
 * style only through CSSOM, and must never add `<style>`, `<link>` or
 * `<script>` elements, a `style` attribute string, or markup through innerHTML.
 */
describe("CSP", () => {
  let added: string[];
  let observer: MutationObserver;

  beforeEach(() => {
    added = [];
    observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            added.push(node.tagName, ...Array.from(node.querySelectorAll("*"), (el) => el.tagName));
          }
        }
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });

  afterEach(() => observer.disconnect());

  const fullCycle = () => {
    const h = open();
    h.post("ready", { title: "Addendum" });
    h.post("signed");
    h.post("close");
    return h;
  };

  it("adds no <style>, <link> or <script> elements over a whole embed, inside or outside the shadow root", async () => {
    const h = open();
    const inside = Array.from(h.root.querySelectorAll("*"), (el) => el.tagName);
    h.post("ready", { title: "Addendum" });
    h.post("signed");
    h.post("close");
    await Promise.resolve();
    expect(added).toEqual(["DIV"]);
    expect(inside).toContain("IFRAME");
    expect(inside.filter((tag) => ["STYLE", "LINK", "SCRIPT"].includes(tag))).toEqual([]);
    expect(document.querySelectorAll("style, link, script")).toHaveLength(0);
  });

  // happy-dom implements CSSOM writes through setAttribute("style"), so a runtime
  // spy cannot tell the two apart; the scan of the built script below covers it.
  it("never writes an HTML string", () => {
    const innerHTML = vi.spyOn(Element.prototype, "innerHTML", "set");
    const outerHTML = vi.spyOn(Element.prototype, "outerHTML", "set");
    const insertAdjacentHTML = vi.spyOn(Element.prototype, "insertAdjacentHTML");
    fullCycle();
    expect(innerHTML).not.toHaveBeenCalled();
    expect(outerHTML).not.toHaveBeenCalled();
    expect(insertAdjacentHTML).not.toHaveBeenCalled();
  });

  it("styles nothing inside the shadow root inline when the stylesheet is adopted", () => {
    const { root } = open();
    expect(Array.from(root.querySelectorAll("[style]"))).toEqual([]);
    expect(hosts()).toHaveLength(1);
  });

  it("the built script contains no HTML-string or inline-style APIs", () => {
    const source = readFileSync(join(__dirname, "../dist/v1.js"), "utf8");
    for (const banned of [
      "innerHTML",
      "outerHTML",
      "insertAdjacentHTML",
      "document.write",
      "cssText",
      'setAttribute("style"',
      'createElement("style")',
      'createElement("link")',
      'createElement("script")',
      "eval(",
      "new Function",
    ]) {
      expect(source, banned).not.toContain(banned);
    }
  });
});

describe("without constructable stylesheets", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "CSSStyleSheet",
      class {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("falls back to element.style through CSSOM, still without <style> elements", async () => {
    const { openSignPage } = await import("../src/v1/embed.js");
    const embed = openSignPage({ url: "https://sign.page/embed/x" });
    const host = hosts()[0];
    const root = rootOf(host);
    expect(root.adoptedStyleSheets).toEqual([]);
    const overlay = root.querySelector<HTMLElement>(".overlay")!;
    const dialog = root.querySelector<HTMLElement>(".dialog")!;
    const close = root.querySelector<HTMLElement>(".close")!;
    expect(host.style.getPropertyValue("z-index")).toBe("2147483000");
    expect(host.style.getPropertyPriority("z-index")).toBe("important");
    expect(host.style.getPropertyValue("position")).toBe("fixed");
    expect(overlay.style.getPropertyValue("position")).toBe("absolute");
    expect(overlay.style.getPropertyPriority("position")).toBe("important");
    expect(dialog.style.getPropertyValue("max-width")).toBe("none");
    expect(close.style.getPropertyValue("top")).toBe("8px");
    expect(close.style.getPropertyValue("right")).toBe("8px");
    expect(root.querySelectorAll("style")).toHaveLength(0);
    expect(document.querySelectorAll("style")).toHaveLength(0);
    embed.close();
  });

  it("still cross-fades from the skeleton to the frame inline", async () => {
    vi.useFakeTimers();
    const { openSignPage } = await import("../src/v1/embed.js");
    const embed = openSignPage({ url: "https://sign.page/embed/x" });
    const root = rootOf(hosts()[0]);
    const frame = root.querySelector("iframe")!;
    Object.defineProperty(frame, "contentWindow", { value: {}, configurable: true });
    expect(frame.style.getPropertyValue("opacity")).toBe("0");
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          source: "connie-js",
          v: 1,
          embedId: new URL(frame.src).searchParams.get("embed_id"),
          type: "ready",
        },
        origin: "https://sign.page",
        source: frame.contentWindow,
      }),
    );
    expect(frame.style.getPropertyValue("opacity")).toBe("1");
    expect(root.querySelector<HTMLElement>(".skeleton")!.style.getPropertyValue("opacity")).toBe(
      "0",
    );
    vi.advanceTimersByTime(200);
    expect(root.querySelector(".skeleton")).toBeNull();
    embed.close();
    vi.useRealTimers();
  });
});
