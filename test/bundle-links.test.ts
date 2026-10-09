import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hosts, rootOf } from "./helpers.js";

const v1 = readFileSync(join(__dirname, "..", "dist/v1.js"), "utf8");

/** The browser's own `currentScript` getter, stood in for on the document's prototype. */
const proto = Object.getPrototypeOf(document);
const original = Object.getOwnPropertyDescriptor(proto, "currentScript");

/** Runs the built hosted script as the `<script>` tag `script` would. */
function runFrom(script: HTMLScriptElement | null): void {
  Object.defineProperty(proto, "currentScript", { get: () => script, configurable: true });
  try {
    (0, eval)(v1);
  } finally {
    if (original) Object.defineProperty(proto, "currentScript", original);
    else delete proto.currentScript;
  }
}

function tag(hostList?: string): HTMLScriptElement {
  const script = document.createElement("script");
  if (hostList !== undefined) script.setAttribute("data-connie-hosts", hostList);
  return script;
}

/** Clicks a `data-connie-signpage` link to `href` as the visitor would, and whether connie-js took it. */
function clickLink(href: string): boolean {
  const a = document.createElement("a");
  a.href = href;
  a.setAttribute("data-connie-signpage", "");
  document.body.append(a);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "isTrusted", { value: true });
  let taken = false;
  // Read after connie-js, then prevented anyway so happy-dom does not follow the link.
  const record = (seen: Event) => {
    taken = seen.defaultPrevented;
    seen.preventDefault();
  };
  window.addEventListener("click", record);
  a.dispatchEvent(event);
  window.removeEventListener("click", record);
  return taken;
}

/** Forgets the copy that defined window.Connie, so the next run is the first again. */
function unload(): void {
  delete window.Connie;
  delete (window as unknown as Record<symbol, unknown>)[Symbol.for("connie-js.hosts")];
}

afterEach(() => {
  for (const host of hosts()) rootOf(host).querySelector<HTMLButtonElement>("button")!.click();
  delete (document as { currentScript?: unknown }).currentScript;
  unload();
});

describe("dist/v1.js and data-connie-signpage links", () => {
  it("enhances links once, however often the script is loaded", () => {
    runFrom(null);
    runFrom(null);

    expect(clickLink("https://sign.page/EA0990")).toBe(true);
    expect(hosts()).toHaveLength(1);
  });

  it.each(["img", "form"])(
    "ignores the hosts on an <%s name=currentScript> in the page's markup",
    (tagName) => {
      const clobbering = document.createElement(tagName);
      clobbering.setAttribute("name", "currentScript");
      clobbering.setAttribute("data-connie-hosts", "evil.example");
      document.body.append(clobbering);
      // What browsers do: the element becomes a named property of the document.
      Object.defineProperty(document, "currentScript", {
        get: () => clobbering,
        configurable: true,
      });
      runFrom(tag("sign." + tagName + ".example"));

      expect(clickLink("https://evil.example/EA0990")).toBe(false);
      expect(hosts()).toHaveLength(0);
      expect(clickLink(`https://sign.${tagName}.example/EA0990`)).toBe(true);
      expect(hosts()).toHaveLength(1);
    },
  );

  it("warns when a second copy lists other hosts than the copy in force", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    runFrom(tag("sign.first.example"));
    runFrom(tag("sign.first.example"));
    expect(warn).not.toHaveBeenCalled();
    runFrom(tag("sign.second.example"));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("data-connie-hosts is ignored");
    expect(warn.mock.calls[0][0]).toContain("sign.first.example, sign.page");
  });
});
