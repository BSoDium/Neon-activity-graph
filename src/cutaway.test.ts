import { describe, expect, it } from "vitest";
import { CUTAWAY_DEFAULTS, circleFalloff, cutFade, cutSeed, easeStep, inFront, resolveCutaway, selectSlot, type CutSlot } from "./cutaway";

describe("inFront", () => {
  it("is 0 beside or behind the rod, 1 clearly nearer the camera, smooth between", () => {
    expect(inFront(0, 0)).toBe(0);
    expect(inFront(-3, 0)).toBe(0);
    expect(inFront(2, 0)).toBe(1);
    const mid = inFront(0.3, 0);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(inFront(0.4, 0)).toBeGreaterThan(inFront(0.2, 0));
  });
});

describe("circleFalloff", () => {
  it("is 1 at the centre, 0 at and beyond the radius, monotonic", () => {
    expect(circleFalloff(0, 100)).toBe(1);
    expect(circleFalloff(100, 100)).toBe(0);
    expect(circleFalloff(250, 100)).toBe(0);
    let prev = 1;
    for (let d = 0; d <= 100; d += 5) {
      const f = circleFalloff(d, 100);
      expect(f).toBeLessThanOrEqual(prev + 1e-12);
      prev = f;
    }
    expect(circleFalloff(5, 0)).toBe(0);
  });
});

describe("cutFade", () => {
  it("combines strength, amount, circle and depth", () => {
    expect(cutFade(0, 100, 2, 0, 0.9, 1)).toBeCloseTo(0.9);
    expect(cutFade(0, 100, 2, 0, 0.9, 0)).toBe(0);
    expect(cutFade(0, 100, -1, 0, 0.9, 1)).toBe(0);
    expect(cutFade(200, 100, 2, 0, 0.9, 1)).toBe(0);
    expect(cutFade(0, 100, 2, 0, 0.9, 0.5)).toBeCloseTo(0.45);
  });
});

describe("easeStep", () => {
  it("approaches the target without overshooting, and lands on it", () => {
    let v = 0;
    for (let i = 0; i < 100; i++) {
      const next = easeStep(v, 1, 16);
      expect(next).toBeGreaterThanOrEqual(v);
      expect(next).toBeLessThanOrEqual(1);
      v = next;
    }
    expect(v).toBe(1);
    expect(easeStep(1, 0, 16)).toBeLessThan(1);
  });
  it("does not depend on how the time is cut up", () => {
    const a = easeStep(easeStep(0, 1, 20), 1, 20);
    const b = easeStep(0, 1, 40);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("resolveCutaway", () => {
  it("is on by default, off for false or a null strength or radius", () => {
    expect(resolveCutaway(undefined)).toEqual(CUTAWAY_DEFAULTS);
    expect(resolveCutaway(true)).toEqual(CUTAWAY_DEFAULTS);
    expect(resolveCutaway(false)).toBeNull();
    expect(resolveCutaway({ strength: 0 })).toBeNull();
    expect(resolveCutaway({ radius: 0 })).toBeNull();
    expect(resolveCutaway({ radius: 40, strength: 3 })).toEqual({ radius: 40, strength: 1 });
  });
});

describe("selectSlot", () => {
  const empty = (): [CutSlot, CutSlot] => [{ cell: -1, amount: 0, target: 0 }, { cell: -1, amount: 0, target: 0 }];
  it("takes a slot for a new cell, and lets go of all of them for none", () => {
    const a = selectSlot(empty(), 5);
    expect(a.filter((s) => s.target === 1)).toHaveLength(1);
    expect(a.find((s) => s.target === 1)!.cell).toBe(5);
    expect(selectSlot(a, -1).every((s) => s.target === 0)).toBe(true);
  });
  it("crosses over: the old cell fades out while the new one comes in, in the other slot", () => {
    let a = selectSlot(empty(), 5);
    a = a.map((s) => (s.cell === 5 ? { ...s, amount: 1 } : s)) as [CutSlot, CutSlot];
    const b = selectSlot(a, 9);
    const old = b.find((s) => s.cell === 5)!;
    const fresh = b.find((s) => s.cell === 9)!;
    expect(old.target).toBe(0);
    expect(old.amount).toBe(1);
    expect(fresh.target).toBe(1);
  });
  it("keeps the slot of the cell it is already on, and brings back one that is fading out", () => {
    let a = selectSlot(empty(), 5);
    const again = selectSlot(a, 5);
    expect(again).toEqual(a);
    a = selectSlot(a, -1).map((s) => (s.cell === 5 ? { ...s, amount: 0.6 } : s)) as [CutSlot, CutSlot];
    const back = selectSlot(a, 5);
    expect(back.find((s) => s.cell === 5)!.target).toBe(1);
    expect(back.find((s) => s.cell === 5)!.amount).toBe(0.6);
  });
});

describe("cutSeed", () => {
  it("spreads the thresholds evenly: n frames cover [0, 1) in n steps of about 1/n", () => {
    const n = 16;
    const s = Array.from({ length: n }, (_, i) => cutSeed(i)).sort((x, y) => x - y);
    for (let i = 1; i < n; i++) expect(s[i]! - s[i - 1]!).toBeLessThan(2 / n);
  });
});
