import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAllowedUrl, randomId, signPageFrameUrl, withEmbedId } from "../src/v1/url.js";

describe("parseAllowedUrl", () => {
  it.each([
    "https://sign.page/embed/abc",
    "https://sign.customer.com:8443/embed/abc",
    "http://localhost:4000/embed/abc",
    "http://127.0.0.1:4000/embed/abc",
    "http://[::1]:4000/embed/abc",
    "http://sign.connie.localhost:4000/embed/abc",
  ])("accepts %s", (url) => {
    expect(parseAllowedUrl(url)?.href).toBe(new URL(url).href);
  });

  it.each([
    ["plain http on a public host", "http://sign.page/embed/abc"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,hi"],
    ["a relative path", "/embed/abc"],
    ["credentials", "https://user:pass@sign.page/embed/abc"],
    ["a host merely starting with localhost", "http://localhost.evil.com/embed/abc"],
    ["garbage", "not a url"],
    ["an empty string", ""],
  ])("rejects %s", (_name, url) => {
    expect(parseAllowedUrl(url)).toBeNull();
  });

  it("rejects values that are not strings", () => {
    expect(parseAllowedUrl(undefined)).toBeNull();
    expect(parseAllowedUrl(42)).toBeNull();
    expect(parseAllowedUrl({ href: "https://sign.page" })).toBeNull();
  });
});

describe("withEmbedId", () => {
  it("appends ?embed_id= when the URL has no query", () => {
    expect(withEmbedId(new URL("https://sign.page/embed/abc"), "e1")).toBe(
      "https://sign.page/embed/abc?embed_id=e1",
    );
  });

  it("appends &embed_id= when the URL already has a query, keeping it as it is", () => {
    expect(withEmbedId(new URL("https://sign.page/embed/abc?lang=da&x=a%20b"), "e1")).toBe(
      "https://sign.page/embed/abc?lang=da&x=a%20b&embed_id=e1",
    );
  });

  it("keeps a fragment after the query", () => {
    expect(withEmbedId(new URL("https://sign.page/embed/abc#top"), "e1")).toBe(
      "https://sign.page/embed/abc?embed_id=e1#top",
    );
  });

  it("encodes the id", () => {
    expect(withEmbedId(new URL("https://sign.page/e"), "a&b")).toBe(
      "https://sign.page/e?embed_id=a%26b",
    );
  });
});

describe("randomId", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses crypto.randomUUID", () => {
    expect(randomId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(randomId()).not.toBe(randomId());
  });

  it("falls back to getRandomValues without randomUUID (insecure contexts)", () => {
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(171) });
    expect(randomId()).toBe("ab".repeat(16));
  });

  it("falls back to Math.random without crypto", () => {
    vi.stubGlobal("crypto", undefined);
    expect(randomId()).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("signPageFrameUrl", () => {
  const page = "https://www.example.com";

  it("frames /<pin>/embed on the link's host, with the page's origin and nothing else", () => {
    expect(signPageFrameUrl(new URL("https://sign.page/EA0990"), page)).toBe(
      "https://sign.page/EA0990/embed?origin=https%3A%2F%2Fwww.example.com",
    );
  });

  it("drops a trailing slash from the link", () => {
    expect(signPageFrameUrl(new URL("https://sign.page/EA0990/"), page)).toBe(
      "https://sign.page/EA0990/embed?origin=https%3A%2F%2Fwww.example.com",
    );
  });

  it("keeps a custom domain and its port", () => {
    expect(signPageFrameUrl(new URL("https://sign.customer.com:8443/EA0990"), page)).toMatch(
      /^https:\/\/sign\.customer\.com:8443\/EA0990\/embed\?/,
    );
  });

  it("keeps the segment as the link encodes it, and encodes the origin", () => {
    expect(signPageFrameUrl(new URL("https://sign.page/a%20b"), "http://localhost:3000")).toBe(
      "https://sign.page/a%20b/embed?origin=http%3A%2F%2Flocalhost%3A3000",
    );
  });
});
