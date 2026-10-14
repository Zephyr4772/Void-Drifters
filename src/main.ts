import { Input } from './core/input';
import { FixedLoop } from './core/loop';
import { Screen } from './render/screen';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input();
input.attach(window);
const game = new Game(new Screen(canvas), input);
new FixedLoop(game).start();
