/**
 * The light the neighbours of a block give out, by the side it comes from, baked once per block: its weight on each of the six faces (+x +y +z, -x -y -z) as a share of all of it. The glass's rounded edges are lit by the share of
 * the face they turn toward (see the dark glass shader), so an edge lights up on the side that faces the lamps and stays dark on the side that does not, with no ray tracing.
 */
export interface Neighbour {
  dx: number;
  dy: number;
  dz: number;
  /** How much light it gives this block (any unit: only the shares matter). */
  w: number;
}

export function sideShares(neighbours: readonly Neighbour[]): { pos: [number, number, number]; neg: [number, number, number] } {
  const pos: [number, number, number] = [0, 0, 0];
  const neg: [number, number, number] = [0, 0, 0];
  let total = 0;
  for (const { dx, dy, dz, w } of neighbours) {
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1e-6 || w <= 0) continue;
    const d = [dx / dist, dy / dist, dz / dist];
    for (let a = 0; a < 3; a++) {
      pos[a] = pos[a]! + w * Math.max(0, d[a]!);
      neg[a] = neg[a]! + w * Math.max(0, -d[a]!);
    }
    total += w;
  }
  if (total <= 1e-9) return { pos: [0, 0, 0], neg: [0, 0, 0] };
  return { pos: [pos[0] / total, pos[1] / total, pos[2] / total], neg: [neg[0] / total, neg[1] / total, neg[2] / total] };
}
