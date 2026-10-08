/**
 * The overlay's look. Everything but the shadow host lives in a closed shadow
 * root, styled by one constructed stylesheet adopted into each root, or by
 * `element.style` where constructable stylesheets are missing (Safari
 * 16.0–16.3). Styles are only ever written through the CSSOM: never a `<style>`
 * element and never a `style` attribute string, so a host's `style-src` needs
 * no change.
 */

/**
 * Colours of the overlay, the skeleton and the close button, matching the
 * SignPage's own tokens.
 */
export const COLORS = {
  backdrop: "rgba(15,23,42,.6)",
  /** The dialog, the header band and the document's paper. */
  surface: "#ffffff",
  /** The header band's 1px bottom border, inside its 56px. */
  border: "#e5e5e5",
  /** The document area behind the paper. */
  canvas: "#e2e8f0",
  placeholder: "#ebebeb",
  shimmer: "#f5f5f5",
  /** Placeholders on the canvas, where the SignPage's title and subtitle sit. */
  canvasPlaceholder: "#cbd5e1",
  canvasShimmer: "#d8dfe8",
  icon: "#525252",
  hover: "#f5f5f5",
  focus: "#9e36ff",
} as const;

/**
 * The frame's header band: its top 56px carry the title on the left (16px
 * side padding), and when framed by connie-js the band's right 56px are left
 * empty for connie-js's close button, a 40×40 button 8px from the dialog's top
 * and right edges, so it sits vertically centred in the band.
 */
export const HEADER_BAND = 56;

/** How long the skeleton and the frame take to cross-fade on `ready`. */
export const FADE_MS = 200;

export const Z_INDEX = "2147483000";

/** Widths of the skeleton's text lines, in percent. */
export const LINE_WIDTHS = [100, 96, 98, 88, 100, 94, 97, 91, 64];

/**
 * The SignPage's frame width below which its document column narrows, its
 * `sm` breakpoint. The skeleton follows the frame's own width, not the host
 * page's, through a container query.
 */
export const NARROW_BELOW = 640;

/**
 * The SignPage's document column, which the skeleton copies so the swap on
 * `ready` does not move: under the header band, the column's padding, then
 * the SignPage's title (a 32px line) and subtitle (a 28px line), 8px apart,
 * centred on the canvas, then the paper, square, with its own padding.
 */
export const COLUMN = {
  /** Above the title and either side of the paper: wide, narrow. */
  inset: [
    [48, 24],
    [32, 16],
  ],
  /** From the subtitle to the paper: wide, narrow. */
  gap: [48, 32],
  maxWidth: 896,
  paperPadding: [96, 48],
  paperShadow:
    "0 12px 16px -4px rgba(10,13,18,.08),0 4px 6px -2px rgba(10,13,18,.03),0 2px 2px -1px rgba(10,13,18,.04),0 9px 7px rgba(0,0,0,.1)",
} as const;

export type Part =
  | "overlay"
  | "dialog"
  | "frame"
  | "skeleton"
  | "head"
  | "canvas"
  | "page"
  | "bar"
  | "title"
  | "h1"
  | "h2"
  | "heading"
  | "line"
  | "close"
  | "shown"
  | "faded";

const shimmer = (from: string, to: string): string =>
  `linear-gradient(90deg,${from} 25%,${to} 50%,${from} 75%) 0 0/200% 100% no-repeat ${from}`;

const BAR_BACKGROUND = shimmer(COLORS.placeholder, COLORS.shimmer);
const CANVAS_BAR_BACKGROUND = shimmer(COLORS.canvasPlaceholder, COLORS.canvasShimmer);

/**
 * The column's vertical rhythm: each placeholder bar sits centred in the line
 * box of the text it stands for, so the title's 24px bar fills its 32px line
 * from 4px, and the subtitle's 18px bar its 28px line from 5px.
 */
const H1_MARGIN = 4;
const H2_MARGIN = 4 + 8 + 5;
const PAGE_MARGIN = (gap: number): number => 5 + gap;

const inset = ([top, side]: readonly [number, number]): string => `padding:${top}px ${side}px 0`;

/**
 * Declarations per class, in cascade order: `shown` and `faded` are state
 * classes added on `ready`, and come last so they win over the parts they
 * modify. A property may repeat as a fallback for older engines.
 */
const BASE: Record<Part, string> = {
  overlay: `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;margin:0;padding:24px;box-sizing:border-box;background:${COLORS.backdrop}`,
  dialog: `position:relative;width:100%;max-width:760px;height:100%;max-height:900px;margin:0;padding:0;box-sizing:border-box;overflow:hidden;background:${COLORS.surface};border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.3)`,
  frame: `position:absolute;inset:0;z-index:0;display:block;width:100%;height:100%;margin:0;padding:0;border:0;opacity:0;transition:opacity ${FADE_MS}ms ease`,
  skeleton: `position:absolute;inset:0;z-index:1;overflow:hidden;container-type:inline-size;background:${COLORS.canvas};pointer-events:none;transition:opacity ${FADE_MS}ms ease`,
  head: `display:flex;align-items:center;height:${HEADER_BAND}px;padding:0 ${HEADER_BAND + 16}px 0 16px;box-sizing:border-box;border-bottom:1px solid ${COLORS.border};background:${COLORS.surface}`,
  canvas: `height:calc(100% - ${HEADER_BAND}px);${inset(COLUMN.inset[0])};box-sizing:border-box;overflow:hidden;scrollbar-gutter:stable`,
  page: `max-width:${COLUMN.maxWidth - 2 * COLUMN.inset[0][1]}px;min-height:200%;margin:${PAGE_MARGIN(COLUMN.gap[0])}px auto 0;padding:${COLUMN.paperPadding[0]}px ${COLUMN.paperPadding[1]}px 0;box-sizing:border-box;border-radius:0;background:${COLORS.surface};box-shadow:${COLUMN.paperShadow}`,
  bar: `display:block;border-radius:6px;background:${BAR_BACKGROUND};animation:connie-shimmer 1.6s linear infinite`,
  title: `width:40%;height:16px`,
  h1: `width:min(280px,80%);height:24px;margin:${H1_MARGIN}px auto 0;background:${CANVAS_BAR_BACKGROUND}`,
  h2: `width:min(140px,40%);height:18px;margin:${H2_MARGIN}px auto 0;background:${CANVAS_BAR_BACKGROUND}`,
  heading: `width:55%;height:24px;margin:4px 0 28px`,
  line: `height:12px;margin-top:12px`,
  close: `position:absolute;top:8px;right:8px;z-index:2;display:flex;align-items:center;justify-content:center;width:40px;height:40px;margin:0;padding:0;box-sizing:border-box;border:0;border-radius:8px;background:transparent;color:${COLORS.icon};cursor:pointer;-webkit-tap-highlight-color:transparent`,
  shown: `opacity:1`,
  faded: `opacity:0`,
};

