/**
 * A small "Powered by Neon" link in the bottom right corner of the graph's box, for a site that wants to say what draws its graph and point to the project's page. Off unless asked for (`attribution`).
 * Styled through CSS variables set on the container or above it: `--nag-attribution-fg` (the colour; by default the text colour, faded), `--nag-attribution-right` and `--nag-attribution-bottom` (its offsets, 10px and 8px),
 * `--nag-top` (the colour of the little lamp before the text, the green layer's).
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
  style.textContent = `#${id}{display:inline-flex;align-items:center;gap:.55em;padding:4px 3px;border-radius:4px;font:500 11px/1 system-ui,sans-serif;letter-spacing:.04em;text-decoration:none;color:var(--nag-attribution-fg,color-mix(in srgb,currentColor 52%,transparent));transition:color .2s}
#${id}::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--nag-top,#3ddc6a);box-shadow:0 0 6px var(--nag-top,#3ddc6a);flex:none}
#${id} b{font-weight:700}
#${id}:hover,#${id}:focus-visible{color:var(--nag-attribution-fg-hover,currentColor)}
#${id}:focus-visible{outline:2px solid currentColor;outline-offset:2px}
@media (prefers-reduced-motion:reduce){#${id}{transition:none}}`;
  // (the default words have the name in bold; words of your own are shown as they are)
  if (options.text === ATTRIBUTION_TEXT) {
    a.append(document.createTextNode("Powered by "));
    const b = document.createElement("b");
    b.textContent = "Neon";
    a.append(b);
  } else {
    a.append(document.createTextNode(options.text));
  }
  container.append(style, a);
  return {
    destroy: () => {
      style.remove();
      a.remove();
    },
  };
}
