/**
 * Tuning data. Ship stats now actually differ (in the legacy game the
 * selection only changed the sprite). Speeds are in px/s on the 640x360 view.
 */
import type { ShipId, AlienKind } from '../render/sprites';

export interface ShipStats {
  name: string;
  blurb: string;
  maxSpeed: number;
  accel: number;
  hull: number;
  fireRateMul: number;
}

export const SHIPS: Record<ShipId, ShipStats> = {
  interceptor: { name: 'Interceptor', blurb: 'Balanced fighter', maxSpeed: 145, accel: 500, hull: 3, fireRateMul: 1 },
  striker: { name: 'Striker', blurb: 'Slow, tough, hits hard', maxSpeed: 115, accel: 385, hull: 5, fireRateMul: 1.25 },
  scout: { name: 'Scout', blurb: 'Fast and fragile', maxSpeed: 185, accel: 670, hull: 2, fireRateMul: 0.85 },
};
export const SHIP_ORDER: ShipId[] = ['interceptor', 'striker', 'scout'];

export type WeaponId = 'blaster' | 'twin' | 'scatter';

export interface WeaponStats {
  name: string;
  damage: number;
  cooldown: number; // seconds
  speed: number;
  /** Bullet angle offsets (radians) and side offsets (px) per shot. */
  pattern: { angle: number; side: number }[];
  spread: number; // random jitter, radians
}

// Damage and shot counts carried over from the legacy normal/dual/shotgun guns.
export const WEAPONS: Record<WeaponId, WeaponStats> = {
  blaster: { name: 'Blaster', damage: 15, cooldown: 0.16, speed: 360, pattern: [{ angle: 0, side: 0 }], spread: 0.02 },
  twin: { name: 'Twin', damage: 12, cooldown: 0.18, speed: 360, pattern: [{ angle: 0, side: -3 }, { angle: 0, side: 3 }], spread: 0.02 },
  scatter: {
    name: 'Scatter', damage: 8, cooldown: 0.42, speed: 310,
    pattern: [-0.24, -0.08, 0.08, 0.24].map((angle) => ({ angle, side: 0 })),
    spread: 0.08,
  },
};
export const WEAPON_ORDER: WeaponId[] = ['blaster', 'twin', 'scatter'];

export interface AlienStats { hp: number; speed: number; r: number; score: number; firstWave: number; cost: number }

export const ALIENS: Record<AlienKind, AlienStats> = {
  drifter: { hp: 30, speed: 54, r: 7, score: 100, firstWave: 1, cost: 2 },
  gunner: { hp: 40, speed: 36, r: 7, score: 150, firstWave: 2, cost: 3 },
  bomber: { hp: 25, speed: 72, r: 7, score: 175, firstWave: 3, cost: 3 },
  splitter: { hp: 45, speed: 42, r: 7, score: 200, firstWave: 4, cost: 4 },
};

export const ASTEROID_HP = [15, 35, 70];
export const ASTEROID_SCORE = [50, 30, 20];
