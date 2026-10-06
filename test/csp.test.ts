import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { open, overlays } from "./helpers.js";

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
    return h;
  };

  it("adds no <style>, <link> or <script> elements over a whole embed", async () => {
    fullCycle();
    await Promise.resolve();
    expect(added.length).toBeGreaterThan(0);
    expect(added.filter((tag) => ["STYLE", "LINK", "SCRIPT"].includes(tag))).toEqual([]);
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

  it("serialises the overlay without any style attribute", () => {
    const { overlay } = open();
    expect(overlay.outerHTML).not.toMatch(/style=/i);
    expect(overlays()).toHaveLength(1);
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
    const overlay = document.querySelector<HTMLElement>(".connie-js-overlay")!;
    const dialog = overlay.querySelector<HTMLElement>(".connie-js-dialog")!;
    expect(overlay.style.getPropertyValue("z-index")).toBe("2147483000");
    expect(overlay.style.getPropertyPriority("z-index")).toBe("important");
    expect(overlay.style.getPropertyValue("position")).toBe("fixed");
    expect(dialog.style.getPropertyValue("max-width")).toBe("none");
    expect(document.querySelectorAll("style")).toHaveLength(0);
    embed.close();
  });
});
