import { createActivityGraph, DEFAULT_COLORS, fakeLayer, type ActivityGraph, type GraphData, type Tones } from "neon-activity-graph";

// The demo draws the owner's current activity, written by the `activity` workflow to the `data` branch; until that file exists (or if it cannot be fetched) a generated sample is drawn, so the page never shows nothing.
// The place-holder (the flat days) is the package's own: it is there at once and fades out when the scene is ready. The outline and the card are the package's overlay.
const DATA_URL = "https://raw.githubusercontent.com/BSoDium/Neon-activity-graph/data/activity.json";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const host = $("graph");
const stage = $("stage");
const live$ = $("live");
// (the portrait picture, four strips: on a phone, and on any screen that is as tall as it is wide or taller, where one long strip would be a thin line in the middle of it)
const narrow = matchMedia("(max-aspect-ratio: 1/1)");

// (the title is plain markup in the page: there from the first paint, whole. Only the graph's own start-up flickers.)

// --- theme: "system" (follow the visitor's system, the default) or "light" / "dark", chosen with the three words in the text ---
type Theme = "light" | "dark" | null;
let theme: Theme = (() => {
  try {
    const t = localStorage.getItem("nag-theme");
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
})();
const themeButtons = [...document.querySelectorAll<HTMLButtonElement>("button.theme")];
const paintTheme = () => themeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === (theme ?? "system"))));
const applyTheme = (t: Theme) => {
  theme = t;
  if (t) document.documentElement.dataset.theme = t;
  else document.documentElement.removeAttribute("data-theme");
  try {
    if (t) localStorage.setItem("nag-theme", t);
    else localStorage.removeItem("nag-theme");
  } catch {
    /* (no storage: the choice lasts for the visit) */
  }
  paintTheme();
  ask("small");
  // (the page's colours have changed: the graph is told, and re-reads the background)
  graph?.setTheme(t ?? "auto");
};
themeButtons.forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.theme === "system" ? null : (b.dataset.theme as Theme))));
paintTheme();

// --- colours: two layers, a preset or a swatch each; kept in the URL hash ---
type Pair = { top: string; bottom: string };
const PRESETS: Record<string, Pair | null> = {
  Original: null,
  Technicolor: { top: "#ff3b6b", bottom: "#00c8ff" },
  Ice: { top: "#b9ecff", bottom: "#3f6bff" },
  Sunset: { top: "#ff8a1f", bottom: "#c4128a" },
  Mono: { top: "#eeeef2", bottom: "#7f879c" },
};
const ORIGINAL: Pair = { top: "#3ddc6a", bottom: "#5aa9ff" };
const toTones = (hex: string): Tones => {
  const n = parseInt(hex.slice(1), 16);
  const k = (f: number) => `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * f).toString(16).padStart(2, "0")).join("")}`;
  return [k(0.62), hex];
};
const toColors = (p: Pair | null) => (p ? { top: { light: toTones(p.top), dark: toTones(p.top) }, bottom: { light: toTones(p.bottom), dark: toTones(p.bottom) } } : undefined);
const readHash = (): Pair | null => {
  const m = /top=([0-9a-f]{6})&bottom=([0-9a-f]{6})/i.exec(location.hash) ?? /top=([0-9a-f]{6})&bottom=([0-9a-f]{6})/i.exec(localStorage.getItem("nag-colors") ?? "");
  return m ? { top: `#${m[1]}`, bottom: `#${m[2]}` } : null;
};
let pair: Pair | null = readHash();
const paintPage = () => {
  // (the legend and the card follow the layers' colours; the originals are the stylesheet's)
  for (const k of ["top", "bottom"] as const) {
    if (pair) host.closest("body")!.style.setProperty(`--${k}`, pair[k]);
    else host.closest("body")!.style.removeProperty(`--${k}`);
  }
};

// A cling for a change the visitor made sounds when the picture has been redrawn with it (onRedrawn), not on the click: there is a moment between the two.
let pending: { size: "small" | "big"; at: number } | null = null;
const latencies: number[] = [];
const ask = (size: "small" | "big") => (pending = { size, at: performance.now() });
let graph: ActivityGraph | null = null;
let current: GraphData | null = null;

