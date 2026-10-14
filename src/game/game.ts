/** Top-level state machine (title, playing, paused, game over) plus rendering. */
import type { Input } from '../core/input';
import { Audio } from '../audio/sfx';
import { drawText } from '../render/font';
import { VIEW_H as H, VIEW_W as W, type Screen } from '../render/screen';
import { buildSprites, PALETTE as C, type Sprite, type SpriteBank } from '../render/sprites';
import { SHIP_ORDER, SHIPS, WEAPON_ORDER, WEAPONS, type WeaponId } from './data';
import { loadSave, writeSave, type SaveData } from './save';
import { World } from './world';

type State = 'title' | 'playing' | 'paused' | 'over';

interface Star { x: number; y: number; speed: number; color: string }

export class Game {
  private state: State = 'title';
  private world: World | null = null;
  private sprites: SpriteBank = buildSprites();
  private audio = new Audio();
  private save: SaveData = loadSave();
  private shipIndex = Math.max(0, SHIP_ORDER.indexOf(this.save.ship as never));
  private stars: Star[] = [];
  private shake = 0;
  private banner = { text: '', t: 0 };
  private cheatBuf = '';
  private t = 0;
  private newBest = false;

  constructor(private screen: Screen, private input: Input) {
    for (let i = 0; i < 90; i++) {
      const layer = i % 3;
      this.stars.push({
        x: Math.random() * W, y: Math.random() * H,
        speed: [4, 9, 18][layer], color: [C.ink, '#3a3660', C.steel][layer],
      });
    }
    window.addEventListener('keydown', () => this.audio.unlock());
  }

  update(dt: number): void {
    const inp = this.input;
    inp.beginTick();
    this.t += dt;
    for (const s of this.stars) { s.y += s.speed * dt; if (s.y >= H) { s.y -= H; s.x = Math.random() * W; } }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.banner.t = Math.max(0, this.banner.t - dt);
    this.checkCheats(inp.typed);

    switch (this.state) {
      case 'title': {
        if (inp.pressed('left')) { this.shipIndex = (this.shipIndex + SHIP_ORDER.length - 1) % SHIP_ORDER.length; this.audio.play('select'); }
        if (inp.pressed('right')) { this.shipIndex = (this.shipIndex + 1) % SHIP_ORDER.length; this.audio.play('select'); }
        if (inp.pressed('confirm') || inp.pressed('fire')) this.startRun();
        break;
      }
      case 'playing': {
        if (inp.pressed('pause')) { this.state = 'paused'; break; }
        const w = this.world!;
        let weapon: WeaponId | undefined;
        if (inp.pressed('weapon1')) weapon = WEAPON_ORDER[0];
        if (inp.pressed('weapon2')) weapon = WEAPON_ORDER[1];
        if (inp.pressed('weapon3')) weapon = WEAPON_ORDER[2];
        w.update(dt, {
          ax: (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0),
          ay: (inp.held('down') ? 1 : 0) - (inp.held('up') ? 1 : 0),
          boost: inp.held('boost'),
          fire: inp.held('fire'),
          weapon,
        });
        this.handleEvents(w);
        break;
      }
      case 'paused':
        if (inp.pressed('pause') || inp.pressed('confirm')) this.state = 'playing';
        break;
      case 'over':
        // Keep the debris drifting behind the game-over screen.
        this.world!.update(dt, { ax: 0, ay: 0, boost: false, fire: false });
        if (inp.pressed('confirm')) this.state = 'title';
        break;
    }
  }

  private startRun(): void {
    const id = SHIP_ORDER[this.shipIndex];
    this.save.ship = id;
    this.world = new World(id);
    this.state = 'playing';
    this.newBest = false;
    this.audio.play('select');
  }

  private handleEvents(w: World): void {
    for (const e of w.events) {
      switch (e.type) {
        case 'shoot': this.audio.play('shoot'); break;
        case 'hit': this.audio.play('hit'); break;
        case 'explode': this.audio.play(e.big ? 'bigExplode' : 'explode'); this.shake = Math.max(this.shake, e.big ? 4 : 2); break;
        case 'playerHit': this.audio.play('hurt'); this.shake = 6; break;
        case 'waveStart': this.audio.play('wave'); this.banner = { text: `WAVE ${e.wave}`, t: 1.8 }; break;
        case 'gameOver': this.endRun(w); break;
      }
    }
  }

