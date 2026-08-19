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

/** rapporto minimo distanza/raggio con sovrapposizione max dell'1% dell'area */
const MAX_OVERLAP_RATIO = distanceRatioForOverlap(0.01);

interface Placed {
  x: number;
  y: number;
  r: number;
}

function minDistance(rA: number, rB: number) {
  return MAX_OVERLAP_RATIO * ((rA + rB) / 2);
}

function collides(x: number, y: number, r: number, placed: Placed[]) {
  for (const p of placed) {
    if (Math.hypot(p.x - x, p.y - y) < minDistance(r, p.r)) return true;
  }
  return false;
}

/**
 * Posiziona i marker mantenendo al massimo l'1% di sovrapposizione d'area:
 * ogni marker in conflitto viene spostato nel primo spazio libero disponibile
 * più vicino alla sua posizione reale (ricerca a spirale).
 */
export function spreadOverlapping(items: ClusterInput[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  const placed: Placed[] = [];
  // i marker più grandi (priorità alta) restano nella posizione reale
  const order = [...items].sort((a, b) => b.diameter - a.diameter);

  for (const item of order) {
    const r = item.diameter / 2;
    let x = item.x;
    let y = item.y;
    if (collides(x, y, r, placed)) {
      const step = Math.max(4, r * 0.5);
      let found = false;
      for (let ring = 1; ring <= 40 && !found; ring++) {
        const radius = ring * step;
        const count = Math.max(8, Math.round((2 * Math.PI * radius) / step));
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const cx = item.x + Math.cos(angle) * radius;
          const cy = item.y + Math.sin(angle) * radius;
          if (!collides(cx, cy, r, placed)) {
            x = cx;
            y = cy;
            found = true;
            break;
          }
        }
      }
    }
    placed.push({ x, y, r });
    out[item.id] = { x, y };
  }
  return out;
}