const valid = (v: any): v is GraphData & { generatedAt?: string } => ["top", "bottom"].every((k) => Array.isArray(v?.[k]?.days) && v[k].days.length > 30 && v[k].days.every((d: any) => typeof d?.date === "string" && Number.isFinite(d?.value)));
// The lookup: a proxy (demo/worker) reads GitHub's and WakaTime's public pages, which send no CORS headers. Unset in a build => the field stays hidden and the demo is as it was.
const PROXY = ((import.meta as any).env?.VITE_PROXY_URL as string | undefined) || ((import.meta as any).env?.DEV ? "http://localhost:8787" : "");
const GH_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const WK_RE = /^[A-Za-z0-9_.-]{1,64}$/;
type Source = "github" | "wakatime";
const TIMEOUT_MS = 10_000;
const NAMES: Record<Source, string> = { github: "GitHub", wakatime: "WakaTime" };
/** One source, one request to the proxy. Throws an Error whose message is the one shown under that source's field. `signal` is the form's (a newer lookup aborts this one); the timeout is its own. */
async function lookupOne(source: Source, name: string, signal: AbortSignal): Promise<GraphData> {
  const ctl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctl.abort();
  signal.addEventListener("abort", onAbort);
  const timer = setTimeout(() => ((timedOut = true), ctl.abort()), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${PROXY}/?${new URLSearchParams({ [source]: name })}`, { signal: ctl.signal });
    } catch {
      if (timedOut) throw new Error(`${NAMES[source]} took longer than ${TIMEOUT_MS / 1000} s. Try again.`);
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      throw new Error("Cannot reach the lookup service. Check your connection.");
    }
    if (res.status === 400) throw new Error(`"${name}" is not a valid ${NAMES[source]} username.`);
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after"));
      throw new Error(`Too many lookups. Try again in ${Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : 60} s.`);
    }
    if (res.status === 404) throw new Error(source === "github" ? `No GitHub user called "${name}".` : `WakaTime profile "${name}" is private or missing.`);
    const json = res.ok ? await res.json().catch(() => null) : null;
    if (!valid(json)) throw new Error(`${NAMES[source]} did not answer with readable data. Try again later.`);
    if (json[source === "github" ? "top" : "bottom"].days.every((d: { value: number }) => d.value === 0)) throw new Error(source === "github" ? `"${name}" has no public contributions.` : `"${name}" has no public coding time.`);
    return json;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}
/** The two answers in one picture: GitHub's top layer, WakaTime's bottom layer, matched by date (a day one of them lacks is 0). */
function mergeLayers(gh: GraphData, wk: GraphData): GraphData {
  const dates = [...new Set([...gh.top.days, ...wk.bottom.days].map((d) => d.date))].sort();
  const fill = (days: { date: string; value: number }[]) => {
    const byDate = new Map(days.map((d) => [d.date, d.value]));
    return dates.map((date) => ({ date, value: byDate.get(date) ?? 0 }));
  };
  return { ...gh, top: { ...gh.top, days: fill(gh.top.days) }, bottom: { ...wk.bottom, days: fill(wk.bottom.days) } };
}
async function load(): Promise<{ data: GraphData; live: boolean; at?: string }> {
  try {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    const json = res.ok ? await res.json() : null;
    if (valid(json)) return { data: json, live: true, at: json.generatedAt };
  } catch {
    /* (offline, or no data branch yet: the sample) */
  }
  return { data: { top: fakeLayer({ seed: 3, scale: 14, label: "contributions" }), bottom: fakeLayer({ seed: 103, scale: 6, label: "coded", unit: "h" }) }, live: false };
}

// The caption takes the blocks' left edge from the variable the package sets on the graph box. It is set at once, from the geometry, and replaced by the scene's own value: the caption is only shown (faded in) once it has the first.
// (the theme switch takes the blocks' right edge the same way: its inset from the box's right edge; the page's padding until the bounds are known)
// The scene's own bounds are those of the days that have a block: a year with one or two active days (a nearly empty account, a layer that failed to load) is a box around one block, and the caption and the switch would follow it to
// wherever it stands. What they line up with is the grid of days, whatever is lit: the package's first bounds (laid out from the geometry alone, all the weeks, at the first paint) are kept as proportions of the box, and the scene's
// own are only allowed to widen them. The grid is read again at each mount.
let grid: { l: number; r: number } | null = null;
const copyVar = () => {
  const w = host.clientWidth;
  const l = parseFloat(host.style.getPropertyValue("--nag-content-left"));
  const r = parseFloat(host.style.getPropertyValue("--nag-content-right"));
  if (!Number.isFinite(l) || !Number.isFinite(r) || w <= 0) {
    stage.style.setProperty("--nag-content-left", "0px");
    stage.style.setProperty("--nag-inset-right", "0px");
    return;
  }
  grid ??= { l: l / w, r: r / w };
  stage.style.setProperty("--nag-content-left", `${Math.max(0, Math.min(l, grid.l * w)).toFixed(1)}px`);
  stage.style.setProperty("--nag-inset-right", `${Math.max(0, w - Math.max(r, grid.r * w)).toFixed(1)}px`);
};
new MutationObserver(copyVar).observe(host, { attributes: true, attributeFilter: ["style"] });

const mount = () => {
  graph?.destroy();
  grid = null;
  graph = createActivityGraph(host, {
    data: current,
    strips: narrow.matches ? 4 : 1,
    theme: theme ?? "auto",
    colors: toColors(pair),
    overlay: { outlineColor: new URLSearchParams(location.search).get("outline") === "text" ? "text" : "auto" },
    debug: location.search.includes("debug") || location.search.includes("hold") ? { metrics: location.search.includes("debug"), neonHold: location.search.includes("hold") ? Number(new URLSearchParams(location.search).get("hold")) || true : undefined } : undefined,
    onRedrawn: () => {
      if (!pending) return;
      latencies.push(Math.round(performance.now() - pending.at));
      graph?.cling(pending.size);
      pending = null;
    },
    background: () => getComputedStyle(document.body).backgroundColor,
    // (the hint fades once the visitor has hovered a day)
    onHover: (i) => i && document.body.classList.add("hovered"),
  });
  copyVar();
  $("caption").classList.add("ready");
};
paintPage();
mount();
narrow.addEventListener("change", mount);
const startParams = new URLSearchParams(location.search);
const startWho = (() => {
  if (!PROXY) return null;
  const github = GH_RE.test(startParams.get("github") ?? "") ? startParams.get("github")! : "";
  const wakatime = WK_RE.test(startParams.get("wakatime") ?? "") ? startParams.get("wakatime")! : "";
  return github || wakatime ? { github, wakatime } : null;
})();
const { data, live, at } = await load();
(window as unknown as { __nag?: unknown }).__nag = location.search.includes("debug") ? { get graph() { return graph; }, latencies } : undefined;
current = data;
live$.textContent = live ? `Live data · updated ${new Date(at ?? Date.now()).toLocaleDateString()}` : "Sample data";
(graph as ActivityGraph | null)?.update(data);
const demoLabel = live$.textContent;

// --- the lookup form ---
// Two optional names, at least one. Each given name is its own request, so each field has its own state (idle, loading, done, failed: `data-state` on the field, a mark inside it, the message under it when it failed).
// The button and the graph box show that the form is waiting; a newer lookup aborts the one before; nothing can leave the form stuck. Progress and results are announced in the sr-only live region.
const who = $<HTMLFormElement>("who");
if (PROXY) {
  type State = "idle" | "loading" | "done" | "failed";
  const field = (source: Source, id: string) => ({ source, input: $<HTMLInputElement>(`who-${id}`), box: $(`who-${id}-box`), note: $(`who-${id}-note`) });
  const ghF = field("github", "gh");
  const wkF = field("wakatime", "wk");
  const fields = [ghF, wkF];
  // (a click anywhere in a field, the prefix included, is a click in its input: one address bar)
  for (const f of fields) f.box.addEventListener("pointerdown", (e) => (e.target !== f.input && (e.preventDefault(), f.input.focus())));
  const back = $<HTMLButtonElement>("who-back");
  const go = $<HTMLButtonElement>("who-go");
  const goText = go;
  const msg = $("who-msg");
  const live = $("who-live");
  const legend = { github: document.querySelector<HTMLElement>("#legend .g"), wakatime: document.querySelector<HTMLElement>("#legend .b") };
  const HINT = "GitHub, WakaTime or both";
  // the button: its state, its main line, the line under it (also what the live region says, when `say`)
  const setBtn = (state: State | "failed", main: string, sub: string, nodes?: Node[]) => {
    go.dataset.state = state;
    goText.textContent = main;
    if (nodes) msg.replaceChildren(...nodes);
    else msg.textContent = sub;
    msg.title = sub;
    msg.dataset.state = state;
  };
  who.hidden = false;
  const setState = (f: (typeof fields)[number], state: State, note = "") => {
    f.box.dataset.state = state;
    f.input.setAttribute("aria-invalid", String(state === "failed"));
    if (note) f.note.textContent = note;
    f.note.parentElement!.dataset.open = String(!!note);
  };
  const setBusy = (busy: boolean) => {
    who.setAttribute("aria-busy", String(busy));
    go.disabled = busy;
    for (const f of fields) f.input.readOnly = busy;
    host.classList.toggle("waiting", busy);
  };
  const setUrl = (github: string, wakatime: string) => {
    const q = new URLSearchParams({ ...(github ? { github } : {}), ...(wakatime ? { wakatime } : {}) });
    history.replaceState(null, "", `${location.pathname}${q.size ? `?${q}` : ""}${location.hash}`);
  };
  const reset = () => {
    for (const f of fields) setState(f, "idle");
    legend.github?.classList.remove("off");
    legend.wakatime?.classList.remove("off");
    setBtn("idle", "Load", HINT);
  };
  reset();
  // (editing a name clears what was said about it)
  for (const f of fields) f.input.addEventListener("input", () => {
    if (f.box.dataset.state !== "idle") setState(f, "idle");
    if (go.dataset.state === "done" || go.dataset.state === "failed") setBtn("idle", "Load", HINT);
  });

  let ctl: AbortController | null = null;
  const show = async (names: { github: string; wakatime: string }) => {
    ctl?.abort();
    const mine = (ctl = new AbortController());
    setBusy(true);
    const asked = fields.filter((f) => names[f.source]);
    for (const f of fields) setState(f, asked.includes(f) ? "loading" : "idle");
    // (the button says what is still being read, and what is already in)
    const progress = () => {
      const left = asked.filter((f) => f.box.dataset.state === "loading").map((f) => NAMES[f.source]);
      const got = asked.filter((f) => f.box.dataset.state === "done" || f.box.dataset.state === "failed").map((f) => `${NAMES[f.source]} ${f.box.dataset.state === "done" ? "✓" : "✕"}`);
      return `${got.length ? `${got.join(", ")} · ` : ""}Reading ${left.join(" and ")}…`;
    };
    setBtn("loading", "Loading…", progress());
    live.textContent = progress();
    const answers: Partial<Record<Source, GraphData>> = {};
    const errors: string[] = [];
    try {
      await Promise.all(
        asked.map(async (f) => {
          try {
            answers[f.source] = await lookupOne(f.source, names[f.source], mine.signal);
            if (!mine.signal.aborted) {
              setState(f, "done");
              if (asked.some((o) => o.box.dataset.state === "loading")) setBtn("loading", "Loading…", progress());
            }
          } catch (e) {
            if (mine.signal.aborted) return;
            const text = (e as Error).message;
            setState(f, "failed", text);
            errors.push(text);
            if (asked.some((o) => o.box.dataset.state === "loading")) setBtn("loading", "Loading…", progress());
          }
        }),
      );
      if (mine.signal.aborted) return;
      const gh = answers.github;
      const wk = answers.wakatime;
      const data = gh && wk ? mergeLayers(gh, wk) : gh ?? wk;
      if (data) {
        current = data;
        const shown = asked.filter((f) => answers[f.source]).map((f) => names[f.source]);
        live$.textContent = `${shown.join(" + ")}'s data`;
        legend.github?.classList.toggle("off", !gh);
        legend.wakatime?.classList.toggle("off", !wk);
        setUrl(names.github, names.wakatime);
        mount();
        back.hidden = false;
        const failed = asked.filter((f) => !answers[f.source]).map((f) => NAMES[f.source]);
        const tail = failed.length ? `. ${failed.join(" and ")} failed.` : "";
        // (each name is a link to its profile, in its layer's colour; built with the DOM and encoded, never as HTML)
        const link = (source: Source, name: string) => {
          const a = document.createElement("a");
          a.textContent = name;
          a.className = source === "github" ? "g" : "b";
          a.href = source === "github" ? `https://github.com/${encodeURIComponent(name)}` : `https://wakatime.com/@${encodeURIComponent(name)}`;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          // (an arrow up and to the right, after the name: it opens the profile in another tab)
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
          for (const d of ["M7 17 17 7", "M7 7h10v10"]) {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            svg.append(path);
          }
          a.append(svg);
          return a;
        };
        const nodes: Node[] = [document.createTextNode("Showing ")];
        asked.filter((f) => answers[f.source]).forEach((f, i) => nodes.push(...(i ? [document.createTextNode(" + ")] : []), link(f.source, names[f.source])));
        nodes.push(document.createTextNode(tail));
        setBtn("done", "Loaded", `Showing ${shown.join(" + ")}${tail}`, nodes);
      } else setBtn("failed", "Try again", errors.length === 1 ? errors[0]! : "Neither could be loaded.");
      live.textContent = [data ? msg.textContent : "Nothing to show.", ...errors].join(" ");
    } finally {
      // (only the newest lookup owns the form; an aborted one leaves it to its successor)
      if (ctl === mine) {
        setBusy(false);
        ctl = null;
      }
    }
  };
  back.addEventListener("click", () => {
    ctl?.abort();
    ctl = null;
    setBusy(false);
    for (const f of fields) f.input.value = "";
    current = data;
    live$.textContent = demoLabel;
    setUrl("", "");
    back.hidden = true;
    reset();
    live.textContent = "Showing the demo data.";
    mount();
    ghF.input.focus({ preventScroll: true });
  });
  who.addEventListener("submit", (e) => {
    e.preventDefault();
    if (go.disabled) return;
    const names = { github: ghF.input.value.trim().replace(/^@/, ""), wakatime: wkF.input.value.trim().replace(/^@/, "") };
    for (const f of fields) setState(f, "idle");
    if (!names.github && !names.wakatime) {
      setBtn("failed", "Load", "Type at least one name: GitHub, WakaTime or both.");
      live.textContent = msg.textContent;
      ghF.input.focus();
      return;
    }
    let bad = false;
    if (names.github && !GH_RE.test(names.github)) (setState(ghF, "failed", "A GitHub username is letters, digits and hyphens."), (bad = true));
    if (names.wakatime && !WK_RE.test(names.wakatime)) (setState(wkF, "failed", "A WakaTime username has letters, digits, dots, hyphens and underscores."), (bad = true));
    if (bad) {
      setBtn("failed", "Load", "Check the highlighted name.");
      live.textContent = msg.textContent;
      (ghF.box.dataset.state === "failed" ? ghF : wkF).input.focus();
      return;
    }
    void show(names);
  });
  if (startWho) {
    ghF.input.value = startWho.github;
    wkF.input.value = startWho.wakatime;
    void show(startWho);
  }
}

