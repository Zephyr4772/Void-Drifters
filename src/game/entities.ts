import type { AlienKind, ShipId } from '../render/sprites';
import type { WeaponId } from './data';

export interface Ship {
  id: ShipId;
  x: number; y: number; vx: number; vy: number;
  angle: number;
  r: number;
  hull: number;
  invuln: number; // seconds of i-frames left
  cooldown: number;
  weapon: WeaponId;
  thrusting: boolean;
}

export interface Bullet {
  x: number; y: number; vx: number; vy: number;
  r: number;
  life: number;
  damage: number;
  hostile: boolean;
  pierce: number;
  lastHit: object | null; // so a piercing shot doesn't hit the same target every tick
}

export interface Asteroid {
  x: number; y: number; vx: number; vy: number;
  r: number;
  tier: 0 | 1 | 2; // 0 small, 2 large
  hp: number;
  variant: number;
  rot: number; spin: number;
  flash: number;
}

export interface Alien {
  kind: AlienKind;
  x: number; y: number; vx: number; vy: number;
  r: number;
  hp: number;
  t: number;     // age, drives bobbing and fire timing
  fireT: number;
  flash: number;
  mini: boolean; // splitter children don't split again
}

export interface Boss {
  x: number; y: number; vx: number; vy: number;
  r: number;
  hp: number; maxHp: number;
  t: number;
  attackT: number;
  pattern: number;
  flash: number;
  tier: number; // 1 for the wave-5 boss, 2 for wave 10, ...
}

export interface Pickup {
  x: number; y: number; vx: number; vy: number;
  value: number;
  life: number;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  color: string;
}

export type WorldEvent =
  | { type: 'shoot' }
  | { type: 'hit' }
  | { type: 'explode'; big: boolean }
  | { type: 'playerHit' }
  | { type: 'pickup' }
  | { type: 'waveStart'; wave: number; boss: boolean }
  | { type: 'waveCleared'; wave: number }
  | { type: 'bossDown' }
  | { type: 'gameOver' };
