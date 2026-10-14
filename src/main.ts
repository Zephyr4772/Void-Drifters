import { Input } from './core/input';
import { FixedLoop } from './core/loop';
import { Screen } from './render/screen';
import { buildSprites, loadPackSprites } from './render/sprites';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input();
input.attach(window);
const game = new Game(new Screen(canvas), input);
new FixedLoop(game).start();

// The game starts at once with the baked fallback art, then switches to the
// Kenney pack as soon as the sheets have loaded (they're tiny and local).
void loadPackSprites(buildSprites()).then((bank) => game.setSprites(bank));

// Dev-only handle for poking at state from the console; stripped from production builds.
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