// --- wide screens: the gap above the top row (legend and theme switch) is the gap under the title ---
// The page is centred as a box, but the text block hangs below the graph's box, so the picture sits low. Measured, and the page moved by half the difference (a transform: nothing is laid out again). Only from the desktop layout up.
{
  const main = document.querySelector<HTMLElement>("main")!;
  const wide = matchMedia("(min-width: 1100px)");
  const balance = () => {
    main.style.transform = "";
    if (!wide.matches) return;
    const top = document.querySelector<HTMLElement>(".themes")!.getBoundingClientRect().top;
    const bottom = innerHeight - $("title").getBoundingClientRect().bottom;
    const up = (top - bottom) / 2;
    // (a page that scrolls is only moved up, and never so far that the top row leaves a gap of less than 8 px)
    const scrolls = document.documentElement.scrollHeight > innerHeight + 1;
    if (Math.abs(up) > 1 && !(scrolls && (up < 0 || top - up < 8))) main.style.transform = `translateY(${(-up).toFixed(1)}px)`;
  };
  new ResizeObserver(balance).observe($("caption"));
  addEventListener("resize", balance);
  wide.addEventListener("change", balance);
  document.fonts?.ready.then(balance);
  balance();
}

// --- the panels: "How it works" and "Colours" (keyboard accessible: Escape closes, so does a click outside) ---
const panels = [
  { panel: $("how"), button: $("how-btn") },
  { panel: $("paint"), button: $("paint-btn") },
];
panels.forEach((p) => (p.panel.tabIndex = -1));
const setOpen = (target: (typeof panels)[number] | null) => {
  for (const p of panels) {
    const open = p === target && p.panel.hidden;
    p.panel.hidden = !open;
    p.button.setAttribute("aria-expanded", String(open));
    if (open) (p.panel.querySelector<HTMLElement>("input, button:not([disabled])") ?? p.panel).focus({ preventScroll: true });
  }
};
panels.forEach((p) => p.button.addEventListener("click", () => setOpen(p)));
addEventListener("keydown", (e) => {
  const open = panels.find((p) => !p.panel.hidden);
  if (e.key === "Escape" && open) {
    setOpen(null);
    open.button.focus();
  }
});
addEventListener("pointerdown", (e) => {
  const open = panels.find((p) => !p.panel.hidden);
  if (open && !open.panel.contains(e.target as Node) && !open.button.contains(e.target as Node)) setOpen(null);
});

