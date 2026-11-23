import { describe, expect, it } from "vitest";
import { dayAfterKey } from "./keys";

describe("dayAfterKey", () => {
  const N = 371; // 53 weeks
  it("walks a week left and right, a day up and down", () => {
    expect(dayAfterKey("ArrowRight", 100, N)).toBe(107);
    expect(dayAfterKey("ArrowLeft", 100, N)).toBe(93);
    expect(dayAfterKey("ArrowDown", 100, N)).toBe(101);
    expect(dayAfterKey("ArrowUp", 100, N)).toBe(99);
  });
  it("goes four weeks with PageUp and PageDown, to the ends with Home and End", () => {
    expect(dayAfterKey("PageDown", 100, N)).toBe(128);
    expect(dayAfterKey("PageUp", 100, N)).toBe(72);
    expect(dayAfterKey("Home", 100, N)).toBe(0);
    expect(dayAfterKey("End", 100, N)).toBe(N - 1);
  });
  it("stays inside the grid", () => {
    expect(dayAfterKey("PageUp", 5, N)).toBe(0);
    expect(dayAfterKey("ArrowLeft", 0, N)).toBe(0);
    expect(dayAfterKey("PageDown", N - 3, N)).toBe(N - 1);
    expect(dayAfterKey("ArrowDown", N - 1, N)).toBe(N - 1);
  });
  it("lands on the latest day when nothing is selected", () => {
    for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown"]) expect(dayAfterKey(k, -1, N)).toBe(N - 1);
  });
  it("leaves other keys alone, and an empty grid", () => {
    for (const k of ["Tab", "Enter", "a", "Escape", "Shift"]) expect(dayAfterKey(k, 10, N)).toBeNull();
    expect(dayAfterKey("End", -1, 0)).toBeNull();
  });
});
