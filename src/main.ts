import { Input } from './core/input';
import { FixedLoop } from './core/loop';
import { Screen } from './render/screen';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input();
input.attach(window);
const game = new Game(new Screen(canvas), input);
new FixedLoop(game).start();

// Dev-only handle for poking at state from the console; stripped from production builds.
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