// the colour controls
const inTop = $<HTMLInputElement>("c-top");
const inBottom = $<HTMLInputElement>("c-bottom");
const presetBox = $("presets");
const syncInputs = () => {
  inTop.value = (pair ?? ORIGINAL).top;
  inBottom.value = (pair ?? ORIGINAL).bottom;
  presetBox.querySelectorAll("button").forEach((b) => {
    const p = PRESETS[b.dataset.name!];
    b.setAttribute("aria-pressed", String(p ? !!pair && p.top === pair.top && p.bottom === pair.bottom : !pair));
  });
};
const apply = (p: Pair | null) => {
  pair = p;
  paintPage();
  syncInputs();
  const next = p ? `#top=${p.top.slice(1)}&bottom=${p.bottom.slice(1)}` : "";
  history.replaceState(null, "", `${location.pathname}${location.search}${next}`);
  if (p) localStorage.setItem("nag-colors", next.slice(1));
  else localStorage.removeItem("nag-colors");
  // (the package rebuilds the blocks in place: no start-up again, nothing refetched)
  graph?.setColors(toColors(p) ?? { top: DEFAULT_COLORS.top, bottom: DEFAULT_COLORS.bottom });
};
for (const [name, p] of Object.entries(PRESETS)) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.name = name;
  b.innerHTML = `<i style="--a:${(p ?? ORIGINAL).top};--b:${(p ?? ORIGINAL).bottom}"></i>${name}`;
  b.addEventListener("click", () => {
    ask("big");
    apply(p);
  });
  presetBox.append(b);
}
const picked = () => {
  ask("small");
  apply({ top: inTop.value, bottom: inBottom.value });
};
inTop.addEventListener("input", picked);
inBottom.addEventListener("input", picked);
syncInputs();

// The install chip: greyed ("coming soon") until the package is on npm; the registry is asked, so it turns on by itself.
const copy = $<HTMLButtonElement>("copy");
fetch("https://registry.npmjs.org/neon-activity-graph", { headers: { accept: "application/vnd.npm.install-v1+json" } })
  .then((r) => {
    if (!r.ok) return;
    copy.disabled = false;
    copy.textContent = "copy";
    copy.addEventListener("click", async () => {
      await navigator.clipboard?.writeText("npm i neon-activity-graph").catch(() => {});
      copy.textContent = "copied";
      setTimeout(() => (copy.textContent = "copy"), 1500);
    });
  })
  .catch(() => {});
