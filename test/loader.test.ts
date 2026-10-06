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
});

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
});
