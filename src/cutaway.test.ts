import { describe, expect, it } from "vitest";
import { CUTAWAY_DEFAULTS, cutSeed, easeStep, inTheWay, rayHitsBox, resolveCutaway, stepFades, type Box } from "./cutaway";

const box = (cell: number, x: number, z: number, y0: number, y1: number, pit = false): Box => ({ cell, x, z, y0, y1, pit });

describe("rayHitsBox", () => {
  it("hits a box ahead of the origin and not one behind or beside it", () => {
    const d = [0, 0, 1] as const;
    expect(rayHitsBox([0, 1, 0], d, box(1, 0, 3, 0, 2))).toBe(true);
    expect(rayHitsBox([0, 1, 0], d, box(1, 0, -3, 0, 2))).toBe(false);
    expect(rayHitsBox([0, 1, 0], d, box(1, 2, 3, 0, 2))).toBe(false);
    expect(rayHitsBox([0, 5, 0], d, box(1, 0, 3, 0, 2))).toBe(false);
  });
  it("follows a slanted direction", () => {
    const d = [0, 1, 1] as const;
    expect(rayHitsBox([0, 0.5, 0], d, box(1, 0, 3, 0, 5))).toBe(true);
    expect(rayHitsBox([0, 0.5, 0], d, box(1, 0, 3, 0, 1))).toBe(false);
  });
});

describe("inTheWay", () => {
  // the camera is at +z and above: looking from a day toward it goes up as it goes forward
  const toCam = [0, 0.6, 0.8] as const;
  const sel = box(0, 0, 0, 0, 1);
  it("takes a taller day in front, and not the days beside, behind, or too low to hide it", () => {
    const boxes = [sel, box(1, 0, 1, 0, 3), box(2, 3, 0, 0, 3), box(3, 0, -2, 0, 3), box(4, 0, 1, 0, 0.1)];
    expect([...inTheWay(0, boxes, toCam)].sort()).toEqual([1]);
  });
  it("takes every day of a stack that hides it", () => {
    const boxes = [sel, box(1, 0, 1, 0, 3), box(2, 0, 2, 0, 5)];
    expect([...inTheWay(0, boxes, toCam)].sort()).toEqual([1, 2]);
  });
  it("never takes the selected day itself, a pit, or anything for no selection", () => {
    const boxes = [sel, box(1, 0, 1, 0, 3, true)];
    expect(inTheWay(0, boxes, toCam).size).toBe(0);
    expect(inTheWay(-1, [sel, box(1, 0, 1, 0, 3)], toCam).size).toBe(0);
  });
  it("takes a day that hides only a corner of the selected one", () => {
    const boxes = [box(0, 0, 0, 0, 3), box(1, 0.4, 2, 0, 5)];
    expect(inTheWay(0, boxes, toCam).has(1)).toBe(true);
  });
});

describe("easeStep and stepFades", () => {
  it("approaches the target without overshooting and lands on it", () => {
    let v = 0;
    for (let i = 0; i < 100; i++) {
      const next = easeStep(v, 1, 16);
      expect(next).toBeGreaterThanOrEqual(v);
      expect(next).toBeLessThanOrEqual(1);
      v = next;
    }
    expect(v).toBe(1);
  });
  it("does not depend on how the time is cut up", () => {
    expect(easeStep(easeStep(0, 1, 20), 1, 20)).toBeCloseTo(easeStep(0, 1, 40), 6);
  });
  it("fades the wanted days in and the others out, each by itself, and says when it is over", () => {
    const fade = new Float32Array([0, 1, 0.5]);
    let moving = stepFades(fade, new Set([0, 2]), 30);
    expect(moving).toBe(true);
    expect(fade[0]).toBeGreaterThan(0);
    expect(fade[1]).toBeLessThan(1);
    for (let i = 0; i < 200 && moving; i++) moving = stepFades(fade, new Set([0, 2]), 30);
    expect([...fade]).toEqual([1, 0, 1]);
    expect(moving).toBe(false);
  });
  it("jumps at once for an enormous step (reduced motion)", () => {
    const fade = new Float32Array([0, 1]);
    expect(stepFades(fade, new Set([0]), 1e6)).toBe(false);
    expect([...fade]).toEqual([1, 0]);
  });
});

describe("resolveCutaway", () => {
  it("is on by default, off for false or a null strength", () => {
    expect(resolveCutaway(undefined)).toEqual(CUTAWAY_DEFAULTS);
    expect(resolveCutaway(true)).toEqual(CUTAWAY_DEFAULTS);
    expect(resolveCutaway(false)).toBeNull();
    expect(resolveCutaway({ strength: 0 })).toBeNull();
    expect(resolveCutaway({ strength: 3 })).toEqual({ strength: 1, dot: CUTAWAY_DEFAULTS.dot, noise: CUTAWAY_DEFAULTS.noise, variation: CUTAWAY_DEFAULTS.variation });
    expect(resolveCutaway({ dot: 0 })).toEqual({ strength: CUTAWAY_DEFAULTS.strength, dot: 0, noise: CUTAWAY_DEFAULTS.noise, variation: CUTAWAY_DEFAULTS.variation });
    expect(resolveCutaway({ dot: 99 })!.dot).toBe(32);
    expect(resolveCutaway({ noise: 5 })!.noise).toBe(1);
    expect(resolveCutaway({ variation: -1 })!.variation).toBe(0);
  });
});

describe("cutSeed", () => {
  it("spreads the thresholds evenly: n frames cover [0, 1) in steps of about 1/n", () => {
    const n = 16;
    const s = Array.from({ length: n }, (_, i) => cutSeed(i)).sort((x, y) => x - y);
    for (let i = 1; i < n; i++) expect(s[i]! - s[i - 1]!).toBeLessThan(2 / n);
  });
});
