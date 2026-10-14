/**
 * The simulation. It doesn't touch the DOM, so it runs headless in tests.
 * Every velocity is in px/s and every update is scaled by dt.
 */
import { circlesHit, clamp, Rng, wrap } from '../core/math';
import { VIEW_H as H, VIEW_W as W } from '../render/screen';
import { ASTEROID_SIZES, PALETTE, type AlienKind, type ShipId } from '../render/sprites';
import { ALIENS, ASTEROID_HP, ASTEROID_SCORE, SHIPS, WEAPONS, type WeaponId } from './data';
import type { Alien, Asteroid, Boss, Bullet, Particle, Pickup, Ship, Telegraph, WorldEvent } from './entities';
import { runConfigFromMeta, type RunConfig } from './meta';
import { rollUpgrades, type RunMods, type UpgradeDef, type UpgradeTarget } from './upgrades';
import { isBossWave, planWave, type SpawnOrder } from './waves';

export interface Controls {
  ax: number; ay: number; // -1..1
  boost: boolean;
  fire: boolean;
  weapon?: WeaponId;
}

const SPAWN_GAP = 0.55;
const TELEGRAPH_TIME = 0.8; // warning before an enemy appears at the edge
const WAVE_BREAK = 1.2;
const COMBO_WINDOW = 2.5;
const ALIEN_COLOR: Record<AlienKind, string> = {
  drifter: PALETTE.green, gunner: PALETTE.magenta, bomber: PALETTE.orange, splitter: PALETTE.purple,
};

export class World {
  readonly rng: Rng;
  ship: Ship;
  mods: RunMods;
  weapons: WeaponId[];
  rerolls: number;
  taken: Record<string, number> = {};

  bullets: Bullet[] = [];
  asteroids: Asteroid[] = [];
  aliens: Alien[] = [];
  boss: Boss | null = null;
  pickups: Pickup[] = [];
  telegraphs: Telegraph[] = [];
  particles: Particle[] = [];
  events: WorldEvent[] = [];

  score = 0;
  scrap = 0;
  combo = 0;
  comboT = 0;
  wave = 0;
  waveBreak = 1.0;
  /** Set when a wave is cleared; the run is frozen until an upgrade is picked. */
  awaitingPick = false;
  spawnQueue: SpawnOrder[] = [];
  spawnT = 0;
  over = false;
  godMode = false;
  time = 0;

  constructor(shipId: ShipId, seed = Date.now(), config: RunConfig = runConfigFromMeta({})) {
    this.rng = new Rng(seed);
    this.mods = { ...config.mods };
    this.weapons = [...config.weapons];
    this.rerolls = config.rerolls;
    this.ship = {
      id: shipId, x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, r: 4,
      hull: 0, invuln: 1.5, cooldown: 0, weapon: 'blaster', thrusting: false,
    };
    this.ship.hull = this.maxHull;
  }

  get maxHull(): number {
    return SHIPS[this.ship.id].hull + this.mods.maxHullBonus;
  }

  get fieldClear(): boolean {
    return this.asteroids.length === 0 && this.aliens.length === 0 && !this.boss
      && this.spawnQueue.length === 0 && this.telegraphs.length === 0;
  }

  get comboMult(): number {
    return 1 + clamp(Math.floor(this.combo / 5), 0, 9) * 0.5;
  }

