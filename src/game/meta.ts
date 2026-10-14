/**
 * Permanent progression bought with scrap in the Hangar between runs.
 * The levels are stored in the save file and applied to each new run.
 */
import type { ShipId } from '../render/sprites';
import type { WeaponId } from './data';
import { BASE_MODS, type RunMods } from './upgrades';

export interface MetaDef {
  id: string;
  name: string;
  desc: string;
  costs: number[]; // one entry per level
}

export const META: MetaDef[] = [
  { id: 'hull', name: 'Reinforced Hull', desc: '+1 starting hull', costs: [40, 100, 200] },
  { id: 'guns', name: 'Calibrated Guns', desc: '+10% damage', costs: [30, 80, 160] },
  { id: 'salvage', name: 'Salvage Rights', desc: '+20% scrap', costs: [35, 90, 180] },
  { id: 'reroll', name: 'Reroll Module', desc: '+1 upgrade reroll per run', costs: [50, 140] },
  { id: 'twin', name: 'Twin Guns License', desc: 'Start runs with Twin', costs: [80] },
  { id: 'striker', name: 'Striker Blueprint', desc: 'Unlock the Striker', costs: [60] },
  { id: 'scout', name: 'Scout Blueprint', desc: 'Unlock the Scout', costs: [60] },
];

export type MetaLevels = Record<string, number>;

export const level = (m: MetaLevels, id: string) => m[id] ?? 0;

export function nextCost(m: MetaLevels, def: MetaDef): number | null {
  const l = level(m, def.id);
  return l < def.costs.length ? def.costs[l] : null;
}

export function shipUnlocked(m: MetaLevels, id: ShipId): boolean {
  return id === 'interceptor' || level(m, id) > 0;
}

export interface RunConfig {
  mods: RunMods;
  weapons: WeaponId[];
  rerolls: number;
}

export function runConfigFromMeta(m: MetaLevels): RunConfig {
  return {
    mods: {
      ...BASE_MODS,
      maxHullBonus: level(m, 'hull'),
      damageMul: 1 + 0.1 * level(m, 'guns'),
      scrapMul: 1 + 0.2 * level(m, 'salvage'),
    },
    weapons: level(m, 'twin') ? ['blaster', 'twin'] : ['blaster'],
    rerolls: level(m, 'reroll'),
  };
}
