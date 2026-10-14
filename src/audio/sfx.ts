/** Synth sound effects (same approach as the legacy game's Web Audio oscillators) plus the music bus. */
import { Music, type TrackId } from './music';

type Sfx = 'shoot' | 'hit' | 'explode' | 'bigExplode' | 'hurt' | 'wave' | 'select' | 'pickup' | 'boss' | 'buy' | 'deny' | 'crit';

const DEFS: Record<Sfx, { type: OscillatorType; f0: number; f1: number; dur: number; vol: number }> = {
  shoot: { type: 'square', f0: 880, f1: 440, dur: 0.06, vol: 0.03 },
  hit: { type: 'square', f0: 300, f1: 200, dur: 0.04, vol: 0.04 },
  crit: { type: 'square', f0: 1400, f1: 700, dur: 0.07, vol: 0.05 },
  explode: { type: 'sawtooth', f0: 160, f1: 40, dur: 0.25, vol: 0.12 },
  bigExplode: { type: 'sawtooth', f0: 110, f1: 25, dur: 0.5, vol: 0.16 },
  hurt: { type: 'triangle', f0: 400, f1: 60, dur: 0.4, vol: 0.2 },
  wave: { type: 'square', f0: 440, f1: 880, dur: 0.3, vol: 0.06 },
  select: { type: 'square', f0: 660, f1: 990, dur: 0.07, vol: 0.05 },
  pickup: { type: 'triangle', f0: 1200, f1: 1800, dur: 0.05, vol: 0.05 },
  boss: { type: 'sawtooth', f0: 80, f1: 160, dur: 1.2, vol: 0.12 },
  buy: { type: 'square', f0: 520, f1: 1560, dur: 0.18, vol: 0.06 },
  deny: { type: 'square', f0: 180, f1: 120, dur: 0.15, vol: 0.06 },
};

export class Audio {
  private ctx?: AudioContext;
  private master?: GainNode;
  private music?: Music;
  private wantedTrack: TrackId | null = null;
  private _muted = false;

  get muted(): boolean { return this._muted; }
  set muted(m: boolean) {
    this._muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  /** Browsers only allow audio after a user gesture, so call this from an input handler. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.music = new Music(this.ctx, this.master);
      this.music.play(this.wantedTrack);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Switch the soundtrack; remembered until audio is unlocked. */
  setMusic(id: TrackId | null): void {
    this.wantedTrack = id;
    this.music?.play(id);
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this._muted) return;
    const d = DEFS[name];
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = d.type;
    osc.frequency.setValueAtTime(d.f0, t);
    osc.frequency.exponentialRampToValueAtTime(d.f1, t + d.dur);
    gain.gain.setValueAtTime(d.vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + d.dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + d.dur);
  }
}
