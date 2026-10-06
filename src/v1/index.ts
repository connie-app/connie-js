import type { ConnieJs } from "../types.js";
import { openSignPage } from "./embed.js";

declare const __VERSION__: string;

if (!window.Connie) {
  const connie: ConnieJs = Object.freeze({ openSignPage, version: __VERSION__ });
  window.Connie = connie;
}
