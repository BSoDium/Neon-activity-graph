/**
 * The cutaway: what stands in front of the selected rod fades away in a soft circle round it, so the rod can be seen. Pure maths (the shaders replicate `cutFade`, built from the same constants), kept apart so that it can be tested.
 */

export interface CutawayOptions {
  /** The radius of the clear circle, in CSS pixels at a reference zoom where a day (one grid unit) is 16 px wide: it grows and shrinks with the picture (default 90, about 5.5 days). */
  radius?: number;
  /** How much of what is in front is taken away at the centre of the circle, 0 to 1 (default 0.92: a ghost of it stays, so that the picture keeps its depth). */
  strength?: number;
}

export const CUTAWAY_DEFAULTS = { radius: 90, strength: 0.92 } as const;
/** How many pixels of a day's width the `radius` is given for. */
export const CUTAWAY_REF_PX_PER_UNIT = 16;
/** The part of the radius over which the circle goes from clear to untouched (the falloff is a smoothstep from the centre's plateau to the edge). */
export const CUTAWAY_PLATEAU = 0.35;
/** A thing is "in front" of the rod when it is nearer the camera than the rod's middle by more than `FRONT_FROM` grid units, wholly so from `FRONT_TO` on (smoothstep between: a neighbour at the same depth is left alone). */
export const FRONT_FROM = 0.05;
export const FRONT_TO = 0.6;
/** Eased with this time constant, in ms. */
export const CUTAWAY_TAU_MS = 90;

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Resolves user options: `false` is off, `undefined`/`true` the defaults. */
export function resolveCutaway(o: CutawayOptions | boolean | undefined): { radius: number; strength: number } | null {
  if (o === false) return null;
  const c = typeof o === "object" ? o : {};
  const strength = Math.min(1, Math.max(0, c.strength ?? CUTAWAY_DEFAULTS.strength));
  const radius = Math.max(0, c.radius ?? CUTAWAY_DEFAULTS.radius);
  return strength > 0 && radius > 0 ? { radius, strength } : null;
}

/**
 * How much in front of the selected rod a point is, 0 (not at all) to 1: `depth` is the point's distance toward the camera along the view direction, `rodDepth` the rod's, in grid units.
 */
export const inFront = (depth: number, rodDepth: number): number => smoothstep(FRONT_FROM, FRONT_TO, depth - rodDepth);

/** The soft circle: 1 inside the plateau, 0 from `radius` out, a smoothstep between. `dist` and `radius` in the same unit. */
export const circleFalloff = (dist: number, radius: number): number => (radius <= 0 ? 0 : 1 - smoothstep(radius * CUTAWAY_PLATEAU, radius, dist));

/** The share of a fragment that is taken away by one cutaway, 0 (kept) to `strength`. `amount` is the eased 0..1 in/out. */
export const cutFade = (dist: number, radius: number, depth: number, rodDepth: number, strength: number, amount: number): number => strength * amount * circleFalloff(dist, radius) * inFront(depth, rodDepth);

/** A step of an exponential ease toward `target` (frame-rate independent). */
export const easeStep = (value: number, target: number, dtMs: number, tauMs = CUTAWAY_TAU_MS): number => {
  const next = target + (value - target) * Math.exp(-Math.max(0, dtMs) / tauMs);
  return Math.abs(next - target) < 0.004 ? target : next;
};

export interface CutSlot {
  cell: number;
  amount: number;
  target: number;
}

/**
 * Two slots, so that a change of selection crosses over instead of popping: the old circle fades out while the new one fades in. Returns the slots after selecting `cell` (-1: none): the slot already on that cell (if any) is the
 * target 1, every other one is 0; a new cell takes the slot with the least amount (so a rod that is fading out is the one reused).
 */
export function selectSlot(slots: readonly [CutSlot, CutSlot], cell: number): [CutSlot, CutSlot] {
  const next: [CutSlot, CutSlot] = [{ ...slots[0] }, { ...slots[1] }];
  if (cell < 0) {
    next.forEach((s) => (s.target = 0));
    return next;
  }
  let k = next.findIndex((s) => s.cell === cell && s.target > 0);
  if (k < 0) k = next.findIndex((s) => s.cell === cell && s.amount > 0);
  if (k < 0) {
    k = next[0].amount <= next[1].amount ? 0 : 1;
    next[k] = { cell, amount: next[k]!.amount, target: 1 };
    // (a slot that is still showing another cell would jump: it only gets here when it is the emptier of the two)
    if (next[k]!.amount > 0.5) next[k]!.amount = 0.5;
  }
  next.forEach((s, i) => (s.target = i === k ? 1 : 0));
  return next;
}

/** GLSL for the vertex stage (after `project_vertex`): where the point is in the world and on the screen. */
export const CUT_VERTEX = `  vCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n  vCutN = gl_Position.xy / gl_Position.w;`;

/** GLSL for the fragment stage (first thing in `main`): the point is dropped in proportion to `cutFade`, by comparing it with a threshold that is spread evenly over the frames that are averaged (stratified), so it converges to a smooth fade. */
export const cutFragment = (): string => `
  {
    float cutF = 0.0;
    for (int ci = 0; ci < 2; ci++) {
      vec4 cs = uCutSlot[ci];           // xy: rod xz, z: rod depth, w: amount * strength
      vec2 cc = uCutNdc[ci];
      if (cs.w <= 0.0) continue;
      float inCell = max(abs(vCutW.x - cs.x), abs(vCutW.z - cs.y));
      if (inCell < 0.5) continue;
      float depth = dot(vCutW, uCutView) - cs.z;
      float d = length((vCutN - cc) * 0.5 * uCutSize);
      float fall = 1.0 - smoothstep(uCutRadius * ${CUTAWAY_PLATEAU.toFixed(2)}, uCutRadius, d);
      float front = smoothstep(${FRONT_FROM.toFixed(2)}, ${FRONT_TO.toFixed(2)}, depth);
      cutF = max(cutF, cs.w * fall * front);
    }
    if (cutF > 0.0) {
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      if (fract(ign + uCutSeed) < cutF) discard;
    }
  }`;

export const CUT_DECLS_VERTEX = "varying vec3 vCutW;\nvarying vec2 vCutN;";
export const CUT_DECLS_FRAGMENT = "varying vec3 vCutW;\nvarying vec2 vCutN;\nuniform vec4 uCutSlot[2];\nuniform vec2 uCutNdc[2];\nuniform vec3 uCutView;\nuniform vec2 uCutSize;\nuniform float uCutRadius;\nuniform float uCutSeed;";

/** The sequence of thresholds a pixel sees, one per averaged frame: the golden-ratio step visits [0, 1) evenly, so n frames cover a fade of k/n exactly. */
export const cutSeed = (frame: number): number => (frame * 0.6180339887) % 1;