/** Below 640px the dialog fills the screen and keeps clear of notches and home indicators. */
const FULL_SCREEN: Partial<Record<Part, string>> = {
  overlay: `padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);background:${COLORS.surface}`,
  dialog: `max-width:none;max-height:none;border-radius:0;box-shadow:none`,
};

/** In a frame narrower than `NARROW_BELOW`, the SignPage's column is narrower too. */
const NARROW: Partial<Record<Part, string>> = {
  canvas: inset(COLUMN.inset[1]),
  page: `margin-top:${PAGE_MARGIN(COLUMN.gap[1])}px`,
};

/**
 * The shadow host. `all: initial` cuts it off from everything the page could
 * set or pass down, and the rest makes it the fixed, full-viewport box the
 * overlay fills. Applied inline with `!important`, which no page stylesheet
 * can beat.
 */
const HOST = `all:initial;display:block;position:fixed;top:0;right:0;left:0;height:100vh;height:100dvh;margin:0;padding:0;border:0;z-index:${Z_INDEX}`;

const rules = (parts: Partial<Record<Part, string>>): string =>
  Object.entries(parts)
    .map(([name, decls]) => "." + name + "{" + decls + "}")
    .join("");

export const CSS =
  rules(BASE) +
  LINE_WIDTHS.map((w, i) => `.line:nth-child(${i + 2}){width:${w}%}`).join("") +
  `.close:hover{background:${COLORS.hover}}` +
  `.close:focus{outline:0}` +
  `.close:focus-visible{outline:2px solid ${COLORS.focus};outline-offset:2px}` +
  `@keyframes connie-shimmer{from{background-position:100% 0}to{background-position:-100% 0}}` +
  `@media (max-width:639.98px){${rules(FULL_SCREEN)}}` +
  `@container (max-width:${NARROW_BELOW - 0.02}px){${rules(NARROW)}}` +
  `@media (prefers-reduced-motion:reduce){.bar{animation:none}.frame,.skeleton{transition:none}}`;

function apply(el: HTMLElement, decls: string): void {
  for (const decl of decls.split(";")) {
    const at = decl.indexOf(":");
    el.style.setProperty(decl.slice(0, at), decl.slice(at + 1), "important");
  }
}

let shared: CSSStyleSheet | null = null;

/**
 * Adopts the shared stylesheet into a shadow root. Returns false where the
 * browser cannot, and the overlay then styles each element inline instead.
 */
function adopt(root: ShadowRoot): boolean {
  try {
    if (!("adoptedStyleSheets" in root)) return false;
    if (!shared) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      shared = sheet;
    }
    root.adoptedStyleSheets = [shared];
    return true;
  } catch {
    return false;
  }
}

export interface Styler {
  /**
   * Creates an element with the classes of its parts. Without an adopted
   * stylesheet, the same declarations go on `element.style`, full screen at
   * every width, with the narrow column when the window is narrow, and with
   * no hover, shimmer or line widths.
   */
  part<K extends keyof HTMLElementTagNameMap>(tag: K, ...names: Part[]): HTMLElementTagNameMap[K];
  /** Adds a state class, `shown` or `faded`, to an element made by `part`. */
  mark(el: HTMLElement, name: "shown" | "faded"): void;
}

/**
 * Creates the shadow host with a closed root, styled, and returns a `Styler`
 * for the elements that go inside it.
 */
export function shadow(doc: Document): { host: HTMLElement; root: ShadowRoot; styler: Styler } {
  const host = doc.createElement("div");
  host.setAttribute("data-connie-js", "");
  apply(host, HOST);
  const root = host.attachShadow({ mode: "closed" });
  const sheet = adopt(root);
  // Inline, the dialog is full screen at every width, so the frame is as wide as the window.
  const narrow = (doc.defaultView?.innerWidth ?? 0) < NARROW_BELOW;
  const style = (el: HTMLElement, name: Part): void => {
    if (sheet) return;
    apply(el, BASE[name]);
    if (FULL_SCREEN[name]) apply(el, FULL_SCREEN[name]);
    if (narrow && NARROW[name]) apply(el, NARROW[name]);
  };
  return {
    host,
    root,
    styler: {
      part(tag, ...names) {
        const el = doc.createElement(tag);
        el.className = names.join(" ");
        for (const name of names) style(el, name);
        return el;
      },
      mark(el, name) {
        el.classList.add(name);
        style(el, name);
      },
    },
  };
}
