import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ATTRIBUTION_ARROW, ATTRIBUTION_TEXT, attributionCss, resolveAttribution, type AttributionOptions } from "./attribution";
import { createActivityGraph } from "./index";
import { placeholderMarkup } from "./placeholder";
import type { ActivityGraph, GraphOptions } from "./types";

export interface ActivityGraphProps extends Omit<GraphOptions, "onHover" | "onReady" | "onLit" | "startup"> {
  className?: string;
  style?: CSSProperties;
  /** The aspect (width / height) the place-holder is drawn for, which is also the box's: default 3.97 for one strip, 0.8 for several. Known before the page has a size, so the server-rendered place-holder is the right shape. */
  aspect?: number;
  onHover?: GraphOptions["onHover"];
  onReady?: GraphOptions["onReady"];
  onLit?: GraphOptions["onLit"];
  startup?: GraphOptions["startup"];
}

/**
 * The graph as a component (with its place-holder, which is also rendered on the server): a `div` that fills with the picture (size it with `className` or `style`). The graph is rebuilt when `data`, `strips`, `weeks`, `lite`, `rodColor`'s presence or `templatesUrl` change; a new
 * `theme` only switches the theme. Callbacks and the other options are read when they are needed, so passing new closures does not rebuild anything.
 */
export function ActivityGraphView({ className, style, aspect, placeholder = true, ...options }: ActivityGraphProps) {
  // (the place-holder is rendered here, not by the core, so that it is in the server-rendered page; it fades out when the first picture is on screen)
  const [placeholderState, setPlaceholder] = useState<"shown" | "fading" | "gone">(placeholder ? "shown" : "gone");
  const host = useRef<HTMLDivElement>(null);
  const graph = useRef<ActivityGraph | null>(null);
  // (the latest options, read through stable callbacks)
  const latest = useRef(options);
  latest.current = options;
  const { data, strips, weeks, lite, templatesUrl, theme } = options;
  const custom = !!options.rodColor;
  // (the link is made once, with the graph: a change of it rebuilds the view)
  const attributionKey = JSON.stringify(options.attribution ?? false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const o = latest.current;
    // (the place-holder, the canvas and the overlay are laid over one another in the box: it must be a positioned one)
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const g = createActivityGraph(el, {
      ...o,
      onHover: (i) => latest.current.onHover?.(i),
      placeholder: false,
      onReady: () => {
        setPlaceholder((p) => (p === "shown" ? "fading" : p));
        latest.current.onReady?.();
      },
      onLit: (l) => latest.current.onLit?.(l),
      startup: (ctx) => latest.current.startup?.(ctx),
      rodColor: o.rodColor ? (c) => latest.current.rodColor?.(c) ?? null : undefined,
      background: o.background === undefined ? undefined : (t) => (typeof latest.current.background === "function" ? latest.current.background(t) : (latest.current.background as string)),
    });
    graph.current = g;
    return () => {
      g.destroy();
      graph.current = null;
    };
    // (`theme` is not a dependency: it is changed in place, below)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, strips, weeks, lite, templatesUrl, custom, attributionKey]);
  // (a rebuild of the view starts from the latest colours, which `latest` holds)

  // (new colours rebuild the blocks in place: not the whole view)
  const colorsKey = JSON.stringify(options.colors ?? null);
  const appliedColors = useRef(colorsKey);
  useEffect(() => {
    if (appliedColors.current === colorsKey) return;
    appliedColors.current = colorsKey;
    if (latest.current.colors) graph.current?.setColors(latest.current.colors);
  }, [colorsKey]);

  useEffect(() => {
    graph.current?.setTheme(theme ?? "auto");
  }, [theme]);

  useEffect(() => {
    if (placeholderState !== "fading") return;
    const t = window.setTimeout(() => setPlaceholder("gone"), 450);
    return () => window.clearTimeout(t);
  }, [placeholderState]);

  return (
    <div ref={host} className={className} style={style}>
      {placeholderState !== "gone" && (
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: placeholderState === "fading" ? 0 : 1, transition: "opacity .4s ease" }} dangerouslySetInnerHTML={{ __html: placeholderMarkup({ weeks: options.weeks, strips: options.strips, aspect }) }} />
      )}
    </div>
  );
}

export interface NeonAttributionProps extends AttributionOptions {
  className?: string;
  style?: CSSProperties;
}

/**
 * The "Powered by Neon" link on its own, to put wherever your layout wants it (under the graph, in a footer, in a row of captions): an inline link, not placed over the graph (the `attribution` option is the same link in the
 * graph's bottom right corner). It takes the text colour, faded, and is styled through the same variables (`--nag-attribution-fg`, `--nag-attribution-fg-hover`); `className` and `style` position it. Renders on the server too.
 */
export function NeonAttribution({ className, style, ...options }: NeonAttributionProps) {
  const o = resolveAttribution({ ...options })!;
  const id = `nag-link-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <style>{attributionCss(`#${id}`)}</style>
      <a id={id} className={className} style={style} href={o.href} target={o.target} rel={o.target === "_blank" ? "noopener" : undefined} aria-label={o.text}>
        <span className="nag-in">
          <span className="nag-w">
            {o.text === ATTRIBUTION_TEXT ? (
              <>
                Powered by <b>Neon</b>
              </>
            ) : (
              o.text
            )}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ATTRIBUTION_ARROW.strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ATTRIBUTION_ARROW.paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        </span>
      </a>
    </>
  );
}
