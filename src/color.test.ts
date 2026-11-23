import { describe, expect, it } from "vitest";
import { DEFAULT_COLORS } from "./graph";
import { clampTone, contrastRatio, invertedOutline, luminance, OUTLINE_CONTRAST, oklchToSrgb, parseColor, sameColor, srgbToOklch, TONE_RANGE } from "./color";

const lch = (hex: string) => srgbToOklch(parseColor(hex));

describe("OKLCH conversion", () => {
  it("round-trips", () => {
    for (const hex of ["#3ddc6a", "#5aa9ff", "#ff3b6b", "#808080", "#ffd60a"]) {
      const back = oklchToSrgb(lch(hex))!;
      const orig = parseColor(hex);
      back.forEach((v, i) => expect(v).toBeCloseTo(orig[i]!, 2));
    }
  });
});

describe("clampTone", () => {
  const hues = Array.from({ length: 12 }, (_, i) => i * 30);
  const at = (L: number, h: number) => {
    let rgb: [number, number, number] | null = null;
    for (let c = 0.15; !rgb; c -= 0.01) rgb = oklchToSrgb({ l: L, c: Math.max(0, c), h });
    return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
  };
  it("brings the lightness of any colour into the range, whatever its hue", () => {
    for (const h of hues) for (const L of [0.2, 0.5, 0.9]) {
      const [, high] = clampTone(at(L, h));
      const out = lch(high);
      expect(out.l).toBeGreaterThanOrEqual(TONE_RANGE.lMin - 0.02);
      expect(out.l).toBeLessThanOrEqual(TONE_RANGE.lMax + 0.02);
      expect(out.c).toBeLessThanOrEqual(TONE_RANGE.cMax + 0.01);
    }
  });
  it("keeps the hue of a chromatic colour", () => {
    for (const h of hues) {
      const src = lch(at(0.5, h));
      const out = lch(clampTone(at(0.5, h))[1]);
      const d = Math.abs(((out.h - src.h + 540) % 360) - 180);
      expect(d).toBeLessThan(6);
    }
  });
  it("makes the quiet tone darker than the busy one, and never black", () => {
    for (const h of hues) for (const L of [0.05, 0.5, 0.95]) {
      const [low, high] = clampTone(at(L, h));
      expect(lch(low).l).toBeLessThan(lch(high).l);
      expect(lch(low).l).toBeGreaterThan(0.4);
    }
  });
  it("leaves a grey grey", () => {
    for (const g of ["#000000", "#808080", "#ffffff"]) expect(lch(clampTone(g)[1]).c).toBeLessThan(0.04);
  });
  it("is stable: clamping twice changes nothing visible", () => {
    for (const h of hues) {
      const once = clampTone(at(0.9, h))[1];
      const twice = clampTone(once)[1];
      expect(lch(twice).l).toBeCloseTo(lch(once).l, 1);
    }
  });
  it("accepts numbers", () => {
    expect(clampTone(0x3ddc6a)).toEqual(clampTone("#3ddc6a"));
  });
});

describe("the default colours take the tuned path", () => {
  it("are recognised however they are written, and nothing near them is", () => {
    for (const layer of ["top", "bottom"] as const) for (const theme of ["light", "dark"] as const) {
      const [low, high] = DEFAULT_COLORS[layer][theme];
      const asHex = (n: number | string) => (typeof n === "number" ? `#${n.toString(16).padStart(6, "0")}` : n);
      expect(sameColor(low, asHex(low))).toBe(true);
      expect(sameColor(high, asHex(high))).toBe(true);
      expect(sameColor(high, low)).toBe(false);
    }
    expect(sameColor("#3ddc6a", 0x0fbf3e)).toBe(false);
  });
});

describe("contrastRatio", () => {
  it("is the WCAG one", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBeCloseTo(0, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 3);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#3ddc6a", "#3ddc6a")).toBe(1);
  });
});

