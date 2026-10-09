import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hosts } from "./helpers.js";

const v1 = readFileSync(join(__dirname, "..", "dist/v1.js"), "utf8");

describe("dist/v1.js and data-connie-signpage links", () => {
  it("enhances links once, however often the script is loaded", () => {
    (0, eval)(v1);
    (0, eval)(v1);

    const a = document.createElement("a");
    a.href = "https://sign.page/EA0990";
    a.setAttribute("data-connie-signpage", "");
    document.body.append(a);

    const opened = a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(opened).toBe(false);
    expect(hosts()).toHaveLength(1);
  });
});
