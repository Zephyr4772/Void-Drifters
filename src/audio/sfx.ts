/** Synth sound effects (same approach as the legacy game's Web Audio oscillators). */
type Sfx = 'shoot' | 'hit' | 'explode' | 'bigExplode' | 'hurt' | 'wave' | 'select';

const DEFS: Record<Sfx, { type: OscillatorType; f0: number; f1: number; dur: number; vol: number }> = {
  shoot: { type: 'square', f0: 880, f1: 440, dur: 0.06, vol: 0.04 },
  hit: { type: 'square', f0: 300, f1: 200, dur: 0.04, vol: 0.04 },
  explode: { type: 'sawtooth', f0: 160, f1: 40, dur: 0.25, vol: 0.12 },
  bigExplode: { type: 'sawtooth', f0: 110, f1: 25, dur: 0.5, vol: 0.16 },
  hurt: { type: 'triangle', f0: 400, f1: 60, dur: 0.4, vol: 0.2 },
  wave: { type: 'square', f0: 440, f1: 880, dur: 0.3, vol: 0.06 },
  select: { type: 'square', f0: 660, f1: 990, dur: 0.07, vol: 0.05 },
};

export class Audio {
  private ctx?: AudioContext;
  muted = false;

  /** Browsers only allow audio after a user gesture, so call this from a key handler. */
  unlock(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const d = DEFS[name];
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = d.type;
    osc.frequency.setValueAtTime(d.f0, t);
    osc.frequency.exponentialRampToValueAtTime(d.f1, t + d.dur);
    gain.gain.setValueAtTime(d.vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + d.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + d.dur);
  }
}
