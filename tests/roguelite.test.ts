import { describe, expect, it } from 'vitest';
import { STEP } from '../src/core/loop';
import { Rng } from '../src/core/math';
import { META, nextCost, runConfigFromMeta, shipUnlocked } from '../src/game/meta';
import { UPGRADE_BY_ID } from '../src/game/upgrades';
import { isBossWave, planWave } from '../src/game/waves';
import { World } from '../src/game/world';

const idle = { ax: 0, ay: 0, boost: false, fire: false };

/** Tick until the predicate holds (or give up after `seconds`). */
function runUntil(w: World, done: () => boolean, seconds = 120, fire = true): void {
  for (let i = 0; i < seconds * 60 && !done(); i++) w.update(STEP, { ...idle, fire });
}

describe('wave flow', () => {
  it('pauses for an upgrade pick after a cleared wave, then starts the next one', () => {
    const w = new World('interceptor', 5);
    w.godMode = true;
    runUntil(w, () => w.wave === 1);
    // Clear the field by hand so the test doesn't depend on aim.
    w.spawnQueue = []; w.asteroids = []; w.aliens = [];
    runUntil(w, () => w.awaitingPick, 2);
    expect(w.awaitingPick).toBe(true);

    for (let i = 0; i < 300; i++) w.update(STEP, idle);
    expect(w.wave).toBe(1); // frozen while picking

    w.finishPick(w.rollUpgrades()[0]);
    runUntil(w, () => w.wave === 2, 5);
    expect(w.wave).toBe(2);
  });

  it('vacuums leftover scrap into the run total when a wave clears', () => {
    const w = new World('interceptor', 2);
    w.wave = 1; w.waveBreak = 0;
    w.pickups.push({ x: 0, y: 0, vx: 0, vy: 0, value: 4, life: 10 });
    w.update(STEP, idle);
    expect(w.awaitingPick).toBe(true);
    expect(w.scrap).toBe(4);
  });
});

describe('upgrades', () => {
  it('apply their effects and respect stack limits', () => {
    const w = new World('interceptor', 1);
    w.finishPick(UPGRADE_BY_ID.multi);
    expect(w.mods.extraShots).toBe(1);
    w.finishPick(UPGRADE_BY_ID.hull);
    expect(w.maxHull).toBe(4);
    w.finishPick(UPGRADE_BY_ID.scatter);
    expect(w.weapons).toContain('scatter');
    for (let i = 0; i < 5; i++) w.finishPick(UPGRADE_BY_ID.dmg);
    expect(w.rollUpgrades(99).map((u) => u.id)).not.toContain('dmg');
    expect(w.rollUpgrades(99).map((u) => u.id)).not.toContain('scatter');
  });

  it('only offers Field Repair when damaged', () => {
    const w = new World('interceptor', 1);
    expect(w.rollUpgrades(99).map((u) => u.id)).not.toContain('repair');
    w.ship.hull = 1;
    expect(w.rollUpgrades(99).map((u) => u.id)).toContain('repair');
  });

  it('extra shots add projectiles per trigger pull', () => {
    const w = new World('interceptor', 1);
    w.mods.extraShots = 2;
    w.wave = 1; w.waveBreak = 1; // block wave spawning so only our bullets exist
    w.aliens.push({ kind: 'drifter', x: -50, y: -50, vx: 0, vy: 0, r: 0, hp: 1, t: 0, fireT: 99, flash: 0, mini: false });
    w.update(STEP, { ...idle, fire: true });
    expect(w.bullets.filter((b) => !b.hostile)).toHaveLength(3);
  });
});

describe('bosses', () => {
  it('appear every fifth wave', () => {
    expect(isBossWave(5)).toBe(true);
    expect(isBossWave(4)).toBe(false);
    expect(planWave(10, new Rng(1))[0]).toEqual({ what: 'boss' });
  });

  it('drop scrap and repair the ship on defeat', () => {
    const w = new World('interceptor', 3);
    w.wave = 5;
    w.spawnBoss();
    w.ship.hull = 1;
    const boss = w.boss!;
    boss.hp = 1; boss.y = 100; boss.attackT = 99;
    w.bullets.push({ x: boss.x, y: boss.y, vx: 0, vy: 0, r: 2, life: 1, damage: 5, hostile: false, pierce: 0, lastHit: null });
    w.update(STEP, idle);
    expect(w.boss).toBeNull();
    expect(w.pickups.length).toBeGreaterThan(5);
    expect(w.ship.hull).toBe(2);
  });
});

describe('meta progression', () => {
  it('turns hangar levels into a run config', () => {
    const cfg = runConfigFromMeta({ hull: 2, guns: 1, twin: 1, reroll: 1 });
    expect(cfg.mods.maxHullBonus).toBe(2);
    expect(cfg.mods.damageMul).toBeCloseTo(1.1);
    expect(cfg.weapons).toEqual(['blaster', 'twin']);
    expect(cfg.rerolls).toBe(1);
    const w = new World('interceptor', 1, cfg);
    expect(w.ship.hull).toBe(5);
  });

  it('locks ships until their blueprint is bought, and caps levels', () => {
    expect(shipUnlocked({}, 'interceptor')).toBe(true);
    expect(shipUnlocked({}, 'scout')).toBe(false);
    expect(shipUnlocked({ scout: 1 }, 'scout')).toBe(true);
    const hull = META.find((m) => m.id === 'hull')!;
    expect(nextCost({ hull: 3 }, hull)).toBeNull();
  });
});
