// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadConnie } from "../src/index.js";

describe("loadConnie without a window (server-side rendering)", () => {
  it("resolves with null and touches nothing", async () => {
    expect(typeof window).toBe("undefined");
    await expect(loadConnie()).resolves.toBeNull();
  });
});
