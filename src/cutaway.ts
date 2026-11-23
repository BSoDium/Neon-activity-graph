/**
 * The cutaway: the days that stand in the way of the selected one (they hide it from the camera) fade away, whole, so the selected day can be seen. Pure maths (the picking of the days in the way, the easing), kept apart so that it
 * can be tested; the shader side is a few lines of GLSL at the bottom (how they are used: `cutPatch` in `graph.ts`).
 */

export interface CutawayOptions {
  /** How much of the days in the way is taken away, 0 to 1 (default 1: they fade out completely; less leaves them faint). */
  strength?: number;
}

export const CUTAWAY_DEFAULTS = { strength: 1 } as const;
/** Eased with this time constant, in ms. */
export const CUTAWAY_TAU_MS = 90;
/** The half-width of a day's block, and how far the rays that look for what is in the way are drawn in from the selected day's edge (a neighbour that only brushes its silhouette is not in the way). */
export const BLOCK_HALF = 0.46;
export const SAMPLE_INSET = 0.22;

/** Resolves user options: `false` is off, `undefined`/`true` the defaults. */
export function resolveCutaway(o: CutawayOptions | boolean | undefined): { strength: number } | null {
  if (o === false) return null;
  const c = typeof o === "object" ? o : {};
  const strength = Math.min(1, Math.max(0, c.strength ?? CUTAWAY_DEFAULTS.strength));
  return strength > 0 ? { strength } : null;
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

/** GLSL, vertex stage (declarations): the day this vertex belongs to, and its fade, read from a texture of one texel a day (once a vertex: the fade is the same over a whole block). */
export const CUT_DECLS_VERTEX = "attribute float aCell;\nuniform highp sampler2D uCutFade;\nuniform float uCutStrength;\nvarying float vCutF;";
const CUT_FETCH = "  vCutF = texelFetch(uCutFade, ivec2(int(aCell + 0.5), 0), 0).r * uCutStrength;";
/**
 * GLSL, vertex stage, after `begin_vertex`. A block that is fading is drawn by its fading twin (a mesh of its own, shown only then) and not by its solid self, which collapses it to a point out of view (no triangle, no fragment, no depth): so
 * the solid blocks keep the opaque pipeline (and the depth buffer) exactly as at rest, and only what fades is blended.
 */
export const CUT_VERTEX_SOLID = CUT_FETCH;
/** (the collapse is done on the clip-space position, after `project_vertex`, out of the clip volume: the position of a block that is drawn is computed exactly as without the cutaway, to the last bit) */
export const CUT_VERTEX_SOLID_END = "  if (vCutF > 0.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);";
export const CUT_VERTEX_FADING = CUT_FETCH;
export const CUT_VERTEX_LIGHT = CUT_FETCH;
export const CUT_DECLS_FRAGMENT = "varying float vCutF;";
/** GLSL, after `opaque_fragment`: the fading twin's alpha is the fade alone (set last, so that nothing three.js puts in the alpha, such as the transmitted picture's, which can be over 1 where the additive rods are, gets into the blending). */
export const CUT_FRAGMENT_FADING = "  gl_FragColor.a = 1.0 - vCutF;";
/** GLSL, before `opaque_fragment`: a light that is drawn additively (a rod) fades by its colour. */
export const CUT_FRAGMENT_LIGHT = "  outgoingLight *= 1.0 - vCutF;";
