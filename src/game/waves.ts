/**
 * Wave director. Replaces the legacy spawn timers (12-35 s gaps between
 * aliens) with discrete waves: each wave has a threat budget that buys
 * enemies, spawns are staggered, and the next wave starts once the field is clear.
 */
import type { AlienKind } from '../render/sprites';
import type { Rng } from '../core/math';
import { ALIENS } from './data';

export type SpawnOrder = { what: 'asteroid' } | { what: 'alien'; kind: AlienKind };

export function planWave(wave: number, rng: Rng): SpawnOrder[] {
  const orders: SpawnOrder[] = [];
  const rocks = Math.min(2 + Math.floor(wave / 2), 6);
  for (let i = 0; i < rocks; i++) orders.push({ what: 'asteroid' });

  let budget = 2 + wave * 3;
  const kinds = (Object.keys(ALIENS) as AlienKind[]).filter((k) => ALIENS[k].firstWave <= wave);
  // Guarantee the newest unlocked enemy appears in its debut wave.
  const debut = kinds.find((k) => ALIENS[k].firstWave === wave);
  if (debut) { orders.push({ what: 'alien', kind: debut }); budget -= ALIENS[debut].cost; }
  while (budget > 0) {
    const affordable = kinds.filter((k) => ALIENS[k].cost <= budget);
    if (!affordable.length) break;
    const kind = rng.pick(affordable);
    orders.push({ what: 'alien', kind });
    budget -= ALIENS[kind].cost;
  }
  // Shuffle (Fisher-Yates) so asteroids and aliens interleave.
  for (let i = orders.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [orders[i], orders[j]] = [orders[j], orders[i]];
  }
  return orders;
}
