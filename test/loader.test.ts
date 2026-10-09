import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnieJs } from "../src/index.js";

const DEFAULT_URL = "https://assets.getconnie.com/js/v1.js";
const fakeConnie = { openSignPage: vi.fn(), version: "1.0.0" } as unknown as ConnieJs;

let appended: HTMLScriptElement[];

/** A fresh copy of the loader, so its once-only state starts empty. */
const loader = async () => (await import("../src/index.js")).loadConnie;

beforeEach(() => {
  vi.resetModules();
  delete window.Connie;
  document.head.replaceChildren();
  document.body.replaceChildren();
  appended = [];
  // Capture injected tags without connecting them, so the test decides when they load.
  vi.spyOn(document.head, "append").mockImplementation((...nodes) => {
    appended.push(...(nodes as HTMLScriptElement[]));
  });
});

afterEach(() => {
  delete window.Connie;
  delete (window as { trustedTypes?: unknown }).trustedTypes;
  unclobber();
});

/**
 * Makes `<a id="Connie">` reachable as `window.Connie` the way browsers do: a
 * named property on the window's prototype chain, not an own property.
 */
const clobber = (): HTMLAnchorElement => {
  const a = document.createElement("a");
  a.id = "Connie";
  document.body.append(a);
  Object.defineProperty(Object.getPrototypeOf(window), "Connie", {
    get: () => a,
    // An assignment creates an own property that shadows the element.
    set(this: Window, value: unknown) {
      Object.defineProperty(this, "Connie", { value, writable: true, configurable: true });
    },
    configurable: true,
  });
  return a;
};
const unclobber = () => {
  delete (Object.getPrototypeOf(window) as { Connie?: unknown }).Connie;
};

interface FakePolicy {
  createScriptURL(url: string): { url: string; toString(): string };
}

/** A stand-in for `window.trustedTypes` that records the policies it creates. */
const trustedTypes = (create?: () => void) => {
  const policies: Array<{ name: string; rules: { createScriptURL(url: string): string } }> = [];
  const factory = {
    createPolicy: vi.fn(
      (name: string, rules: { createScriptURL(url: string): string }): FakePolicy => {
        create?.();
        policies.push({ name, rules });
        return {
          createScriptURL: (url) => {
            const checked = rules.createScriptURL(url);
            return { url: checked, toString: () => checked };
          },
        };
      },
    ),
  };
  (window as { trustedTypes?: unknown }).trustedTypes = factory;
  return { factory, policies };
};

const load = (script: HTMLScriptElement, connie: ConnieJs | null = fakeConnie) => {
  if (connie) window.Connie = connie;
  script.dispatchEvent(new Event("load"));
};

describe("loadConnie", () => {
  it("injects the hosted script and resolves with window.Connie once it loads", async () => {
    const loadConnie = await loader();
    const promise = loadConnie();
    expect(appended).toHaveLength(1);
    const [script] = appended;
    expect(script.tagName).toBe("SCRIPT");
    expect(script.src).toBe(DEFAULT_URL);
    expect(script.async).toBe(true);
    expect(script.hasAttribute("style")).toBe(false);
    load(script);
    await expect(promise).resolves.toBe(fakeConnie);
  });

  it("injects the script only once for concurrent and later calls", async () => {
    const loadConnie = await loader();
    const a = loadConnie();
    const b = loadConnie();
    expect(a).toBe(b);
    load(appended[0]);
    await a;
    await expect(loadConnie()).resolves.toBe(fakeConnie);
    expect(appended).toHaveLength(1);
  });

  it("reuses a script tag already on the page", async () => {
    const existing = document.createElement("script");
    existing.src = DEFAULT_URL;
    document.body.appendChild(existing);
    const loadConnie = await loader();
    const promise = loadConnie();
    expect(appended).toHaveLength(0);
    expect(document.querySelectorAll("script")).toHaveLength(1);
    load(existing);
    await expect(promise).resolves.toBe(fakeConnie);
  });

  it("reuses a script tag whose URL carries a query string", async () => {
    const existing = document.createElement("script");
    existing.src = `${DEFAULT_URL}?cachebust=1`;
    document.body.appendChild(existing);
    const loadConnie = await loader();
    const promise = loadConnie();
    expect(appended).toHaveLength(0);
    load(existing);
    await expect(promise).resolves.toBe(fakeConnie);
  });

  it("resolves at once with an existing window.Connie, injecting nothing", async () => {
    window.Connie = fakeConnie;
    const loadConnie = await loader();
    await expect(loadConnie()).resolves.toBe(fakeConnie);
    expect(appended).toHaveLength(0);
  });

  it("rejects when the script fails to load, removes its tag, and retries on the next call", async () => {
    const loadConnie = await loader();
    const first = loadConnie();
    const [script] = appended;
    const remove = vi.spyOn(script, "remove");
    script.dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow(`Failed to load Connie.js from ${DEFAULT_URL}`);
    expect(remove).toHaveBeenCalled();

    const second = loadConnie();
    expect(appended).toHaveLength(2);
    load(appended[1]);
    await expect(second).resolves.toBe(fakeConnie);
  });

  it("rejects when the script loads but defines no window.Connie", async () => {
    const loadConnie = await loader();
    const promise = loadConnie();
    load(appended[0], null);
    await expect(promise).rejects.toThrow("did not define window.Connie");
  });

  it("loads from scriptUrl when given", async () => {
    const loadConnie = await loader();
    const promise = loadConnie({ scriptUrl: "http://assets.connie.localhost:4000/js/v1.js" });
    expect(appended[0].src).toBe("http://assets.connie.localhost:4000/js/v1.js");
    load(appended[0]);
    await expect(promise).resolves.toBe(fakeConnie);
  });

  it("lists hosts on the script tag it adds as data-connie-hosts", async () => {
    const loadConnie = await loader();
    const promise = loadConnie({ hosts: ["sign.customer.com", "sign.other.dk"] });
    expect(appended[0].getAttribute("data-connie-hosts")).toBe("sign.customer.com sign.other.dk");
    load(appended[0]);
    await expect(promise).resolves.toBe(fakeConnie);
  });

  it("adds no data-connie-hosts without hosts", async () => {
    const loadConnie = await loader();
    loadConnie({ hosts: [] });
    expect(appended[0].hasAttribute("data-connie-hosts")).toBe(false);
  });

  it("leaves a script tag already on the page with its own hosts", async () => {
    const existing = document.createElement("script");
    existing.src = DEFAULT_URL;
    existing.setAttribute("data-connie-hosts", "sign.customer.com");
    document.body.appendChild(existing);
    const loadConnie = await loader();
    const promise = loadConnie({ hosts: ["sign.other.dk"] });
    expect(appended).toHaveLength(0);
    expect(existing.getAttribute("data-connie-hosts")).toBe("sign.customer.com");
    load(existing);
    await expect(promise).resolves.toBe(fakeConnie);
  });

  it("does not take an element with id Connie for window.Connie", async () => {
    clobber();
    const loadConnie = await loader();
    const promise = loadConnie();
    expect(appended).toHaveLength(1);
    load(appended[0]);
    await expect(promise).resolves.toBe(fakeConnie);
  });

  it("rejects rather than resolve with an element with id Connie, and retries on the next call", async () => {
    clobber();
    const loadConnie = await loader();
    const first = loadConnie();
    load(appended[0], null);
    await expect(first).rejects.toThrow("did not define window.Connie");

    const second = loadConnie();
    expect(appended).toHaveLength(2);
    load(appended[1]);
    await expect(second).resolves.toBe(fakeConnie);
  });

  it("does not take an object without openSignPage for window.Connie", async () => {
    window.Connie = { version: "x" } as unknown as ConnieJs;
    const loadConnie = await loader();
    const promise = loadConnie();
    expect(appended).toHaveLength(1);
    load(appended[0]);
    await expect(promise).resolves.toBe(fakeConnie);
  });
});

