/**
 * Pixel-perfect screen: the game draws to a fixed low-res buffer that is
 * scaled up by the largest whole-number factor that fits the window.
 */
export const VIEW_W = 640;
export const VIEW_H = 360;

export class Screen {
  readonly ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement) {
    canvas.width = VIEW_W;
    canvas.height = VIEW_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unsupported');
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private fit(): void {
    // Whole-number scaling keeps pixels crisp; below 2x, scale fractionally
    // to fill the window instead of leaving the game tiny and unreadable.
    const fit = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
    const s = fit >= 2 ? Math.floor(fit) : fit;
    this.canvas.style.width = `${VIEW_W * s}px`;
    this.canvas.style.height = `${VIEW_H * s}px`;
  }
}