  update(dt: number, c: Controls): void {
    this.events = [];
    this.time += dt;
    if (!this.over) this.updateShip(dt, c);
    this.updateWaves(dt);
    this.updateTelegraphs(dt);
    this.updateAsteroids(dt);
    this.updateAliens(dt);
    this.updateBoss(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    if (!this.over) this.collide();
    if (this.comboT > 0 && (this.comboT -= dt) <= 0) this.combo = 0;
  }

  // ---- upgrades ---------------------------------------------------------

  private get upgradeTarget(): UpgradeTarget {
    return {
      mods: this.mods,
      weapons: this.weapons,
      hull: this.ship.hull,
      maxHull: this.maxHull,
      heal: (n) => { this.ship.hull = Math.min(this.maxHull, this.ship.hull + n); },
    };
  }

  rollUpgrades(n = 3): UpgradeDef[] {
    return rollUpgrades(this.rng, this.taken, this.upgradeTarget, n);
  }

  /** Apply the chosen upgrade (or none) and let the next wave begin. */
  finishPick(choice: UpgradeDef | null): void {
    if (choice) {
      this.taken[choice.id] = (this.taken[choice.id] ?? 0) + 1;
      choice.apply(this.upgradeTarget);
    }
    this.awaitingPick = false;
    this.waveBreak = WAVE_BREAK;
  }

  // ---- ship -------------------------------------------------------------

  private updateShip(dt: number, c: Controls): void {
    const s = this.ship;
    const stats = SHIPS[s.id];
    if (c.weapon && this.weapons.includes(c.weapon)) s.weapon = c.weapon;

    const mag = Math.hypot(c.ax, c.ay);
    const ax = mag > 1 ? c.ax / mag : c.ax, ay = mag > 1 ? c.ay / mag : c.ay;
    const boost = c.boost ? 1.8 : 1;
    s.vx += ax * stats.accel * this.mods.speedMul * boost * dt;
    s.vy += ay * stats.accel * this.mods.speedMul * boost * dt;
    // Frame-rate independent drag (legacy used 0.99 per frame at 60 Hz).
    const drag = Math.pow(0.35, dt);
    s.vx *= drag; s.vy *= drag;
    const max = stats.maxSpeed * this.mods.speedMul * (c.boost ? 1.5 : 1);
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
        life: 0.25, max: 0.25, color: c.boost ? PALETTE.cyan : PALETTE.orange, size: 1,
      });
    }

    s.invuln = Math.max(0, s.invuln - dt);
    s.cooldown -= dt;
    if (c.fire && s.cooldown <= 0 && !this.awaitingPick) this.fire();
  }

  private fire(): void {
    const s = this.ship, m = this.mods;
    const w = WEAPONS[s.weapon];
    s.cooldown = w.cooldown * SHIPS[s.id].fireRateMul * m.cooldownMul;
    const pattern = [...w.pattern];
    // Split Barrel: extra shots fan out alternately left and right of the base pattern.
    for (let k = 1; k <= m.extraShots; k++) {
      pattern.push({ angle: (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.14, side: 0 });
    }
    const nx = Math.cos(s.angle + Math.PI / 2), ny = Math.sin(s.angle + Math.PI / 2);
    for (const p of pattern) {
      const a = s.angle + p.angle + this.rng.range(-w.spread, w.spread);
      const crit = this.rng.next() < m.critChance ? 2 : 1;
      this.bullets.push({
        x: s.x + Math.cos(s.angle) * 6 + nx * p.side,
        y: s.y + Math.sin(s.angle) * 6 + ny * p.side,
        vx: Math.cos(a) * w.speed * m.bulletSpeedMul, vy: Math.sin(a) * w.speed * m.bulletSpeedMul,
        r: crit > 1 ? 2 : 1.5, life: 0.9, damage: w.damage * m.damageMul * crit, hostile: false,
        pierce: m.pierce, lastHit: null, crit: crit > 1,
      });
    }
    this.events.push({ type: 'shoot' });
  }

  // ---- waves ------------------------------------------------------------

  private updateWaves(dt: number): void {
    if (this.over || this.awaitingPick) return;
    if (this.fieldClear) {
      if (this.wave > 0 && this.waveBreak <= 0) {
        // Wave just cleared: vacuum up leftover scrap and ask for an upgrade.
        for (const p of this.pickups) this.scrap += p.value * this.mods.scrapMul;
        this.pickups = [];
        this.awaitingPick = true;
        this.waveBreak = WAVE_BREAK;
        this.events.push({ type: 'waveCleared', wave: this.wave });
        return;
      }
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) this.startWave();
      return;
    }
    if (this.spawnQueue.length && (this.spawnT -= dt) <= 0) {
      const order = this.spawnQueue.shift()!;
      if (order.what === 'boss') this.spawnBoss();
      else this.telegraphs.push({ ...this.edgePoint(), t: TELEGRAPH_TIME, order });
      this.spawnT = SPAWN_GAP;
    }
  }

  private updateTelegraphs(dt: number): void {
    for (const tg of this.telegraphs) {
      if ((tg.t -= dt) > 0) continue;
      if (tg.order.what === 'asteroid') this.spawnAsteroid(2, tg);
      else this.spawnAlien(tg.order.kind, tg);
    }
    this.telegraphs = this.telegraphs.filter((tg) => tg.t > 0);
  }

  private startWave(): void {
    this.wave++;
    this.spawnQueue = planWave(this.wave, this.rng);
    this.spawnT = 0;
    this.waveBreak = 0; // stays <= 0 while the wave runs, so clearing it triggers the pick
    this.events.push({ type: 'waveStart', wave: this.wave, boss: isBossWave(this.wave) });
  }

  /** A point on the screen edge, kept away from the player. */
  private edgePoint(): { x: number; y: number } {
    for (let i = 0; i < 8; i++) {
      const side = this.rng.int(0, 3);
      const p = side === 0 ? { x: this.rng.range(0, W), y: 0 }
        : side === 1 ? { x: W - 1, y: this.rng.range(0, H) }
        : side === 2 ? { x: this.rng.range(0, W), y: H - 1 }
        : { x: 0, y: this.rng.range(0, H) };
      if (Math.hypot(p.x - this.ship.x, p.y - this.ship.y) > 110) return p;
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
      kind, x: p.x, y: p.y, vx: 0, vy: 0, r: mini ? 4 : st.r,
      hp: mini ? st.hp / 2 : st.hp, t: this.rng.range(0, 3), fireT: this.rng.range(1.2, 2.4), flash: 0, mini,
    });
  }

  spawnBoss(): void {
    const tier = Math.max(1, Math.floor(this.wave / 5));
    const hp = 500 + (tier - 1) * 350;
    this.boss = {
      x: W / 2, y: -30, vx: 0, vy: 40, r: 20, hp, maxHp: hp,
      t: 0, attackT: 2, pattern: 0, flash: 0, tier,
    };
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
        this.enemyShot(al.x, al.y, Math.atan2(dy, dx), 110);
      }
    }
  }

  private updateBoss(dt: number): void {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    // Drift along a slow figure-eight over the arena.
    const tx = W / 2 + Math.sin(b.t * 0.45) * 200;
    const ty = H / 2 - 30 + Math.sin(b.t * 0.9) * 70;
    const k = 1 - Math.pow(0.2, dt);
    b.vx += ((tx - b.x) * 0.9 - b.vx) * k;
    b.vy += ((ty - b.y) * 0.9 - b.vy) * k;
    b.x += b.vx * dt; b.y += b.vy * dt;

    if (this.over || (b.attackT -= dt) > 0) return;
    const enraged = b.hp < b.maxHp / 2;
    const aim = Math.atan2(this.ship.y - b.y, this.ship.x - b.x);
    switch (b.pattern % 3) {
      case 0: { // ring
        const n = 12 + b.tier * 2 + (enraged ? 4 : 0);
        const off = b.t;
        for (let i = 0; i < n; i++) this.enemyShot(b.x, b.y, off + (i / n) * Math.PI * 2, 70);
        break;
      }
      case 1: // aimed fan
        for (let i = -2; i <= 2; i++) this.enemyShot(b.x, b.y, aim + i * 0.22, 105);
        break;
      case 2: // aimed stream: three shots at staggered speeds arrive one after another
        for (const sp of [150, 125, 100]) this.enemyShot(b.x, b.y, aim, sp);
        break;
    }
    b.pattern++;
    b.attackT = Math.max(0.8, 1.7 - b.tier * 0.15) * (enraged ? 0.75 : 1);
  }

  private enemyShot(x: number, y: number, angle: number, speed: number, life = 3.5): void {
    this.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      r: 2, life, damage: 1, hostile: true, pierce: 0, lastHit: null,
    });
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      wrap(b, W, H);
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private updatePickups(dt: number): void {
    const s = this.ship;
    for (const p of this.pickups) {
      p.life -= dt;
      const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (!this.over && d < this.mods.magnet) {
        p.vx = (dx / d) * 170; p.vy = (dy / d) * 170;
      } else {
        p.vx *= Math.pow(0.1, dt); p.vy *= Math.pow(0.1, dt);
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      wrap(p, W, H);
      if (!this.over && d < 6) {
        p.life = 0;
        this.scrap += p.value * this.mods.scrapMul;
        this.events.push({ type: 'pickup' });
      }
    }
    this.pickups = this.pickups.filter((p) => p.life > 0);
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.vx *= Math.pow(0.2, dt); p.vy *= Math.pow(0.2, dt);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private dropScrap(x: number, y: number, count: number, value = 1): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2), sp = this.rng.range(20, 60);
      this.pickups.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, value, life: 10 });
    }
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
      const target =
        this.asteroids.find((a) => a.hp > 0 && a !== b.lastHit && circlesHit(b, a)) ??
        this.aliens.find((a) => a.hp > 0 && a !== b.lastHit && circlesHit(b, a)) ??
        (this.boss && this.boss !== b.lastHit && circlesHit(b, this.boss) ? this.boss : null);
      if (!target) continue;
      if (target === this.boss) this.damageBoss(b.damage);
      else if ('tier' in target) this.damageAsteroid(target as Asteroid, b.damage);
      else this.damageAlien(target as Alien, b.damage);
      if (b.crit) this.events.push({ type: 'crit', x: b.x, y: b.y, amount: Math.round(b.damage) });
      b.lastHit = target;
      if (b.pierce-- <= 0) b.life = 0;
    }
    for (const a of this.asteroids) if (a.hp > 0 && circlesHit(a, s)) { this.hurtPlayer(); this.damageAsteroid(a, 999); }
    for (const al of this.aliens) if (al.hp > 0 && circlesHit(al, s)) { this.hurtPlayer(); this.damageAlien(al, 999); }
    if (this.boss && circlesHit(this.boss, s)) this.hurtPlayer();

    this.bullets = this.bullets.filter((b) => b.life > 0);
    this.asteroids = this.asteroids.filter((a) => a.hp > 0);
    this.aliens = this.aliens.filter((a) => a.hp > 0);
  }

  private damageAsteroid(a: Asteroid, dmg: number): void {
    a.hp -= dmg; a.flash = 0.06;
    if (a.hp > 0) { this.events.push({ type: 'hit' }); return; }
    this.burst(a.x, a.y, PALETTE.rock, 6 + a.tier * 6, 2 + a.tier * 3);
    this.addScore(ASTEROID_SCORE[a.tier]);
    this.events.push({ type: 'explode', big: a.tier === 2, x: a.x, y: a.y });
    if (a.tier === 0 && this.rng.next() < 0.35) this.dropScrap(a.x, a.y, 1);
    if (a.tier > 0) {
      const t = (a.tier - 1) as 0 | 1;
      // Pushing new pieces while iterating is safe: the array is filtered afterwards.
      this.spawnAsteroid(t, a); this.spawnAsteroid(t, a);
    }
  }

  private damageAlien(al: Alien, dmg: number): void {
    al.hp -= dmg; al.flash = 0.06;
    if (al.hp > 0) { this.events.push({ type: 'hit' }); return; }
    this.burst(al.x, al.y, ALIEN_COLOR[al.kind], 14, 4);
    this.addScore(ALIENS[al.kind].score * (al.mini ? 0.5 : 1));
    this.events.push({ type: 'explode', big: al.kind === 'bomber', x: al.x, y: al.y });
    this.dropScrap(al.x, al.y, al.mini ? 1 : ALIENS[al.kind].cost);
    if (al.kind === 'bomber') {
      // Ring of shrapnel: punishes killing it at point-blank range.
      for (let i = 0; i < 8; i++) this.enemyShot(al.x, al.y, (i / 8) * Math.PI * 2, 90, 0.8);
    }
    if (al.kind === 'splitter' && !al.mini) {
      this.spawnAlien('splitter', { x: al.x - 4, y: al.y }, true);
      this.spawnAlien('splitter', { x: al.x + 4, y: al.y }, true);
    }
  }

  private damageBoss(dmg: number): void {
    const b = this.boss!;
    b.hp -= dmg; b.flash = 0.05;
    this.events.push({ type: 'hit' });
    if (b.hp > 0) return;
    this.burst(b.x, b.y, PALETTE.red, 60, 20);
    this.burst(b.x, b.y, PALETTE.yellow, 40);
    this.addScore(2000 * b.tier);
    this.dropScrap(b.x, b.y, 10 + b.tier * 4, 3);
    this.ship.hull = Math.min(this.maxHull, this.ship.hull + 1);
    // Clear the boss's bullets so the victory doesn't kill you.
    this.bullets = this.bullets.filter((x) => !x.hostile);
    this.boss = null;
    this.events.push({ type: 'explode', big: true, x: b.x, y: b.y }, { type: 'bossDown' });
  }

  private hurtPlayer(): void {
    const s = this.ship;
    if (s.invuln > 0 || this.godMode) return;
    s.hull--;
    s.invuln = 1.6;
    this.combo = 0;
    this.burst(s.x, s.y, PALETTE.cyan, 18);
    this.events.push({ type: 'playerHit' });
    if (this.mods.nova) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        this.bullets.push({
          x: s.x, y: s.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, r: 2, life: 0.7,
          damage: 20 * this.mods.damageMul, hostile: false, pierce: 1, lastHit: null,
        });
      }
    }
    if (s.hull <= 0) {
      this.over = true;
      this.burst(s.x, s.y, PALETTE.white, 40);
      this.events.push({ type: 'gameOver' });
    }
  }

  private addScore(base: number): void {
    this.combo++;
    this.comboT = COMBO_WINDOW;
    this.score += Math.round(base * this.comboMult);
  }

  /** Spray of sparks; `debris` adds slower 2px chunks that linger. */
  private burst(x: number, y: number, color: string, n: number, debris = 0): void {
    for (let i = 0; i < n + debris; i++) {
      const chunk = i >= n;
      const a = this.rng.range(0, Math.PI * 2);
      const sp = chunk ? this.rng.range(15, 50) : this.rng.range(20, 110);
      const life = chunk ? this.rng.range(0.6, 1.2) : this.rng.range(0.25, 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, color, size: chunk ? 2 : 1 });
    }
  }
}
