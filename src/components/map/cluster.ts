export interface ClusterInput {
  id: string;
  x: number;
  y: number;
  diameter: number;
}

/** Rapporto distanza/raggio con sovrapposizione dell'area pari a frac */
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

/** Rapporto minimo distanza/raggio con sovrapposizione max dell'1% dell'area */
const MAX_OVERLAP_RATIO = distanceRatioForOverlap(0.01);

interface Placed {
  x: number;
  y: number;
  r: number;
}

/** 
 * Griglia spaziale a celle per collisioni O(1):
 * cerca conflitti solo nelle celle limitrofe anziché scorrere tutti i marker.
 */
class SpatialGrid {
  private cellSize: number;
  private grid = new Map<string, Placed[]>();

  constructor(cellSize: number = 64) {
    this.cellSize = cellSize;
  }

  insert(p: Placed) {
    const cx = Math.floor(p.x / this.cellSize);
    const cy = Math.floor(p.y / this.cellSize);
    const k = `${cx}:${cy}`;
    let cell = this.grid.get(k);
    if (!cell) {
      cell = [];
      this.grid.set(k, cell);
    }
    cell.push(p);
  }

  collides(x: number, y: number, r: number, maxRadius: number): boolean {
    const searchDist = r + maxRadius;
    const minCx = Math.floor((x - searchDist) / this.cellSize);
    const maxCx = Math.floor((x + searchDist) / this.cellSize);
    const minCy = Math.floor((y - searchDist) / this.cellSize);
    const maxCy = Math.floor((y + searchDist) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const cell = this.grid.get(`${cx}:${cy}`);
        if (!cell) continue;
        for (const p of cell) {
          const minD = MAX_OVERLAP_RATIO * ((r + p.r) / 2);
          const dx = p.x - x;
          const dy = p.y - y;
          if (dx * dx + dy * dy < minD * minD) return true;
        }
      }
    }
    return false;
  }
}

/**
 * Posiziona i marker mantenendo al massimo l'1% di sovrapposizione:
 * ogni marker in conflitto viene spostato nello spazio libero più vicino (ricerca a spirale).
 */
export function spreadOverlapping(items: ClusterInput[]): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (items.length === 0) return out;

  // I marker più grandi (priorità alta) mantengono la posizione reale
  const order = [...items].sort((a, b) => b.diameter - a.diameter);
  const maxDiameter = order[0]?.diameter ?? 32;
  const maxR = maxDiameter / 2;
  const grid = new SpatialGrid(Math.max(48, maxDiameter));

  for (const item of order) {
    const r = item.diameter / 2;
    let x = item.x;
    let y = item.y;

    if (grid.collides(x, y, r, maxR)) {
      const step = Math.max(5, r * 0.5);
      let found = false;
      for (let ring = 1; ring <= 24 && !found; ring++) {
        const radius = ring * step;
        const count = Math.max(8, Math.round((2 * Math.PI * radius) / step));
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
          const cx = item.x + Math.cos(angle) * radius;
          const cy = item.y + Math.sin(angle) * radius;
          if (!grid.collides(cx, cy, r, maxR)) {
            x = cx;
            y = cy;
            found = true;
            break;
          }
        }
      }
    }
    grid.insert({ x, y, r });
    out[item.id] = { x, y };
  }
  return out;
}
