import { describe, expect, it } from 'vitest';
import { FixedLoop, STEP } from '../src/core/loop';
import { Rng } from '../src/core/math';
import { planWave } from '../src/game/waves';
import { World } from '../src/game/world';

describe('FixedLoop', () => {
  it('runs the same number of ticks regardless of display refresh rate', () => {
    const count = (hz: number) => {
      let ticks = 0;
      const loop = new FixedLoop({ update: () => ticks++, render: () => {} });
      for (let i = 0; i < hz * 2; i++) loop.advance(1 / hz); // two seconds
      return ticks;
    };
    expect(count(60)).toBeGreaterThanOrEqual(119);
    expect(Math.abs(count(144) - count(60))).toBeLessThanOrEqual(1);
    expect(Math.abs(count(30) - count(60))).toBeLessThanOrEqual(1);
  });

  it('clamps huge frame gaps', () => {
    const loop = new FixedLoop({ update: () => {}, render: () => {} });
    expect(loop.advance(10)).toBeLessThanOrEqual(Math.ceil(0.25 / STEP));
  });
});

describe('planWave', () => {
  it('introduces each enemy type on its debut wave', () => {
    const kinds = (w: number) => planWave(w, new Rng(1)).flatMap((o) => (o.what === 'alien' ? [o.kind] : []));
    expect(kinds(1)).toContain('drifter');
    expect(kinds(2)).toContain('gunner');
    expect(kinds(4)).toContain('splitter');
    expect(kinds(1)).not.toContain('splitter');
  });

  it('grows with wave number', () => {
    expect(planWave(10, new Rng(3)).length).toBeGreaterThan(planWave(1, new Rng(3)).length);
  });
});

describe('World', () => {
  it('is deterministic for a given seed', () => {
    const run = () => {
      const w = new World('interceptor', 42);
      for (let i = 0; i < 60 * 20; i++) w.update(STEP, { ax: Math.sin(i / 50), ay: Math.cos(i / 70), boost: false, fire: true });
      return [w.score, w.wave, w.ship.hull, Math.round(w.ship.x)];
    };
    expect(run()).toEqual(run());
  });

  it('progresses waves and scores when the player shoots', () => {
    const w = new World('striker', 7);
    w.godMode = true;
    for (let i = 0; i < 60 * 60; i++) w.update(STEP, { ax: 0, ay: 0, boost: false, fire: true });
    expect(w.wave).toBeGreaterThanOrEqual(1);
    expect(w.score).toBeGreaterThan(0);
  });

  it('ends the run when the hull reaches zero', () => {
    const w = new World('scout', 1);
    w.ship.invuln = 0;
    w.spawnAsteroid(2, { x: w.ship.x, y: w.ship.y });
    w.update(STEP, { ax: 0, ay: 0, boost: false, fire: false });
    expect(w.ship.hull).toBe(1);
    w.ship.invuln = 0;
    w.spawnAsteroid(2, { x: w.ship.x, y: w.ship.y });
    w.update(STEP, { ax: 0, ay: 0, boost: false, fire: false });
    expect(w.over).toBe(true);
  });
});