describe("loadConnie under Trusted Types", () => {
  it("assigns the script URL through a connie-js policy", async () => {
    const { factory, policies } = trustedTypes();
    const loadConnie = await loader();
    const promise = loadConnie();
    expect(factory.createPolicy).toHaveBeenCalledTimes(1);
    expect(policies[0].name).toBe("connie-js");
    expect(appended[0].src).toBe(DEFAULT_URL);
    load(appended[0]);
    await expect(promise).resolves.toBe(fakeConnie);
  });

  it("allows only the exact URL it was configured with", async () => {
    const { policies } = trustedTypes();
    const loadConnie = await loader();
    loadConnie();
    const { rules } = policies[0];
    expect(rules.createScriptURL(DEFAULT_URL)).toBe(DEFAULT_URL);
    for (const url of [
      "https://evil.example/v1.js",
      `${DEFAULT_URL}?x=1`,
      "https://assets.getconnie.com/js/v2.js",
      "https://assets.getconnie.com.evil.example/js/v1.js",
      "data:text/javascript,alert(1)",
    ]) {
      expect(() => rules.createScriptURL(url)).toThrow(TypeError);
    }
  });

  it("creates the policy once across retries", async () => {
    const { factory, policies } = trustedTypes();
    const loadConnie = await loader();
    const first = loadConnie();
    appended[0].dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow();
    const second = loadConnie({ scriptUrl: "https://assets.example/js/v1.js" });
    expect(factory.createPolicy).toHaveBeenCalledTimes(1);
    expect(appended[1].src).toBe("https://assets.example/js/v1.js");
    expect(policies[0].rules.createScriptURL("https://assets.example/js/v1.js")).toBe(
      "https://assets.example/js/v1.js",
    );
    load(appended[1]);
    await expect(second).resolves.toBe(fakeConnie);
  });

  it("rejects when the policy cannot be created, and retries on the next call", async () => {
    let refuse = true;
    trustedTypes(() => {
      if (refuse) throw new TypeError("Policy connie-js disallowed.");
    });
    const loadConnie = await loader();
    await expect(loadConnie()).rejects.toThrow("Policy connie-js disallowed.");
    expect(appended).toHaveLength(0);

    refuse = false;
    const second = loadConnie();
    expect(appended).toHaveLength(1);
    load(appended[0]);
    await expect(second).resolves.toBe(fakeConnie);
  });

  it("uses no policy where Trusted Types is not supported", async () => {
    const loadConnie = await loader();
    const promise = loadConnie();
    expect(appended[0].src).toBe(DEFAULT_URL);
    load(appended[0]);
    await expect(promise).resolves.toBe(fakeConnie);
  });
});
