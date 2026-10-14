/** Local save data. Storage can be unavailable (private mode, blocked), so failures are ignored. */
import type { MetaLevels } from './meta';

const KEY = 'void-drifters.save.v1';

export interface SaveData {
  highScore: number;
  bestWave: number;
  ship: string;
  scrap: number;
  meta: MetaLevels;
  muted: boolean;
}

const defaults = (): SaveData => ({ highScore: 0, bestWave: 0, ship: 'interceptor', scrap: 0, meta: {}, muted: false });

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<SaveData>) } : defaults();
  } catch {
    return defaults();
  }
}

export function writeSave(data: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
