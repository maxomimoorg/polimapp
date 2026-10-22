const STOPS = [
  { p: 0, opacity: 0.6, scale: 0.8 },
  { p: 25, opacity: 0.8, scale: 1.0 },
  { p: 50, opacity: 0.99, scale: 1.4 },
  { p: 100, opacity: 1, scale: 2.5 },
];

export const BASE_MARKER_PX = 34;

export function priorityStyle(priority: number) {
  const p = Math.min(100, Math.max(0, priority));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i]!;
    const b = STOPS[i + 1]!;
    if (p >= a.p && p <= b.p) {
      const t = b.p === a.p ? 0 : (p - a.p) / (b.p - a.p);
      return {
        opacity: a.opacity + (b.opacity - a.opacity) * t,
        scale: a.scale + (b.scale - a.scale) * t,
      };
    }
  }
  return { opacity: 1, scale: 2.5 };
}

export function markerDiameter(priority: number) {
  return BASE_MARKER_PX * priorityStyle(priority).scale;
}
