/** The grid of days is weeks x 7, oldest first: a week is 7 indices, a day 1, "a month" 4 weeks. */
const STEPS: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1, PageUp: -28, PageDown: 28 };

/**
 * The day a key goes to: the arrows a week (left and right) or a day (up and down), PageUp and PageDown four weeks, Home the first day and End the last, all kept inside the grid. From no day (`current < 0`) the first
 * of them lands on the latest one. `null` for any other key. Pure.
 */
export function dayAfterKey(key: string, current: number, count: number): number | null {
  const last = count - 1;
  if (last < 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return last;
  const step = STEPS[key];
  if (step === undefined) return null;
  return current < 0 ? last : Math.min(last, Math.max(0, current + step));
}
