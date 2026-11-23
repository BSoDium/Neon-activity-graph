/**
 * The cutaway: the days that stand in the way of the selected one (they hide it from the camera) fade away, whole, so the selected day can be seen. Pure maths (the picking of the days in the way, the easing), kept apart so that it
 * can be tested; the shader side is a few lines of GLSL at the bottom.
 */

export interface CutawayOptions {
  /** How much of the days in the way is taken away, 0 to 1 (default 0.8: what is left of them is a screen of dots, 1 is gone of them, so that the picture keeps its depth). */
  strength?: number;
  /** The cell of the halftone the blocks in the way are screened with, in CSS pixels (default 6): they are not simply made transparent but turn into a screen of holes that grow with the fade, so that they read as seen through. `0` gives a fine noise instead. */
  dot?: number;
}

export const CUTAWAY_DEFAULTS = { strength: 0.8, dot: 6 } as const;
/** Eased with this time constant, in ms. */
export const CUTAWAY_TAU_MS = 90;
/** The half-width of a day's block, and how far the rays that look for what is in the way are drawn in from the selected day's edge (a neighbour that only brushes its silhouette is not in the way). */
export const BLOCK_HALF = 0.46;
export const SAMPLE_INSET = 0.22;

/** Resolves user options: `false` is off, `undefined`/`true` the defaults. */
export function resolveCutaway(o: CutawayOptions | boolean | undefined): { strength: number; dot: number } | null {
  if (o === false) return null;
  const c = typeof o === "object" ? o : {};
  const strength = Math.min(1, Math.max(0, c.strength ?? CUTAWAY_DEFAULTS.strength));
  const dot = Math.min(32, Math.max(0, c.dot ?? CUTAWAY_DEFAULTS.dot));
  return strength > 0 ? { strength, dot } : null;
}

export interface Box {
  cell: number;
  x: number;
  z: number;
  y0: number;
  y1: number;
  pit?: boolean;
}

/** Whether the ray from `o` along `d` (not both zero) hits the day's box ahead of the origin (the slab method). */
export function rayHitsBox(o: readonly [number, number, number], d: readonly [number, number, number], b: Box): boolean {
  let t0 = 0;
  let t1 = Infinity;
  const slabs = [[o[0], d[0], b.x - BLOCK_HALF, b.x + BLOCK_HALF], [o[1], d[1], b.y0, b.y1], [o[2], d[2], b.z - BLOCK_HALF, b.z + BLOCK_HALF]] as const;
  for (const [oo, dd, lo, hi] of slabs) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < lo || oo > hi) return false;
      continue;
    }
    const a = (lo - oo) / dd;
    const c = (hi - oo) / dd;
    t0 = Math.max(t0, Math.min(a, c));
    t1 = Math.min(t1, Math.max(a, c));
  }
  return t0 <= t1;
}

/** The points of the selected day that must be seen: its blocks' centres, tops and bottoms, and (drawn in a little) their corners. */
export function samplePoints(boxes: readonly Box[]): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const k = BLOCK_HALF - SAMPLE_INSET;
  for (const b of boxes) {
    if (b.pit) continue;
    const h = b.y1 - b.y0;
    for (const y of [b.y0 + Math.min(0.08, h / 3), (b.y0 + b.y1) / 2, b.y1 - Math.min(0.08, h / 3)]) {
      pts.push([b.x, y, b.z]);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([b.x + sx * k, y, b.z + sz * k]);
    }
  }
  return pts;
}

/**
 * The days that are in the way of `cell`: those with a block that one of its points would hit looking toward the camera (`toCamera`, a direction, from the scene to the camera). Pits (the flat tiles of empty days) are never in the way.
 */
export function inTheWay(cell: number, boxes: readonly Box[], toCamera: readonly [number, number, number]): Set<number> {
  const out = new Set<number>();
  if (cell < 0) return out;
  const points = samplePoints(boxes.filter((b) => b.cell === cell));
  for (const b of boxes) {
    if (b.cell === cell || b.pit || out.has(b.cell)) continue;
    for (const p of points) {
      if (rayHitsBox(p, toCamera, b)) {
        out.add(b.cell);
        break;
      }
    }
  }
  return out;
}

/** A step of an exponential ease toward `target` (frame-rate independent). */
export const easeStep = (value: number, target: number, dtMs: number, tauMs = CUTAWAY_TAU_MS): number => {
  const next = target + (value - target) * Math.exp(-Math.max(0, dtMs) / tauMs);
  return Math.abs(next - target) < 0.004 ? target : next;
};

/**
 * One step of every day's fade (in place) toward 1 for the days in the way and 0 for the others. Returns whether anything is still moving.
 */
export function stepFades(fade: Float32Array, wanted: ReadonlySet<number>, dtMs: number): boolean {
  let moving = false;
  for (let i = 0; i < fade.length; i++) {
    const target = wanted.has(i) ? 1 : 0;
    if (fade[i] === target) continue;
    fade[i] = easeStep(fade[i]!, target, dtMs);
    if (fade[i] !== target) moving = true;
  }
  return moving;
}

/** The sequence of thresholds a pixel sees, one per averaged frame: the golden-ratio step visits [0, 1) evenly, so n frames cover a fade of k/n exactly. */
export const cutSeed = (frame: number): number => (frame * 0.6180339887) % 1;

/** GLSL, vertex stage (declarations, then after `begin_vertex`): the day this vertex belongs to. */
export const CUT_DECLS_VERTEX = "attribute float aCell;\nvarying float vCutCell;";
export const CUT_VERTEX = "  vCutCell = aCell;";
/**
 * GLSL, fragment stage: the day's fade is read from a texture, one texel a day. The fragment is dropped where a halftone screen (a 45-degree grid of dots, `uCutDot` pixels a cell) is below the fade: the holes are dots at first, then
 * merge into a mesh, and what is left of the block as it goes is dots of it; the camera's sub-pixel jitter, over the accumulated samples, smooths the edges of the dots. With no dot (`uCutDot` 0), a noise whose threshold is spread evenly over the samples.
 */
export const CUT_DECLS_FRAGMENT = "varying float vCutCell;\nuniform highp sampler2D uCutFade;\nuniform float uCutStrength;\nuniform float uCutSeed;\nuniform float uCutDot;";
export const CUT_FRAGMENT = `
  {
    float cutF = texelFetch(uCutFade, ivec2(int(vCutCell + 0.5), 0), 0).r * uCutStrength;
    if (cutF > 0.0) {
      float th;
      if (uCutDot > 0.5) {
        vec2 q = vec2(gl_FragCoord.x + gl_FragCoord.y, gl_FragCoord.x - gl_FragCoord.y) * (6.2831853 / (uCutDot * 1.4142136));
        th = 0.5 + 0.25 * (cos(q.x) + cos(q.y));
      } else {
        th = fract(fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) + uCutSeed);
      }
      if (th <= cutF) discard;
    }
  }`;
