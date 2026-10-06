/**
 * The overlay's look, applied through CSSOM only: a constructed stylesheet
 * adopted by the document, or `element.style` where constructable stylesheets
 * are missing. Never a `<style>` element and never a `style` attribute in
 * markup, so a host's `style-src` needs no change.
 */

export const PREFIX = "connie-js-";

export type Part = "overlay" | "dialog" | "frame" | "loading" | "spinner" | "close";

type Decls = Record<string, string>;

const BASE: Record<Part, Decls> = {
  overlay: {
    position: "fixed",
    inset: "0",
    "z-index": "2147483000",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    margin: "0",
    padding: "24px",
    "box-sizing": "border-box",
    background: "rgba(15,23,42,.6)",
  },
  dialog: {
    position: "relative",
    width: "100%",
    "max-width": "760px",
    height: "100%",
    "max-height": "900px",
    margin: "0",
    padding: "0",
    "box-sizing": "border-box",
    overflow: "hidden",
    background: "#fff",
    "border-radius": "12px",
    "box-shadow": "0 24px 64px rgba(0,0,0,.3)",
  },
  frame: {
    display: "block",
    width: "100%",
    height: "100%",
    margin: "0",
    padding: "0",
    border: "0",
  },
  loading: {
    position: "absolute",
    inset: "0",
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    background: "#fff",
  },
  spinner: {
    width: "32px",
    height: "32px",
    "box-sizing": "border-box",
    border: "3px solid #e2e8f0",
    "border-top-color": "#334155",
    "border-radius": "50%",
    animation: PREFIX + "spin .8s linear infinite",
  },
  close: {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "40px",
    height: "40px",
    margin: "0",
    padding: "0",
    border: "0",
    "border-radius": "8px",
    background: "transparent",
    color: "#334155",
    font: "24px/1 system-ui,sans-serif",
    cursor: "pointer",
  },
};

const FULL_SCREEN: Partial<Record<Part, Decls>> = {
  overlay: { padding: "0" },
  dialog: { "max-width": "none", "max-height": "none", "border-radius": "0", "box-shadow": "none" },
};

const block = (rules: Partial<Record<Part, Decls>>): string =>
  Object.entries(rules)
    .map(
      ([part, decls]) =>
        "." +
        PREFIX +
        part +
        "{" +
        Object.entries(decls as Decls)
          .map(([k, v]) => k + ":" + v + "!important")
          .join(";") +
        "}",
    )
    .join("");

export const CSS =
  block(BASE) +
  "." +
  PREFIX +
  "close:focus-visible{outline:2px solid #2563eb!important;outline-offset:2px!important}" +
  "@keyframes " +
  PREFIX +
  "spin{to{transform:rotate(360deg)}}" +
  "@media (max-width:639.98px){" +
  block(FULL_SCREEN) +
  "}" +
  "@media (prefers-reduced-motion:reduce){." +
  PREFIX +
  "spinner{animation-duration:2.4s!important}}";

let adopted: CSSStyleSheet | null = null;

/** Adopts the stylesheet once per document. Returns false when the browser cannot. */
function adopt(doc: Document): boolean {
  if (adopted && doc.adoptedStyleSheets.includes(adopted)) return true;
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    adopted = sheet;
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates an element of the overlay with its namespaced class. Where the
 * stylesheet cannot be adopted, the same declarations go on `element.style`,
 * full screen at every width.
 */
export function part<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  name: Part,
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  el.className = PREFIX + name;
  if (!adopt(doc)) {
    for (const [k, v] of Object.entries({ ...BASE[name], ...FULL_SCREEN[name] })) {
      el.style.setProperty(k, v, "important");
    }
  }
  return el;
}
