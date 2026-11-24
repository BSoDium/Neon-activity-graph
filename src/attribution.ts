/**
 * A small "Powered by Neon" link in the bottom right corner of the graph's box, for a site that wants to say what draws its graph and point to the project's page. Off unless asked for (`attribution`).
 * Styled through CSS variables set on the container or above it: `--nag-attribution-fg` (the colour; by default the text colour, faded), `--nag-attribution-fg-hover`, `--nag-attribution-right` and `--nag-attribution-bottom` (its offsets, 10px and 8px).
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
  a.style.cssText = "position:absolute;right:var(--nag-attribution-right,10px);bottom:var(--nag-attribution-bottom,8px);z-index:3";
  const style = document.createElement("style");
  style.textContent = `#${id}{display:inline-flex;align-items:center;gap:.25em;padding:4px 3px;border-radius:4px;font:500 11px/1 system-ui,sans-serif;letter-spacing:.04em;text-decoration:none;color:var(--nag-attribution-fg,color-mix(in srgb,currentColor 52%,transparent));transition:color .2s}
#${id} b{font-weight:700}
#${id} svg{width:1.1em;height:1.1em;flex:none}
#${id}:hover,#${id}:focus-visible{color:var(--nag-attribution-fg-hover,currentColor)}
#${id}:hover span,#${id}:focus-visible span{text-decoration:underline;text-underline-offset:3px}
#${id}:focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (prefers-reduced-motion:reduce){#${id}{transition:none}}`;
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
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.8", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) arrow.setAttribute(k, v);
  for (const d of ["M7 17 17 7", "M7 7h10v10"]) {
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
