export interface ClusterInput {
  id: string;
  x: number;
  y: number;
  diameter: number;
}

/** distance/radius ratio at which two equal circles overlap by `frac` of their area */
function distanceRatioForOverlap(frac: number): number {
  const target = frac * Math.PI;
  const area = (k: number) => 2 * Math.acos(k / 2) - (k / 2) * Math.sqrt(Math.max(0, 4 - k * k));
  let lo = 0;
  let hi = 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (area(mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const MAX_OVERLAP_RATIO = distanceRatioForOverlap(0.1);

/**
 * Groups markers that overlap by more than 30% of the sum of their radii and
 * spreads each group in a compact circle around the group's median point so that
 * adjacent markers overlap by at most 10% of their area.
 */
export function spreadOverlapping(items: ClusterInput[]): Record<string, { x: number; y: number }> {
  const parent = new Map<string, string>();
  items.forEach((i) => parent.set(i.id, i.id));
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const sumR = a.diameter / 2 + b.diameter / 2;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const overlap = (sumR - d) / sumR;
      if (overlap > 0.3) union(a.id, b.id);
    }
  }

  const groups = new Map<string, ClusterInput[]>();
  for (const it of items) {
    const r = find(it.id);
    const arr = groups.get(r) ?? [];
    arr.push(it);
    groups.set(r, arr);
  }

  const out: Record<string, { x: number; y: number }> = {};
  for (const group of groups.values()) {
    if (group.length === 1) {
      const g = group[0]!;
      out[g.id] = { x: g.x, y: g.y };
      continue;
    }
    const cx = group.reduce((s, g) => s + g.x, 0) / group.length;
    const cy = group.reduce((s, g) => s + g.y, 0) / group.length;
    const maxD = Math.max(...group.map((g) => g.diameter));
    const n = group.length;
    const neighborDist = (maxD / 2) * MAX_OVERLAP_RATIO;
    const radius = n === 2 ? neighborDist / 2 : neighborDist / (2 * Math.sin(Math.PI / n));
    const sorted = [...group].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    sorted.forEach((g, idx) => {
      const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
      out[g.id] = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    });
  }
  return out;
}