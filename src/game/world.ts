/**
 * The simulation. It doesn't touch the DOM, so it runs headless in tests.
 * Every velocity is in px/s and every update is scaled by dt.
 */
import { circlesHit, clamp, Rng, wrap } from '../core/math';
import { VIEW_H as H, VIEW_W as W } from '../render/screen';
import { ASTEROID_SIZES, PALETTE, type AlienKind, type ShipId } from '../render/sprites';
import { ALIENS, ASTEROID_HP, ASTEROID_SCORE, SHIPS, WEAPONS, type WeaponId } from './data';
import type { Alien, Asteroid, Bullet, Particle, Ship, WorldEvent } from './entities';
import { planWave, type SpawnOrder } from './waves';

export interface Controls {
  ax: number; ay: number; // -1..1
  boost: boolean;
  fire: boolean;
  weapon?: WeaponId;
}

const SPAWN_GAP = 0.55;
const WAVE_BREAK = 2.0;
const COMBO_WINDOW = 2.5;

export class World {
  readonly rng: Rng;
  ship: Ship;
  bullets: Bullet[] = [];
  asteroids: Asteroid[] = [];
  aliens: Alien[] = [];
  particles: Particle[] = [];
  events: WorldEvent[] = [];

  score = 0;
  combo = 0;
  comboT = 0;
  wave = 0;
  waveBreak = 1.0;
  spawnQueue: SpawnOrder[] = [];
  spawnT = 0;
  over = false;
  godMode = false;
  time = 0;

  constructor(shipId: ShipId, seed = Date.now()) {
    this.rng = new Rng(seed);
    this.ship = {
      id: shipId, x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, r: 4,
      hull: SHIPS[shipId].hull, invuln: 1.5, cooldown: 0, weapon: 'blaster', thrusting: false,
    };
  }

  get fieldClear(): boolean {
    return this.asteroids.length === 0 && this.aliens.length === 0 && this.spawnQueue.length === 0;
  }

