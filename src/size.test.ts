import { describe, expect, it } from "vitest";
import { heldPicture, renderSize } from "./size";

describe("renderSize", () => {
  it("follows the container at the device's pixel ratio, up to 2", () => {
    expect(renderSize({ cssWidth: 1000, cssHeight: 250, devicePixelRatio: 3, lite: false })).toMatchObject({ width: 2000, height: 500, ratio: 2 });
    expect(renderSize({ cssWidth: 1000, cssHeight: 250, devicePixelRatio: 1.5, lite: false })).toMatchObject({ width: 1500, height: 375 });
  });
  it("is 1 on a lite device", () => {
    expect(renderSize({ cssWidth: 1000, cssHeight: 250, devicePixelRatio: 3, lite: true }).ratio).toBe(1);
  });
  it("scales down past the pixel budget and the texture size, keeping the aspect", () => {
    const s = renderSize({ cssWidth: 2560, cssHeight: 645, devicePixelRatio: 2, lite: false, maxPixels: 2_000_000 });
    expect(s.width * s.height).toBeLessThanOrEqual(2_000_000 * 1.01);
    expect(s.width / s.height).toBeCloseTo(2560 / 645, 1);
    expect(renderSize({ cssWidth: 6000, cssHeight: 100, devicePixelRatio: 1, lite: false, maxSize: 4096 }).width).toBeLessThanOrEqual(4096);
  });
});

describe("heldPicture", () => {
  it("scales the last picture with the box, keeping its aspect, centred", () => {
    const p = heldPicture({ width: 1000, height: 450 }, { width: 500, height: 225 })!;
    expect(p).toMatchObject({ width: 500, height: 225, left: 0, top: 0, scale: 0.5 });
    const grown = heldPicture({ width: 1000, height: 450 }, { width: 1500, height: 675 })!;
    expect(grown.scale).toBeCloseTo(1.5);
  });
  it("fits (never crops) when the box's aspect changes, and centres", () => {
    const p = heldPicture({ width: 1000, height: 500 }, { width: 600, height: 600 })!;
    expect(p.width).toBe(600);
    expect(p.height).toBe(300);
    expect(p.left).toBe(0);
    expect(p.top).toBe(150);
  });
  it("is null before there is a picture or a box", () => {
    expect(heldPicture({ width: 0, height: 0 }, { width: 100, height: 100 })).toBeNull();
    expect(heldPicture({ width: 100, height: 100 }, { width: 0, height: 100 })).toBeNull();
  });
});
