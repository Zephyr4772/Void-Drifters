/**
 * Procedural chiptune soundtrack: a tiny step sequencer on Web Audio.
 * The tracks are written as code, so there are no audio files and no licensing to track.
 * Uses the standard look-ahead scheduler: a timer wakes every 25 ms and
 * books notes on the audio clock up to 120 ms ahead, so timing stays tight.
 */
export type TrackId = 'calm' | 'action' | 'boss';

interface Track {
  bpm: number;
  /** Chord roots (semitones from A) per bar; the loop length is roots.length bars. */
  roots: number[];
  /** 16 steps per bar. Bass: semitone offset from root, or null for a rest. */
  bass: (number | null)[];
  /** Lead arpeggio: index into the chord tones per step, or null. */
  lead: (number | null)[];
  kick: string; // 16 chars, 'x' = hit
  snare: string;
  hat: string;
  /** Minor or major triad per bar (true = minor). */
  minor: boolean[];
  leadVol: number;
}

const _ = null;

const TRACKS: Record<TrackId, Track> = {
  calm: {
    bpm: 96,
    roots: [0, -4, 3, -2],
    minor: [true, false, false, false],
    bass: [0, _, _, _, _, _, _, _, 7, _, _, _, _, _, _, _],
    lead: [0, _, 1, _, 2, _, 3, _, 2, _, 1, _, 2, _, _, _],
    kick: '................',
    snare: '................',
    hat: '....x.......x...',
    leadVol: 0.035,
  },
  action: {
    bpm: 138,
    roots: [0, -4, 3, -2, 0, -4, 5, 7],
    minor: [true, false, false, false, true, false, true, false],
    bass: [0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 0, 12, 0, _],
    lead: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, _],
    kick: 'x.....x.x.......',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.xx',
    leadVol: 0.028,
  },
  boss: {
    bpm: 162,
    roots: [0, 1, 0, -1],
    minor: [true, false, true, false],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 1, 1, 13, 1],
    lead: [4, _, 3, _, 2, _, 3, _, 4, _, 5, _, 4, 3, 2, 1],
    kick: 'x...x...x...x..x',
    snare: '....x.......x.x.',
    hat: 'xxxxxxxxxxxxxxxx',
    leadVol: 0.03,
  },
};

const A2 = 110;
const freq = (semi: number) => A2 * Math.pow(2, semi / 12);

export class Music {
  private track: TrackId | null = null;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private noise: AudioBuffer;
  private bus: GainNode;

  constructor(private ctx: AudioContext, out: AudioNode) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(out);
    // One second of white noise, reused for snare and hat hits.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  play(id: TrackId | null): void {
    if (id === this.track) return;
    this.track = id;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    clearInterval(this.timer);
    if (id) this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    const t = this.track && TRACKS[this.track];
    if (!t) return;
    const stepDur = 60 / t.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(t, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % (16 * t.roots.length);
    }
  }

  private playStep(t: Track, step: number, at: number, dur: number): void {
    const bar = Math.floor(step / 16), s = step % 16;
    const root = t.roots[bar];
    const third = t.minor[bar] ? 3 : 4;
    const chord = [0, third, 7, 12, 12 + third, 19];

    const b = t.bass[s];
    if (b !== null) this.tone('triangle', freq(root + b - 12), at, dur * 1.8, 0.11);
    const l = t.lead[s];
    if (l !== null) this.tone('square', freq(root + 24 + chord[l]), at, dur * 0.9, t.leadVol);
    if (t.kick[s] === 'x') this.kick(at);
    if (t.snare[s] === 'x') this.hit(at, 0.12, 0.07, 1800);
    if (t.hat[s] === 'x') this.hit(at, 0.03, 0.025, 7000);
  }

  private tone(type: OscillatorType, f: number, at: number, dur: number, vol: number): void {
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    osc.connect(g).connect(this.bus);
    osc.start(at);
    osc.stop(at + dur);
  }

  private kick(at: number): void {
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(40, at + 0.12);
    g.gain.setValueAtTime(0.25, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
    osc.connect(g).connect(this.bus);
    osc.start(at);
    osc.stop(at + 0.16);
  }

  private hit(at: number, dur: number, vol: number, highpass: number): void {
    const src = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    src.buffer = this.noise;
    f.type = 'highpass';
    f.frequency.value = highpass;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(at, Math.random() * 0.5, dur);
  }
}