  update(dt: number, c: Controls): void {
    this.events = [];
    this.time += dt;
    if (!this.over) this.updateShip(dt, c);
    this.updateWaves(dt);
    this.updateAsteroids(dt);
    this.updateAliens(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    if (!this.over) this.collide();
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
  }

  // ---- ship -------------------------------------------------------------

  private updateShip(dt: number, c: Controls): void {
    const s = this.ship;
    const stats = SHIPS[s.id];
    if (c.weapon) s.weapon = c.weapon;

    const mag = Math.hypot(c.ax, c.ay);
    const ax = mag > 1 ? c.ax / mag : c.ax, ay = mag > 1 ? c.ay / mag : c.ay;
    const boost = c.boost ? 1.8 : 1;
    s.vx += ax * stats.accel * boost * dt;
    s.vy += ay * stats.accel * boost * dt;
    // Frame-rate independent drag (legacy used 0.99 per frame at 60 Hz).
    const drag = Math.pow(0.35, dt);
    s.vx *= drag; s.vy *= drag;
    const max = stats.maxSpeed * (c.boost ? 1.5 : 1);
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > max) { s.vx = (s.vx / sp) * max; s.vy = (s.vy / sp) * max; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    wrap(s, W, H);
    if (sp > 6) s.angle = Math.atan2(s.vy, s.vx);
    s.thrusting = mag > 0.1;
    if (s.thrusting && this.rng.next() < (c.boost ? 0.9 : 0.5)) {
      const back = s.angle + Math.PI;
      this.particles.push({
        x: s.x + Math.cos(back) * 5, y: s.y + Math.sin(back) * 5,
        vx: Math.cos(back + this.rng.range(-0.4, 0.4)) * 40 + s.vx * 0.3,
        vy: Math.sin(back + this.rng.range(-0.4, 0.4)) * 40 + s.vy * 0.3,
        life: 0.25, max: 0.25, color: c.boost ? PALETTE.cyan : PALETTE.orange,
      });
    }

    s.invuln = Math.max(0, s.invuln - dt);
    s.cooldown -= dt;
    if (c.fire && s.cooldown <= 0) this.fire();
  }

  private fire(): void {
    const s = this.ship;
    const w = WEAPONS[s.weapon];
    s.cooldown = w.cooldown * SHIPS[s.id].fireRateMul;
    const nx = Math.cos(s.angle + Math.PI / 2), ny = Math.sin(s.angle + Math.PI / 2);
    for (const p of w.pattern) {
      const a = s.angle + p.angle + this.rng.range(-w.spread, w.spread);
      this.bullets.push({
        x: s.x + Math.cos(s.angle) * 6 + nx * p.side,
        y: s.y + Math.sin(s.angle) * 6 + ny * p.side,
        vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        r: 1.5, life: 0.9, damage: w.damage, hostile: false,
      });
    }
    this.events.push({ type: 'shoot' });
  }

  // ---- waves ------------------------------------------------------------

  private updateWaves(dt: number): void {
    if (this.over) return;
    if (this.fieldClear) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) {
        this.wave++;
        this.spawnQueue = planWave(this.wave, this.rng);
        this.spawnT = 0;
        this.waveBreak = WAVE_BREAK;
        this.events.push({ type: 'waveStart', wave: this.wave });
      }
      return;
    }
    if (this.spawnQueue.length && (this.spawnT -= dt) <= 0) {
      const order = this.spawnQueue.shift()!;
      if (order.what === 'asteroid') this.spawnAsteroid(2);
      else this.spawnAlien(order.kind);
      this.spawnT = SPAWN_GAP;
    }
  }

  /** A point on the screen edge, kept away from the player. */
  private edgePoint(): { x: number; y: number } {
    for (let i = 0; i < 8; i++) {
      const side = this.rng.int(0, 3);
      const p = side === 0 ? { x: this.rng.range(0, W), y: 0 }
        : side === 1 ? { x: W - 1, y: this.rng.range(0, H) }
        : side === 2 ? { x: this.rng.range(0, W), y: H - 1 }
        : { x: 0, y: this.rng.range(0, H) };
      if (Math.hypot(p.x - this.ship.x, p.y - this.ship.y) > 90) return p;
    }
    return { x: 0, y: 0 };
  }

  spawnAsteroid(tier: 0 | 1 | 2, at?: { x: number; y: number }): void {
    const p = at ?? this.edgePoint();
    const speed = this.rng.range(14, 26) * (1 + (2 - tier) * 0.45) * (1 + Math.min(this.wave, 15) * 0.04);
    const a = this.rng.range(0, Math.PI * 2);
    this.asteroids.push({
      x: p.x, y: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      r: ASTEROID_SIZES[tier] * 0.42, tier, hp: ASTEROID_HP[tier],
      variant: this.rng.int(0, 3), rot: this.rng.range(0, 6.28), spin: this.rng.range(-1.2, 1.2), flash: 0,
    });
  }

  spawnAlien(kind: AlienKind, at?: { x: number; y: number }, mini = false): void {
    const p = at ?? this.edgePoint();
    const st = ALIENS[kind];
    this.aliens.push({
      kind, x: p.x, y: p.y, vx: 0, vy: 0, r: mini ? 3 : st.r,
      hp: mini ? st.hp / 2 : st.hp, t: this.rng.range(0, 3), fireT: this.rng.range(1.2, 2.4), flash: 0, mini,
    });
  }

  // ---- enemies ----------------------------------------------------------

  private updateAsteroids(dt: number): void {
    for (const a of this.asteroids) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt;
      a.flash = Math.max(0, a.flash - dt);
      wrap(a, W, H);
    }
  }

  private updateAliens(dt: number): void {
    const s = this.ship;
    const speedUp = 1 + Math.min(this.wave, 20) * 0.03;
    for (const al of this.aliens) {
      al.t += dt;
      al.flash = Math.max(0, al.flash - dt);
      const st = ALIENS[al.kind];
      const dx = s.x - al.x, dy = s.y - al.y;
      const d = Math.hypot(dx, dy) || 1;
      let tx = dx / d, ty = dy / d;
      if (al.kind === 'gunner' && d < 110) { tx = -ty; ty = dx / d; } // strafe at range
      if (al.kind === 'drifter') { tx += Math.cos(al.t * 2) * 0.6; ty += Math.sin(al.t * 2.3) * 0.6; }
      const spd = st.speed * speedUp * (al.mini ? 1.4 : 1);
      // Steer smoothly toward the desired heading.
      const k = 1 - Math.pow(0.05, dt);
      al.vx += (tx * spd - al.vx) * k;
      al.vy += (ty * spd - al.vy) * k;
      al.x += al.vx * dt; al.y += al.vy * dt;
      wrap(al, W, H);

      if (al.kind === 'gunner' && !this.over && (al.fireT -= dt) <= 0) {
        al.fireT = Math.max(0.9, 2.2 - this.wave * 0.08);
        const a = Math.atan2(dy, dx);
        this.bullets.push({ x: al.x, y: al.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, r: 2, life: 3, damage: 1, hostile: true });
      }
    }
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      wrap(b, W, H);
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.vx *= Math.pow(0.2, dt); p.vy *= Math.pow(0.2, dt);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // ---- collisions -------------------------------------------------------

  private collide(): void {
    const s = this.ship;
    for (const b of this.bullets) {
      if (b.life <= 0) continue;
      if (b.hostile) {
        if (circlesHit(b, s)) { b.life = 0; this.hurtPlayer(); }
        continue;
      }
      for (const a of this.asteroids) {
        if (a.hp > 0 && circlesHit(b, a)) { b.life = 0; this.damageAsteroid(a, b.damage); break; }
      }
      if (b.life <= 0) continue;
      for (const al of this.aliens) {
        if (al.hp > 0 && circlesHit(b, al)) { b.life = 0; this.damageAlien(al, b.damage); break; }
      }
    }
    for (const a of this.asteroids) if (a.hp > 0 && circlesHit(a, s)) { this.hurtPlayer(); this.damageAsteroid(a, 999); }
    for (const al of this.aliens) if (al.hp > 0 && circlesHit(al, s)) { this.hurtPlayer(); this.damageAlien(al, 999); }

    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.asteroids = this.asteroids.filter((a) => a.hp > 0);
    this.aliens = this.aliens.filter((a) => a.hp > 0);
  }

  private damageAsteroid(a: Asteroid, dmg: number): void {
    a.hp -= dmg; a.flash = 0.06;
    if (a.hp > 0) { this.events.push({ type: 'hit' }); return; }
    this.burst(a.x, a.y, PALETTE.rock, 6 + a.tier * 6);
    this.addScore(ASTEROID_SCORE[a.tier]);
    this.events.push({ type: 'explode', big: a.tier === 2 });
    if (a.tier > 0) {
      const t = (a.tier - 1) as 0 | 1;
      // Splitting into the asteroids array while iterating it is safe: we filter afterwards.
      this.spawnAsteroid(t, a); this.spawnAsteroid(t, a);
    }
  }

  private damageAlien(al: Alien, dmg: number): void {
    al.hp -= dmg; al.flash = 0.06;
    if (al.hp > 0) { this.events.push({ type: 'hit' }); return; }
    const color = { drifter: PALETTE.green, gunner: PALETTE.magenta, bomber: PALETTE.orange, splitter: PALETTE.purple }[al.kind];
    this.burst(al.x, al.y, color, 14);
    this.addScore(ALIENS[al.kind].score * (al.mini ? 0.5 : 1));
    this.events.push({ type: 'explode', big: al.kind === 'bomber' });
    if (al.kind === 'bomber') {
      // Ring of shrapnel: punishes killing it at point-blank range.
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.bullets.push({ x: al.x, y: al.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, r: 2, life: 0.8, damage: 1, hostile: true });
      }
    }
    if (al.kind === 'splitter' && !al.mini) {
      this.spawnAlien('splitter', { x: al.x - 4, y: al.y }, true);
      this.spawnAlien('splitter', { x: al.x + 4, y: al.y }, true);
    }
  }

  private hurtPlayer(): void {
    const s = this.ship;
    if (s.invuln > 0 || this.godMode) return;
    s.hull--;
    s.invuln = 1.6;
    this.combo = 0;
    this.burst(s.x, s.y, PALETTE.cyan, 18);
    this.events.push({ type: 'playerHit' });
    if (s.hull <= 0) {
      this.over = true;
      this.burst(s.x, s.y, PALETTE.white, 40);
      this.events.push({ type: 'gameOver' });
    }
  }

  private addScore(base: number): void {
    this.combo++;
    this.comboT = COMBO_WINDOW;
    const mult = 1 + clamp(Math.floor(this.combo / 5), 0, 9) * 0.5;
    this.score += Math.round(base * mult);
  }

  get comboMult(): number {
    return 1 + clamp(Math.floor(this.combo / 5), 0, 9) * 0.5;
  }

  private burst(x: number, y: number, color: string, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2), sp = this.rng.range(20, 110);
      const life = this.rng.range(0.25, 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color });
    }
  }
}
