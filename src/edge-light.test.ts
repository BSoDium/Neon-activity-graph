import { describe, expect, it } from "vitest";
import { sideShares } from "./edge-light";

describe("sideShares", () => {
  it("is nothing without light", () => {
    expect(sideShares([])).toEqual({ pos: [0, 0, 0], neg: [0, 0, 0] });
    expect(sideShares([{ dx: 1, dy: 0, dz: 0, w: 0 }])).toEqual({ pos: [0, 0, 0], neg: [0, 0, 0] });
  });
  it("puts the light of a lamp on the face that turns toward it", () => {
    const s = sideShares([{ dx: 2, dy: 0, dz: 0, w: 3 }]);
    expect(s.pos).toEqual([1, 0, 0]);
    expect(s.neg).toEqual([0, 0, 0]);
    const t = sideShares([{ dx: 0, dy: -1, dz: 0, w: 1 }]);
    expect(t.neg).toEqual([0, 1, 0]);
  });
  it("shares a slanted direction between the faces, and lamps all round give every face its share", () => {
    const s = sideShares([{ dx: 1, dy: 1, dz: 0, w: 1 }]);
    expect(s.pos[0]).toBeCloseTo(Math.SQRT1_2);
    expect(s.pos[1]).toBeCloseTo(Math.SQRT1_2);
    const all = sideShares([{ dx: 1, dy: 0, dz: 0, w: 1 }, { dx: -1, dy: 0, dz: 0, w: 1 }]);
    expect(all.pos[0]).toBeCloseTo(0.5);
    expect(all.neg[0]).toBeCloseTo(0.5);
  });
  it("weighs a bright lamp more than a dim one", () => {
    const s = sideShares([{ dx: 1, dy: 0, dz: 0, w: 3 }, { dx: -1, dy: 0, dz: 0, w: 1 }]);
    expect(s.pos[0]).toBeCloseTo(0.75);
    expect(s.neg[0]).toBeCloseTo(0.25);
  });
});
