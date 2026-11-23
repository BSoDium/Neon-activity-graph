import { createActivityGraph, fakeLayer, type ActivityGraph, type GraphData, type GraphOptions, type RodContext } from "neon-activity-graph";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const host = $("graph");
const card = $("card");
const status = $("status");

let seed = 1;
const makeData = (): GraphData => ({
  top: fakeLayer({ seed, scale: 14, label: "Commits", unit: "commits" }),
  bottom: fakeLayer({ seed: seed + 100, scale: 6, label: "Coding", unit: "h" }),
});

/** A string of lights: every day one colour of a small palette (a demo of `rodColor`; the values are linear RGB). */
const PALETTE: [number, number, number][] = [[1, 0.003, 0.003], [0, 0.75, 0.04], [1, 0.38, 0], [0.01, 0.045, 1], [1, 0.9, 0.7]];
const lights = ({ index, t }: RodContext): [number, number, number] => {
  const c = PALETTE[(Math.imul(index + 1, 2654435761) >>> 13) % PALETTE.length]!;
  return [c[0] * (0.3 + 0.7 * t), c[1] * (0.3 + 0.7 * t), c[2] * (0.3 + 0.7 * t)];
};

/** Colour sets to try the outline on (a grey pair is the case where the inverse of a colour is the colour itself). */
const tones = (hex: string): [string, string] => {
  const n = parseInt(hex.slice(1), 16);
  const k = (f: number) => `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * f).toString(16).padStart(2, "0")).join("")}`;
  return [k(0.62), hex];
};
const pal = (top: string, bottom: string) => ({ top: { light: tones(top), dark: tones(top) }, bottom: { light: tones(bottom), dark: tones(bottom) } });
const PALETTES: Record<string, GraphOptions["colors"]> = {
  original: undefined,
  technicolor: pal("#ff3b6b", "#00c8ff"),
  ice: pal("#b9ecff", "#3f6bff"),
  sunset: pal("#ff8a1f", "#c4128a"),
  mono: pal("#eeeef2", "#7f879c"),
  grey: pal("#9a9a9a", "#4a4a4a"),
};

let graph: ActivityGraph | null = null;
const options = (): GraphOptions => ({
  data: makeData(),
  strips: Number($<HTMLSelectElement>("strips").value),
  theme: $<HTMLSelectElement>("theme").value as "auto" | "light" | "dark",
  sound: $<HTMLInputElement>("sound").checked,
  lite: $<HTMLInputElement>("lite").checked ? true : "auto",
  grain: Number($<HTMLInputElement>("grain").value),
  overlay: $<HTMLSelectElement>("outline").value === "off" ? false : { card: false, outlineColor: $<HTMLSelectElement>("outline").value as "auto" | "cased" | "text" },
  colors: PALETTES[$<HTMLSelectElement>("palette").value],
  cutaway: $<HTMLInputElement>("cutaway").checked ? { strength: Number($<HTMLInputElement>("cut-strength").value), dot: Number($<HTMLInputElement>("cut-dot").value) } : false,
  rodColor: $<HTMLInputElement>("lights").checked ? lights : undefined,
  background: (theme) => getComputedStyle(document.body).backgroundColor || (theme === "dark" ? "#0b0b0e" : "#f6f6f4"),
  onLit: (lit) => (status.textContent = lit ? "lit" : "starting up…"),
  onHover: (info) => {
    if (!info) return void (card.style.opacity = "0");
    card.textContent = `${info.date}: ${info.top} commits, ${info.bottom} h${info.behind ? ` · ${info.behind.index + 1}/${info.behind.count}` : ""}`;
    card.style.left = `${info.x}px`;
    card.style.top = `${info.y}px`;
    card.style.opacity = "1";
  },
});

(window as unknown as { __nag?: unknown }).__nag = { get graph() { return graph; } };
const mount = () => {
  graph?.destroy();
  host.classList.toggle("narrow", $<HTMLSelectElement>("strips").value === "4");
  graph = createActivityGraph(host, options());
};
const applyTheme = () => {
  const t = $<HTMLSelectElement>("theme").value;
  // (the page's own colours follow the theme, then the graph is told: it re-reads the background)
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
  graph?.setTheme(t as "auto" | "light" | "dark");
};

mount();
$("theme").addEventListener("change", applyTheme);
for (const id of ["strips", "sound", "lite", "grain", "lights", "outline", "palette", "cutaway", "cut-dot", "cut-strength"]) $(id).addEventListener("change", mount);
$("again").addEventListener("click", () => {
  seed++;
  graph?.update(makeData());
});
