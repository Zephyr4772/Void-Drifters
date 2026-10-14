/**
 * In-run upgrades: after every cleared wave the player picks 1 of 3.
 * Everything is stored in RunMods, which the World reads every time it fires or moves.
 */
import type { Rng } from '../core/math';
import type { WeaponId } from './data';

export interface RunMods {
  damageMul: number;
  cooldownMul: number;
  speedMul: number;
  extraShots: number;
  pierce: number;
  bulletSpeedMul: number;
  magnet: number;     // pickup radius, px
  critChance: number;
  scrapMul: number;
  nova: boolean;      // ring of bullets when hit
  maxHullBonus: number;
}

export const BASE_MODS: RunMods = {
  damageMul: 1, cooldownMul: 1, speedMul: 1, extraShots: 0, pierce: 0,
  bulletSpeedMul: 1, magnet: 24, critChance: 0, scrapMul: 1, nova: false, maxHullBonus: 0,
};

/** What an upgrade can see and change when it's offered or applied. */
export interface UpgradeTarget {
  mods: RunMods;
  weapons: WeaponId[];
  hull: number;
  maxHull: number;
  heal(n: number): void;
}

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  max: number;
  /** Optional extra condition for offering it (e.g. only when damaged). */
  available?: (t: UpgradeTarget) => boolean;
  apply: (t: UpgradeTarget) => void;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'dmg', name: 'Overcharge', desc: '+20% damage', max: 5, apply: (t) => { t.mods.damageMul += 0.2; } },
  { id: 'rate', name: 'Rapid Cycler', desc: '-12% fire delay', max: 5, apply: (t) => { t.mods.cooldownMul *= 0.88; } },
  { id: 'thrust', name: 'Afterburner', desc: '+12% move speed', max: 3, apply: (t) => { t.mods.speedMul += 0.12; } },
  { id: 'multi', name: 'Split Barrel', desc: '+1 projectile', max: 3, apply: (t) => { t.mods.extraShots++; } },
  { id: 'pierce', name: 'Railcore', desc: 'Shots pierce +1', max: 2, apply: (t) => { t.mods.pierce++; } },
  { id: 'velocity', name: 'Accelerator', desc: '+25% shot speed', max: 3, apply: (t) => { t.mods.bulletSpeedMul += 0.25; } },
  { id: 'crit', name: 'Targeting AI', desc: '+10% crit x2 dmg', max: 3, apply: (t) => { t.mods.critChance += 0.1; } },
  { id: 'magnet', name: 'Tractor Beam', desc: 'Pull scrap further', max: 3, apply: (t) => { t.mods.magnet += 30; } },
  { id: 'salvage', name: 'Salvager', desc: '+25% scrap', max: 3, apply: (t) => { t.mods.scrapMul += 0.25; } },
  { id: 'hull', name: 'Armor Plating', desc: '+1 max hull, repair 1', max: 3, apply: (t) => { t.mods.maxHullBonus++; t.heal(1); } },
  { id: 'nova', name: 'Panic Nova', desc: 'Burst of shots when hit', max: 1, apply: (t) => { t.mods.nova = true; } },
  {
    id: 'repair', name: 'Field Repair', desc: 'Restore 2 hull', max: 99,
    available: (t) => t.hull < t.maxHull, apply: (t) => t.heal(2),
  },
  {
    id: 'twin', name: 'Twin Guns', desc: 'New weapon - swap 1-3', max: 1,
    available: (t) => !t.weapons.includes('twin'), apply: (t) => { t.weapons.push('twin'); },
  },
  {
    id: 'scatter', name: 'Scatter Gun', desc: 'New weapon - swap 1-3', max: 1,
    available: (t) => !t.weapons.includes('scatter'), apply: (t) => { t.weapons.push('scatter'); },
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<string, UpgradeDef>;

/** Pick `n` distinct upgrades the player can still take. */
export function rollUpgrades(rng: Rng, taken: Record<string, number>, target: UpgradeTarget, n = 3): UpgradeDef[] {
  const pool = UPGRADES.filter((u) => (taken[u.id] ?? 0) < u.max && (!u.available || u.available(target)));
  const out: UpgradeDef[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return out;
}