describe("invertedOutline", () => {
  const LIGHT = "#f6f6f4";
  const DARK = "#0b0b0e";
  // (what the graph draws: the stock tones, the demo's palettes)
  // (the light theme's glass is a pale shell over its tone, which is the colour the outline is drawn on)
  const seen = (hex: string, bg: string) => (bg === LIGHT ? "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.45 + 255 * 0.55).toString(16).padStart(2, "0")).join("") : hex);
  const COLOURS = ["#0a8f2c", "#00d63c", "#1658b8", "#1a8cff", "#3ddc6a", "#5aa9ff", "#ff3b6b", "#00c8ff", "#b9ecff", "#ff8a1f", "#c4128a", "#ffd60a"];
  const hueGap = (a: string, b: string) => {
    const d = Math.abs(lch(a).h - lch(b).h) % 360;
    return Math.min(d, 360 - d);
  };

  it("turns the hue half way round (blue to orange, green to magenta)", () => {
    for (const hex of ["#1a8cff", "#3ddc6a", "#ff3b6b", "#c4128a"]) {
      const out = invertedOutline(seen(hex, LIGHT), LIGHT);
      // (the gamut can bend a colour's hue a little when it is made darker)
      expect(Math.abs(hueGap(seen(hex, LIGHT), out) - 180)).toBeLessThan(25);
      expect(lch(out).c).toBeGreaterThan(0.04);
    }
  });

  it("holds the contrast against the page, on both themes, for every colour of the graph", () => {
    // (the light page gets all of the goal, the dark one what a glowing colour leaves: nearly the 3:1 WCAG asks of a graphical object)
    for (const hex of COLOURS) {
      expect(contrastRatio(invertedOutline(seen(hex, LIGHT), LIGHT), LIGHT)).toBeGreaterThanOrEqual(OUTLINE_CONTRAST.background - 0.2);
      expect(contrastRatio(invertedOutline(hex, DARK), DARK)).toBeGreaterThanOrEqual(2.7);
    }
  });

  it("holds the contrast against the cell where the colours allow it, (and never the cell's own colour)", () => {
    for (const bg of [LIGHT, DARK]) for (const hex of COLOURS) {
      const cell = seen(hex, bg);
      expect(contrastRatio(invertedOutline(cell, bg), cell)).toBeGreaterThanOrEqual(2.8);
    }
    // (on the light page every colour of the graph gets the whole of it)
    for (const hex of COLOURS) expect(contrastRatio(invertedOutline(seen(hex, LIGHT), LIGHT), seen(hex, LIGHT))).toBeGreaterThanOrEqual(OUTLINE_CONTRAST.cell - 0.2);
  });

  it("gives a grey cell a grey outline of the opposite lightness, not the cell's own grey", () => {
    for (const bg of [LIGHT, DARK]) for (const hex of ["#202020", "#404040", "#808080", "#a0a0a0", "#c0c0c0", "#e0e0e0"]) {
      const out = invertedOutline(hex, bg);
      expect(lch(out).c).toBeLessThan(0.02);
      expect(contrastRatio(out, hex)).toBeGreaterThan(2.6);
      expect(contrastRatio(out, bg)).toBeGreaterThan(2.6);
    }
    // (a light grey on a light page: near-black; a dark grey on a dark page: near-white)
    expect(lch(invertedOutline("#c0c0c0", LIGHT)).l).toBeLessThan(0.55);
    expect(lch(invertedOutline("#404040", DARK)).l).toBeGreaterThan(0.6);
  });

  it("fades from colour to grey as the cell gets less coloured", () => {
    const chroma = (hex: string) => lch(invertedOutline(hex, LIGHT)).c;
    expect(chroma("#808080")).toBeLessThan(0.01);
    expect(chroma("#7f879c")).toBeGreaterThan(chroma("#808080"));
  });

  it("is a #rrggbb for any input, numbers too", () => {
    expect(invertedOutline(0x1a8cff, 0xffffff)).toMatch(/^#[0-9a-f]{6}$/);
    expect(invertedOutline("#000000", "#000000")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
