/** Keyboard state with per-tick "pressed this tick" edges. */
export type Action =
  | 'up' | 'down' | 'left' | 'right' | 'boost' | 'fire'
  | 'pause' | 'confirm' | 'reroll' | 'weapon1' | 'weapon2' | 'weapon3';

const BINDINGS: Record<string, Action> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  Space: 'fire',
  KeyP: 'pause', Escape: 'pause',
  Enter: 'confirm',
  KeyR: 'reroll',
  Digit1: 'weapon1', Digit2: 'weapon2', Digit3: 'weapon3',
};

export class Input {
  private down = new Set<Action>();
  private queued = new Set<Action>();
  private pressedNow = new Set<Action>();
  /** Characters typed since the last tick, for easter-egg codes. */
  typed = '';
  private typedQueue = '';

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      if (e.key.length === 1) this.typedQueue += e.key.toLowerCase();
      const a = BINDINGS[e.code];
      if (!a) return;
      e.preventDefault();
      if (!this.down.has(a)) this.queued.add(a);
      this.down.add(a);
    });
    target.addEventListener('keyup', (e) => {
      const a = BINDINGS[e.code];
      if (a) this.down.delete(a);
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  /** Call once at the start of each simulation tick. */
  beginTick(): void {
    this.pressedNow = this.queued;
    this.queued = new Set();
    this.typed = this.typedQueue;
    this.typedQueue = '';
  }

  held(a: Action): boolean { return this.down.has(a); }
  pressed(a: Action): boolean { return this.pressedNow.has(a); }
}
