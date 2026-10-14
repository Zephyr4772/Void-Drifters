/**
 * Fixed-timestep game loop. The simulation always advances in STEP-sized ticks,
 * so gameplay speed is the same at 60 Hz, 144 Hz or 30 Hz (the legacy game
 * ran 2.4x faster on a 144 Hz monitor). Rendering gets an interpolation alpha.
 */
export const TICK_RATE = 60;
export const STEP = 1 / TICK_RATE;
const MAX_FRAME = 0.25; // clamp after a tab switch so we don't spiral

export interface LoopHooks {
  update(dt: number): void;
  render(alpha: number): void;
}

export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;

  constructor(private hooks: LoopHooks) {}

  /** Advance by a real-time delta (seconds). Returns ticks run. Exposed for tests. */
  advance(frameSeconds: number): number {
    this.acc += Math.min(frameSeconds, MAX_FRAME);
    let ticks = 0;
    while (this.acc >= STEP) {
      this.hooks.update(STEP);
      this.acc -= STEP;
      ticks++;
    }
    this.hooks.render(this.acc / STEP);
    return ticks;
  }

  start(): void {
    const frame = (t: number) => {
      const dt = this.last ? (t - this.last) / 1000 : 0;
      this.last = t;
      this.advance(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.last = 0;
  }
}