  private endRun(w: World): void {
    this.state = 'over';
    this.newBest = w.score > this.save.highScore;
    this.save.highScore = Math.max(this.save.highScore, w.score);
    this.save.bestWave = Math.max(this.save.bestWave, w.wave);
    writeSave(this.save);
  }

  /** Legacy easter egg kept: typing "cheat" mid-run toggles god mode. */
  private checkCheats(typed: string): void {
    if (!typed) return;
    this.cheatBuf = (this.cheatBuf + typed).slice(-12);
    if (this.cheatBuf.endsWith('cheat') && this.world && this.state === 'playing') {
      this.world.godMode = !this.world.godMode;
      this.banner = { text: this.world.godMode ? 'GOD MODE ON' : 'GOD MODE OFF', t: 1.5 };
      this.cheatBuf = '';
    }
  }

  // ---- rendering ----------------------------------------------------------

  render(_alpha: number): void {
    const ctx = this.screen.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, W, H);
    for (const s of this.stars) { ctx.fillStyle = s.color; ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1); }

    if (this.shake > 0) {
      ctx.setTransform(1, 0, 0, 1, Math.round((Math.random() - 0.5) * this.shake), Math.round((Math.random() - 0.5) * this.shake));
    }
    if (this.world && this.state !== 'title') this.drawWorld(this.world);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (this.state === 'title') this.drawTitle();
    else this.drawHud(this.world!);
    if (this.state === 'paused') this.drawPanel(['PAUSED', '', 'P / ENTER TO RESUME']);
    if (this.state === 'over') {
      const w = this.world!;
      this.drawPanel([
        'GAME OVER', '',
        `SCORE ${w.score}`, `WAVE ${w.wave}`,
        this.newBest ? 'NEW HIGH SCORE!' : `BEST ${this.save.highScore}`, '',
        'ENTER TO CONTINUE',
      ]);
    }
  }

  private drawSprite(sp: Sprite, x: number, y: number, angle = 0): void {
    const ctx = this.screen.ctx;
    const prev = ctx.getTransform();
    ctx.translate(Math.round(x), Math.round(y));
    if (angle) ctx.rotate(angle);
    ctx.drawImage(sp, -Math.floor(sp.width / 2), -Math.floor(sp.height / 2));
    ctx.setTransform(prev);
  }

  private drawWorld(w: World): void {
    const ctx = this.screen.ctx;
    for (const p of w.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 1, 1);
    }
    ctx.globalAlpha = 1;

    for (const a of w.asteroids) {
      // Snap rotation to 8 steps: keeps the chunky pixel look instead of smooth rotation blur.
      const rot = Math.round(a.rot / (Math.PI / 4)) * (Math.PI / 4);
      this.drawSprite(this.sprites.asteroid[a.tier][a.variant], a.x, a.y, rot);
      if (a.flash > 0) this.flashCircle(a.x, a.y, a.r);
    }
    for (const al of w.aliens) {
      const bob = Math.round(Math.sin(al.t * 4));
      const sp = this.sprites.alien[al.kind];
      if (al.mini) {
        ctx.drawImage(sp, Math.round(al.x - sp.width / 4), Math.round(al.y - sp.height / 4 + bob), sp.width / 2, sp.height / 2);
      } else {
        this.drawSprite(sp, al.x, al.y + bob);
      }
      if (al.flash > 0) this.flashCircle(al.x, al.y + bob, al.r);
    }
    for (const b of w.bullets) {
      ctx.fillStyle = b.hostile ? C.red : C.yellow;
      const sz = b.hostile ? 2 : 2;
      ctx.fillRect(Math.floor(b.x - sz / 2), Math.floor(b.y - sz / 2), sz, sz);
    }

    const s = w.ship;
    const blink = s.invuln > 0 && Math.floor(this.t * 16) % 2 === 0;
    if (!w.over && !blink) {
      const rot = Math.round(s.angle / (Math.PI / 8)) * (Math.PI / 8);
      this.drawSprite(this.sprites.ship[s.id], s.x, s.y, rot);
      if (w.godMode) { ctx.strokeStyle = C.yellow; ctx.strokeRect(Math.round(s.x) - 8, Math.round(s.y) - 8, 16, 16); }
    }
  }

  private flashCircle(x: number, y: number, r: number): void {
    const ctx = this.screen.ctx;
    ctx.fillStyle = C.white;
    ctx.fillRect(Math.round(x - r), Math.round(y - r), Math.round(r * 2), Math.round(r * 2));
  }

  private drawHud(w: World): void {
    const ctx = this.screen.ctx;
    drawText(ctx, `${w.score}`.padStart(7, '0'), 6, 6, C.white);
    if (w.combo >= 5) drawText(ctx, `x${w.comboMult.toFixed(1)} COMBO ${w.combo}`, 6, 14, C.yellow);
    drawText(ctx, `WAVE ${w.wave}`, W - 6, 6, C.cyan, 1, 'right');
    for (let i = 0; i < SHIPS[w.ship.id].hull; i++) {
      ctx.fillStyle = i < w.ship.hull ? C.red : C.ink;
      ctx.fillRect(6 + i * 6, H - 10, 4, 4);
    }
    WEAPON_ORDER.forEach((id, i) => {
      const active = id === w.ship.weapon;
      drawText(ctx, `${i + 1} ${WEAPONS[id].name}`, W - 6, H - 26 + i * 7, active ? C.yellow : C.steel, 1, 'right');
    });
    if (this.banner.t > 0) {
      drawText(ctx, this.banner.text, W / 2, H / 2 - 40, this.banner.t % 0.3 < 0.2 ? C.white : C.cyan, 2, 'center');
    }
  }

  private drawTitle(): void {
    const ctx = this.screen.ctx;
    drawText(ctx, 'VOID DRIFTERS', W / 2, 40, C.cyan, 4, 'center');
    drawText(ctx, 'VOID DRIFTERS', W / 2, 39, C.white, 4, 'center');

    const id = SHIP_ORDER[this.shipIndex];
    const st = SHIPS[id];
    const cx = W / 2, cy = 120;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(3, 3);
    ctx.rotate(-Math.PI / 2);
    const sp = this.sprites.ship[id];
    ctx.drawImage(sp, -Math.floor(sp.width / 2), -Math.floor(sp.height / 2));
    ctx.restore();
    drawText(ctx, '<', cx - 50, cy - 4, C.steel, 2, 'center');
    drawText(ctx, '>', cx + 50, cy - 4, C.steel, 2, 'center');
    drawText(ctx, st.name, cx, cy + 26, C.white, 2, 'center');
    drawText(ctx, st.blurb, cx, cy + 40, C.steel, 1, 'center');
    this.statBar('SPEED', st.maxSpeed / 160, cx, cy + 52);
    this.statBar('HULL', st.hull / 5, cx, cy + 60);
    this.statBar('FIRE RATE', 0.85 / st.fireRateMul, cx, cy + 68);

    if (Math.floor(this.t * 2) % 2 === 0) drawText(ctx, 'PRESS ENTER TO LAUNCH', W / 2, H - 40, C.yellow, 1, 'center');
    drawText(ctx, 'WASD MOVE  SHIFT BOOST  SPACE FIRE  1-3 WEAPON  P PAUSE', W / 2, H - 24, C.steel, 1, 'center');
    if (this.save.highScore > 0) drawText(ctx, `BEST ${this.save.highScore}  WAVE ${this.save.bestWave}`, W / 2, H - 12, C.cyan, 1, 'center');
  }

  private statBar(label: string, frac: number, cx: number, y: number): void {
    const ctx = this.screen.ctx;
    drawText(ctx, label, cx - 4, y, C.steel, 1, 'right');
    ctx.fillStyle = C.ink;
    ctx.fillRect(cx + 4, y, 40, 5);
    ctx.fillStyle = C.green;
    ctx.fillRect(cx + 4, y, Math.round(40 * Math.min(1, frac)), 5);
  }

  private drawPanel(lines: string[]): void {
    const ctx = this.screen.ctx;
    const h = lines.length * 10 + 16;
    const y0 = Math.round(H / 2 - h / 2);
    ctx.fillStyle = 'rgba(7,6,15,0.85)';
    ctx.fillRect(W / 2 - 90, y0, 180, h);
    ctx.strokeStyle = C.cyan;
    ctx.strokeRect(W / 2 - 90 + 0.5, y0 + 0.5, 179, h - 1);
    lines.forEach((l, i) => drawText(ctx, l, W / 2, y0 + 10 + i * 10, i === 0 ? C.yellow : C.white, 1, 'center'));
  }
}
