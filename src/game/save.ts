/** Local save data. Storage can be unavailable (private mode, blocked), so failures are ignored. */
const KEY = 'void-drifters.save.v1';

export interface SaveData { highScore: number; bestWave: number; ship: string }

const DEFAULTS: SaveData = { highScore: 0, bestWave: 0, ship: 'interceptor' };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SaveData>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSave(data: SaveData): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
