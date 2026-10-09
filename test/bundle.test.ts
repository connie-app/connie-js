import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sizes } from "../scripts/sizes.mjs";

const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const v1 = readFileSync(join(root, "dist/v1.js"), "utf8");

/** Runs the built hosted script the way a `<script>` tag would. */
const run = () => (0, eval)(v1);

describe("dist/v1.js", () => {
  afterEach(() => {
    delete window.Connie;
    delete (Object.getPrototypeOf(window) as { Connie?: unknown }).Connie;
  });

  it("defines window.Connie with openSignPage and the package version", () => {
    run();
    expect(typeof window.Connie?.openSignPage).toBe("function");
    expect(window.Connie?.version).toBe(pkg.version);
    expect(Object.isFrozen(window.Connie)).toBe(true);
  });

  it("is idempotent when loaded twice", () => {
    run();
    const first = window.Connie;
    run();
    expect(window.Connie).toBe(first);
  });

  it("leaves an existing window.Connie alone", () => {
    const existing = { openSignPage: () => ({ close() {} }), version: "9.9.9" };
    window.Connie = existing;
    run();
    expect(window.Connie).toBe(existing);
  });

  it("defines window.Connie read-only and not enumerable", () => {
    run();
    const first = window.Connie;
    expect(Object.getOwnPropertyDescriptor(window, "Connie")).toEqual({
      value: first,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    expect(() => {
      (window as { Connie?: unknown }).Connie = { openSignPage: () => {} };
    }).toThrow(TypeError);
    expect(window.Connie).toBe(first);
  });

  it("replaces an element with id Connie, which browsers expose as window.Connie", () => {
    const a = document.createElement("a");
    a.id = "Connie";
    document.body.append(a);
    Object.defineProperty(Object.getPrototypeOf(window), "Connie", {
      get: () => a,
      configurable: true,
    });
    run();
    expect(window.Connie).not.toBe(a);
    expect(typeof window.Connie?.openSignPage).toBe("function");
    a.remove();
  });

  it("replaces a window.Connie without openSignPage", () => {
    (window as { Connie?: unknown }).Connie = { version: "0.0.0" };
    run();
    expect(typeof window.Connie?.openSignPage).toBe("function");
    expect(window.Connie?.version).toBe(pkg.version);
  });

  it("assigns over a global the page declared with var, which cannot be redefined", () => {
    const fakeWindow = {};
    Object.defineProperty(fakeWindow, "Connie", {
      value: undefined,
      writable: true,
      enumerable: true,
      configurable: false,
    });
    new Function("window", v1)(fakeWindow);
    expect(typeof (fakeWindow as Window).Connie?.openSignPage).toBe("function");
  });

  it("defines no other globals", () => {
    const before = new Set(Object.getOwnPropertyNames(window));
    run();
    expect(Object.getOwnPropertyNames(window).filter((k) => !before.has(k))).toEqual(["Connie"]);
  });

  it("is a single IIFE", () => {
    expect(v1).toMatch(
      /^\/\*! @getconnie\/connie-js v\d+\.\d+\.\d+ [^\n]*\*\/\n"use strict";\(\(\)=>\{.*\}\)\(\);\n$/s,
    );
  });
});

describe("dist/index.js", () => {
  it("exports loadConnie", async () => {
    const mod = await import(/* @vite-ignore */ join(root, "dist/index.js"));
    expect(typeof mod.loadConnie).toBe("function");
  });
});

describe("size budgets", () => {
  for (const { file, gzip, budget } of sizes()) {
    it(`${file} is ${gzip} B gzipped, within ${budget} B`, () => {
      expect(gzip).toBeLessThanOrEqual(budget);
    });
  }

  it("budgets the hosted script at 10 kB and the wrapper at 1 kB", () => {
    const budgets = Object.fromEntries(sizes().map((s) => [s.file, s.budget]));
    expect(budgets).toEqual({
      "dist/v1.js": 10240,
      "dist/index.js": 1024,
      "dist/index.cjs": 1024,
    });
  });
});
