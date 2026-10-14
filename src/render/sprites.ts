/**
 * Custom pixel sprites defined as character grids and baked to canvases once.
 * '.' is transparent; every other char maps to a palette colour.
 * CC0 pack art can replace any entry later (see loadImageSprite).
 */
export type Sprite = HTMLCanvasElement | HTMLImageElement;

export const PALETTE = {
  void: '#07060f',
  ink: '#1b1830',
  steel: '#8b9bb4',
  white: '#f4f4f4',
  cyan: '#4fd6e8',
  green: '#7ce35c',
  yellow: '#ffd75e',
  orange: '#ff8a3d',
  red: '#e8434f',
  magenta: '#d655c8',
  purple: '#7a4fd6',
  rock: '#7a6a5a',
  rockDark: '#4a3f36',
} as const;

function bake(rows: string[], colors: Record<string, string>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const col = colors[ch];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    });
  });
  return c;
}

// Ships face right (angle 0) and are drawn rotated.
const SHIP_ROWS = {
  interceptor: [
    '..ww........',
    '..wcw.......',
    '.sswccw.....',
    'oossssscw...',
    'oossssssccw.',
    'oossssscw...',
    '.sswccw.....',
    '..wcw.......',
    '..ww........',
  ],
  striker: [
    '.ww.........',
    'wssw........',
    'osssswww....',
    'ossssssscw..',
    'osssssssccw.',
    'ossssssscw..',
    'osssswww....',
    'wssw........',
    '.ww.........',
  ],
  scout: [
    '.w.........',
    '.sw........',
    'ossscw.....',
    'osssssccw..',
    'ossscw.....',
    '.sw........',
    '.w.........',
  ],
};
export type ShipId = keyof typeof SHIP_ROWS;

const ALIEN_ROWS = {
  drifter: [
    '...gggg...',
    '..gggggg..',
    '.gg.gg.gg.',
    'gggggggggg',
    '..g.gg.g..',
    '.g......g.',
  ],
  gunner: [
    '..mmmmmm..',
    '.mmmmmmmm.',
    'mm.mmmm.mm',
    'mmmmmmmmmm',
    '.m.mmmm.m.',
    'm..m..m..m',
  ],
  bomber: [
    '...oooo...',
    '.oooyyooo.',
    'ooyyyyyyoo',
    'ooyyrryyoo',
    '.oooyyooo.',
    '...oooo...',
  ],
  splitter: [
    '.pp....pp.',
    'pppp..pppp',
    'pp.pppp.pp',
    'pppppppppp',
    '.pp.pp.pp.',
    'p.p....p.p',
  ],
};
export type AlienKind = keyof typeof ALIEN_ROWS;

const BOSS_ROWS = [
  '.......rrrrrrrrrr.......',
  '.....rrmmmmmmmmmmrr.....',
  '....rmmmmmmmmmmmmmmr....',
  '...rmmmyyymmmmyyymmmr...',
  '..rmmmyywyymmyywyymmmr..',
  '..rmmmyyyyymmyyyyymmmr..',
  '.rmmmmmyyymmmmyyymmmmmr.',
  'rrmmmmmmmmmmmmmmmmmmmmrr',
  'rmmrrmmmmmrrrrmmmmmrrmmr',
  'rmr..rmmmrooooormmr..rmr',
  'rr....rmmrooyyoormr...rr',
  'r.....rmr.ooyyoo.rmr...r',
  '......rr...oooo...rr....',
  '.....rr.....oo.....rr...',
  '....rr..............rr..',
  '...rr................rr.',
];

const SCRAP_ROWS = ['.y.', 'ywy', '.y.'];

/** Lumpy procedural rock so asteroids don't all look the same. */
function asteroidRows(size: number, seed: number): string[] {
  const rows: string[] = [];
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    let row = '';
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - r, dy = y + 0.5 - r;
      const a = Math.atan2(dy, dx);
      const bump = 0.82 + 0.18 * Math.sin(a * 3 + seed) * Math.cos(a * 2 + seed * 1.7);
      const d = Math.hypot(dx, dy) / (r * bump);
      if (d > 1) row += '.';
      else if (d > 0.8 || dx + dy > r * 0.6) row += 'd';
      else row += Math.sin(x * 1.3 + seed) * Math.cos(y * 1.1) > 0.75 ? 'd' : 'r';
    }
    rows.push(row);
  }
  return rows;
}

export const ASTEROID_SIZES = [8, 14, 22] as const;

export interface SpriteBank {
  ship: Record<ShipId, Sprite>;
  alien: Record<AlienKind, Sprite>;
  asteroid: Sprite[][]; // [sizeTier][variant]
  boss: Sprite;
  scrap: Sprite;
}

export function buildSprites(): SpriteBank {
  const P = PALETTE;
  const shipCol = { w: P.white, s: P.steel, c: P.cyan, o: P.orange };
  const alienCol = { g: P.green, m: P.magenta, o: P.orange, y: P.yellow, r: P.red, p: P.purple };
  const rockCol = { r: P.rock, d: P.rockDark };
  const mapRows = <K extends string>(src: Record<K, string[]>, col: Record<string, string>) =>
    Object.fromEntries(Object.entries<string[]>(src).map(([k, rows]) => [k, bake(rows, col)])) as Record<K, Sprite>;
  return {
    ship: mapRows(SHIP_ROWS, shipCol),
    alien: mapRows(ALIEN_ROWS, alienCol),
    asteroid: ASTEROID_SIZES.map((size) => [0, 1, 2, 3].map((v) => bake(asteroidRows(size, v * 2.1 + size), rockCol))),
    boss: bake(BOSS_ROWS, { r: P.red, m: P.magenta, y: P.yellow, w: P.white, o: P.orange }),
    scrap: bake(SCRAP_ROWS, { y: P.yellow, w: P.white }),
  };
}

/** Hook for CC0 packs: load a PNG to use in place of a baked sprite. */
export function loadImageSprite(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
