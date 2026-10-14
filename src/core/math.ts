export interface Vec { x: number; y: number }
export interface Circle extends Vec { r: number }

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function wrap(p: Vec, w: number, h: number): void {
  if (p.x < 0) p.x += w; else if (p.x >= w) p.x -= w;
  if (p.y < 0) p.y += h; else if (p.y >= h) p.y -= h;
}

export function circlesHit(a: Circle, b: Circle): boolean {
  const dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r;
  return dx * dx + dy * dy < rr * rr;
}

/** Small seedable PRNG (mulberry32) so runs can be replayed and tested. */
export class Rng {
  constructor(private s: number) {}
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
  int(lo: number, hi: number): number { return Math.floor(this.range(lo, hi + 1)); }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
}
