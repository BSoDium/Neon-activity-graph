/**
 * A small "Powered by Neon" link in the bottom right corner of the graph's box, for a site that wants to say what draws its graph and point to the project's page. Off unless asked for (`attribution`).
 * Styled through CSS variables set on the container or above it: `--nag-attribution-fg` (the colour; by default the text colour, faded), `--nag-attribution-fg-hover`, `--nag-attribution-right` and `--nag-attribution-bottom` (its offsets: 10px, and 8px or less so that it keeps clear of the blocks).
 */
export interface AttributionOptions {
  /** The words (default "Powered by Neon"). */
  text?: string;
  /** Where it links to (default the project's page). */
  href?: string;
  /** `"_blank"` (default, opened with `noopener`) or `"_self"`. */
  target?: "_blank" | "_self";
}

export const ATTRIBUTION_TEXT = "Powered by Neon";
export const ATTRIBUTION_HREF = "https://neon.bsodium.fr/";

/** What `attribution` asks for, filled in: `null` for none. Only web links are accepted (`http:` and `https:`); anything else falls back to the project's page. */
export function resolveAttribution(option: boolean | AttributionOptions | undefined): Required<AttributionOptions> | null {
  if (!option) return null;
  const o = option === true ? {} : option;
  const safe = (href: string | undefined) => {
    if (!href) return ATTRIBUTION_HREF;
    try {
      const u = new URL(href, "https://invalid.example/");
      return u.protocol === "https:" || u.protocol === "http:" ? href : ATTRIBUTION_HREF;
    } catch {
      return ATTRIBUTION_HREF;
    }
  };
  return { text: o.text?.trim() || ATTRIBUTION_TEXT, href: safe(o.href), target: o.target === "_self" ? "_self" : "_blank" };
}

/** The link's styles, for the selector that picks it out (shared by the corner link, `createAttribution`, and the standalone `NeonAttribution` of the React entry). */
export function attributionCss(sel: string): string {
  return `${sel}{display:inline-flex;align-items:center;gap:.25em;padding:4px 3px;border-radius:4px;font:500 11px/1 system-ui,sans-serif;letter-spacing:.04em;text-decoration:none;color:var(--nag-attribution-fg,color-mix(in srgb,currentColor 52%,transparent));transition:color .2s}
${sel} b{font-weight:700}
${sel} svg{width:1.1em;height:1.1em;flex:none}
${sel}:hover,${sel}:focus-visible{color:var(--nag-attribution-fg-hover,currentColor)}
${sel}:hover span,${sel}:focus-visible span{text-decoration:underline;text-underline-offset:3px}
${sel}:focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (prefers-reduced-motion:reduce){${sel}{transition:none}}`;
}

/** The arrow up and to the right (24 x 24, stroked): it says that the link goes to another page. */
export const ATTRIBUTION_ARROW = { paths: ["M7 17 17 7", "M7 7h10v10"], strokeWidth: 2.8 } as const;

export interface Attribution {
  destroy(): void;
}

let count = 0;

export function createAttribution(container: HTMLElement, options: Required<AttributionOptions>): Attribution {
  if (getComputedStyle(container).position === "static") container.style.position = "relative";
  const id = `nag-attribution-${++count}`;
  const a = document.createElement("a");
  a.id = id;
  a.className = "nag-attribution";
  a.href = options.href;
  a.target = options.target;
  if (options.target === "_blank") a.rel = "noopener";
  a.setAttribute("aria-label", options.text);
  // (a link over the picture: it takes the pointer where it is, and the rest of the box keeps its own)
  // (by default 8 px from the bottom edge, or lower, down to the edge itself, when the blocks come that near: it keeps clear of them (`--nag-content-bottom`, the lowest block's edge, is set on the container by the graph). `--nag-attribution-bottom` sets it for good)
  a.style.cssText = "position:absolute;right:var(--nag-attribution-right,10px);bottom:var(--nag-attribution-bottom,min(8px,max(0px,calc(100% - var(--nag-content-bottom,0px) - 22px))));z-index:3";
  const style = document.createElement("style");
  style.textContent = attributionCss(`#${id}`);
  // (the words, with the name in bold when they are the default ones, then an arrow up and to the right: it is a link to another page)
  const words = document.createElement("span");
  if (options.text === ATTRIBUTION_TEXT) {
    const b = document.createElement("b");
    b.textContent = "Neon";
    words.append(document.createTextNode("Powered by "), b);
  } else {
    words.textContent = options.text;
  }
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": String(ATTRIBUTION_ARROW.strokeWidth), "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) arrow.setAttribute(k, v);
  for (const d of ATTRIBUTION_ARROW.paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    arrow.append(path);
  }
  a.append(words, arrow);
  container.append(style, a);
  return {
    destroy: () => {
      style.remove();
      a.remove();
    },
  };
}
