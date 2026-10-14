/** Top-level state machine (title, hangar, playing, upgrade pick, paused, game over) plus rendering. */
import type { Input } from '../core/input';
import { Audio } from '../audio/sfx';
import { drawText } from '../render/font';
import { VIEW_H as H, VIEW_W as W, type Screen } from '../render/screen';
import { buildSprites, PALETTE as C, type Sprite, type SpriteBank } from '../render/sprites';
import { SHIP_ORDER, SHIPS, WEAPONS, type WeaponId } from './data';
import { META, level, nextCost, runConfigFromMeta, shipUnlocked } from './meta';
import { loadSave, writeSave, type SaveData } from './save';
import type { UpgradeDef } from './upgrades';
import { World } from './world';

type State = 'title' | 'hangar' | 'playing' | 'upgrade' | 'paused' | 'over';

interface Star { x: number; y: number; speed: number; color: string }
interface Popup { x: number; y: number; text: string; color: string; t: number }
interface Boom { x: number; y: number; t: number; big: boolean }

const BOOM_TIME = 0.35;

const TITLE_MENU = ['LAUNCH', 'HANGAR'] as const;
// Screens that pop up mid-action ignore confirms briefly, so a player tapping
// click to shoot doesn't instantly pick an upgrade or skip the game-over screen.
const PICK_GRACE = 0.5;
const GAME_OVER_GRACE = 1.2;

export class Game {
  private state: State = 'title';
  private world: World | null = null;
  private sprites: SpriteBank = buildSprites();
  private audio = new Audio();
  private save: SaveData = loadSave();
  private shipIndex = Math.max(0, SHIP_ORDER.indexOf(this.save.ship as never));
  private menuIndex = 0;
  private hangarIndex = 0;
  private choices: UpgradeDef[] = [];
  private choiceIndex = 0;
  private grace = 0;
  private stars: Star[] = [];
  private shake = 0;
  private banner = { text: '', t: 0, color: C.white as string };
  private cheatBuf = '';
  private t = 0;
  private newBest = false;
  private banked = 0;
  // Juice: hit-stop freezes the sim for a beat on heavy impacts.
  private hitstop = 0;
  private flash = { color: C.white as string, t: 0, max: 1 };
  private popups: Popup[] = [];
  private booms: Boom[] = [];
  private muzzle = 0;
  private whiteCache = new Map<Sprite, HTMLCanvasElement>();

  constructor(private screen: Screen, private input: Input) {
    this.audio.muted = this.save.muted;
    for (let i = 0; i < 90; i++) {
      const layer = i % 3;
      this.stars.push({
        x: Math.random() * W, y: Math.random() * H,
        speed: [4, 9, 18][layer], color: [C.ink, '#3a3660', C.steel][layer],
      });
    }
    window.addEventListener('keydown', () => this.audio.unlock());
    window.addEventListener('mousedown', () => this.audio.unlock());
  }

  /** Swap in a sprite bank (e.g. once the Kenney sheets finish loading). */
  setSprites(bank: SpriteBank): void {
    this.sprites = bank;
    this.whiteCache.clear();
  }

  private updateMusic(): void {
    if (this.state === 'title' || this.state === 'hangar' || this.state === 'over') this.audio.setMusic('calm');
    else this.audio.setMusic(this.world?.boss ? 'boss' : 'action');
  }

  private flashScreen(color: string, t: number): void {
    this.flash = { color, t, max: t };
  }

  private go(state: State): void {
    this.state = state;
  }

  private confirmed(): boolean {
    return this.grace <= 0 && (this.input.pressed('confirm') || this.input.pressed('fire'));
  }

  update(dt: number): void {
    const inp = this.input;
    inp.beginTick();
    this.t += dt;
    this.grace = Math.max(0, this.grace - dt);
    for (const s of this.stars) { s.y += s.speed * dt; if (s.y >= H) { s.y -= H; s.x = Math.random() * W; } }
    this.shake = Math.max(0, this.shake - dt * 30);
    this.banner.t = Math.max(0, this.banner.t - dt);
    this.flash.t = Math.max(0, this.flash.t - dt);
    this.muzzle = Math.max(0, this.muzzle - dt);
    for (const p of this.popups) { p.t -= dt; p.y -= 14 * dt; }
    this.popups = this.popups.filter((p) => p.t > 0);
    for (const b of this.booms) b.t -= dt;
    this.booms = this.booms.filter((b) => b.t > 0);
    this.checkCheats(inp.typed);
    if (inp.pressed('mute')) {
      this.audio.muted = this.save.muted = !this.save.muted;
      writeSave(this.save);
      this.showBanner(this.save.muted ? 'SOUND OFF' : 'SOUND ON', C.steel, 1);
    }
    this.updateMusic();

    switch (this.state) {
      case 'title': this.updateTitle(); break;
      case 'hangar': this.updateHangar(); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'upgrade': this.updateUpgrade(); break;
      case 'paused':
        if (inp.pressed('pause') || this.confirmed()) this.state = 'playing';
        break;
      case 'over':
        // Keep the debris drifting behind the game-over screen.
        this.world!.update(dt, { ax: 0, ay: 0, boost: false, fire: false });
        if (this.grace <= 0 && inp.pressed('confirm')) this.go('title');
        break;
    }
  }

  private updateTitle(): void {
    const inp = this.input;
    const n = SHIP_ORDER.length;
    if (inp.pressed('left')) { this.shipIndex = (this.shipIndex + n - 1) % n; this.audio.play('select'); }
    if (inp.pressed('right')) { this.shipIndex = (this.shipIndex + 1) % n; this.audio.play('select'); }
    if (inp.pressed('up') || inp.pressed('down')) { this.menuIndex = 1 - this.menuIndex; this.audio.play('select'); }
    if (!this.confirmed()) return;
    if (TITLE_MENU[this.menuIndex] === 'HANGAR') { this.go('hangar'); this.audio.play('select'); return; }
    if (!shipUnlocked(this.save.meta, SHIP_ORDER[this.shipIndex])) { this.audio.play('deny'); return; }
    this.startRun();
  }

  private updateHangar(): void {
    const inp = this.input;
    const n = META.length;
    if (inp.pressed('up')) { this.hangarIndex = (this.hangarIndex + n - 1) % n; this.audio.play('select'); }
    if (inp.pressed('down')) { this.hangarIndex = (this.hangarIndex + 1) % n; this.audio.play('select'); }
    if (inp.pressed('pause') || inp.pressed('left')) { this.go('title'); return; }
    if (!this.confirmed()) return;
    const def = META[this.hangarIndex];
    const cost = nextCost(this.save.meta, def);
    if (cost === null || this.save.scrap < cost) { this.audio.play('deny'); return; }
    this.save.scrap -= cost;
    this.save.meta[def.id] = level(this.save.meta, def.id) + 1;
    writeSave(this.save);
    this.audio.play('buy');
  }

  private updatePlaying(dt: number): void {
    const inp = this.input;
    if (inp.pressed('pause')) { this.go('paused'); return; }
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    const w = this.world!;
    let weapon: WeaponId | undefined;
    if (inp.pressed('weapon1')) weapon = w.weapons[0];
    if (inp.pressed('weapon2')) weapon = w.weapons[1];
    if (inp.pressed('weapon3')) weapon = w.weapons[2];
    w.update(dt, {
      ax: (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0),
      ay: (inp.held('down') ? 1 : 0) - (inp.held('up') ? 1 : 0),
      boost: inp.held('boost'),
      fire: inp.held('fire'),
      weapon,
    });
    // TODO: Space ('special') is reserved for a powerup / ship-specific ability, still to be designed.
    this.handleEvents(w);
  }

  private updateUpgrade(): void {
    const inp = this.input, w = this.world!;
    const n = this.choices.length;
    if (inp.pressed('left')) { this.choiceIndex = (this.choiceIndex + n - 1) % n; this.audio.play('select'); }
    if (inp.pressed('right')) { this.choiceIndex = (this.choiceIndex + 1) % n; this.audio.play('select'); }
    if (inp.pressed('reroll') && w.rerolls > 0) {
      w.rerolls--;
      this.choices = w.rollUpgrades();
      this.choiceIndex = 0;
      this.audio.play('buy');
      return;
    }
    let pick = -1;
    if (this.grace <= 0) {
      if (inp.pressed('weapon1')) pick = 0;
      if (inp.pressed('weapon2')) pick = 1;
      if (inp.pressed('weapon3')) pick = 2;
    }
    if (this.confirmed()) pick = this.choiceIndex;
    if (pick < 0 || (n > 0 && pick >= n)) return;
    w.finishPick(this.choices[pick] ?? null);
    this.audio.play('buy');
    this.state = 'playing';
  }

  private startRun(): void {
    const id = SHIP_ORDER[this.shipIndex];
    this.save.ship = id;
    this.world = new World(id, Date.now(), runConfigFromMeta(this.save.meta));
    this.newBest = false;
    this.hitstop = 0;
    this.popups = [];
    this.go('playing');
    this.audio.play('select');
  }

  private handleEvents(w: World): void {
    for (const e of w.events) {
      switch (e.type) {
        case 'shoot': this.audio.play('shoot'); this.muzzle = 0.05; break;
        case 'hit': this.audio.play('hit'); break;
        case 'crit':
          this.audio.play('crit');
          this.popups.push({ x: e.x, y: e.y - 4, text: `${e.amount}!`, color: C.yellow, t: 0.6 });
          break;
        case 'pickup': this.audio.play('pickup'); break;
        case 'explode':
          this.audio.play(e.big ? 'bigExplode' : 'explode');
          this.booms.push({ x: e.x, y: e.y, t: BOOM_TIME, big: e.big });
          this.shake = Math.max(this.shake, e.big ? 4 : 2);
          if (e.big) this.hitstop = Math.max(this.hitstop, 0.04);
          break;
        case 'playerHit':
          this.audio.play('hurt');
          this.shake = 6;
          this.hitstop = 0.09;
          this.flashScreen(C.red, 0.25);
          break;
        case 'waveStart':
          if (e.boss) { this.audio.play('boss'); this.showBanner('WARNING: BOSS', C.red, 2.4); }
          else { this.audio.play('wave'); this.showBanner(`WAVE ${e.wave}`, C.white, 1.8); }
          break;
        case 'bossDown':
          this.shake = 10;
          this.hitstop = 0.3;
          this.flashScreen(C.white, 0.5);
          this.showBanner('BOSS DESTROYED', C.yellow, 2);
          break;
        case 'waveCleared':
          this.choices = w.rollUpgrades();
          this.choiceIndex = 0;
          this.go('upgrade');
          this.grace = PICK_GRACE;
          break;
        case 'gameOver': this.endRun(w); break;
      }
    }
  }

  private showBanner(text: string, color: string, t: number): void {
    this.banner = { text, color, t };
  }

  private endRun(w: World): void {
    this.go('over');
    this.grace = GAME_OVER_GRACE;
    this.newBest = w.score > this.save.highScore;
    this.banked = Math.floor(w.scrap);
    this.save.scrap += this.banked;
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
      this.showBanner(this.world.godMode ? 'GOD MODE ON' : 'GOD MODE OFF', C.yellow, 1.5);
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
    const inRun = this.state !== 'title' && this.state !== 'hangar';
    if (this.world && inRun) this.drawWorld(this.world);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (this.state === 'title') this.drawTitle();
    else if (this.state === 'hangar') this.drawHangar();
    else this.drawHud(this.world!);
    if (this.state === 'upgrade') this.drawUpgrade(this.world!);
    if (this.state === 'paused') this.drawPanel('PAUSED', ['', 'P / ENTER TO RESUME']);
    if (this.state === 'over') this.drawGameOver(this.world!);
    if (this.flash.t > 0) {
      ctx.globalAlpha = 0.45 * (this.flash.t / this.flash.max);
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.save.muted) drawText(ctx, 'MUTED', W / 2, H - 8, C.steel, 1, 'center');
  }


  private drawSprite(sp: Sprite, x: number, y: number, angle = 0, scale = 1): void {
    const ctx = this.screen.ctx;
    const prev = ctx.getTransform();
    ctx.translate(Math.round(x), Math.round(y));
    if (angle) ctx.rotate(angle);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.drawImage(sp, -Math.floor(sp.width / 2), -Math.floor(sp.height / 2));
    ctx.setTransform(prev);
  }

  /** White silhouette of a sprite, cached, used for the hit flash. */
  private whiteOf(sp: Sprite): Sprite {
    let out = this.whiteCache.get(sp);
    if (!out) {
      out = document.createElement('canvas');
      out.width = sp.width; out.height = sp.height;
      const c = out.getContext('2d')!;
      c.drawImage(sp, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = C.white;
      c.fillRect(0, 0, out.width, out.height);
      this.whiteCache.set(sp, out);
    }
    return out;
  }

  /** Snap an angle to `steps` directions so rotated pixel art stays chunky. */
  private snap(angle: number, steps: number): number {
    const k = (Math.PI * 2) / steps;
    return Math.round(angle / k) * k;
  }

  private drawWorld(w: World): void {
    const ctx = this.screen.ctx;
    const S = this.sprites;
    for (const p of w.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Spawn warnings: a blinking marker at the edge where an enemy is about to appear.
    for (const tg of w.telegraphs) {
      if (Math.floor(tg.t * 12) % 2) continue;
      const x = Math.round(Math.min(W - 4, Math.max(3, tg.x))), y = Math.round(Math.min(H - 4, Math.max(3, tg.y)));
      ctx.fillStyle = tg.order.what === 'asteroid' ? C.steel : C.red;
      ctx.fillRect(x - 3, y, 7, 1);
      ctx.fillRect(x, y - 3, 1, 7);
      ctx.fillRect(x - 1, y - 1, 3, 3);
    }

    for (const p of w.pickups) {
      if (p.life < 2 && Math.floor(this.t * 10) % 2 === 0) continue; // blink before despawning
      this.drawSprite(S.scrap, p.x, p.y);
    }
    for (const a of w.asteroids) {
      const sp = S.asteroid[a.tier][a.variant];
      const rot = this.snap(a.rot, 8);
      this.drawSprite(a.flash > 0 ? this.whiteOf(sp) : sp, a.x, a.y, rot);
    }
    for (const al of w.aliens) {
      const sp = S.alien[al.kind];
      // Ship art turns to face where it's flying; the original critter art bobs instead.
      const angle = S.aliensFaceHeading ? this.snap(Math.atan2(al.vy, al.vx), 16) : 0;
      const bob = S.aliensFaceHeading ? 0 : Math.round(Math.sin(al.t * 4));
      this.drawSprite(al.flash > 0 ? this.whiteOf(sp) : sp, al.x, al.y + bob, angle, al.mini ? 0.5 : 1);
    }
    if (w.boss) {
      const b = w.boss;
      const sp = S.boss;
      const angle = S.aliensFaceHeading ? Math.PI / 2 : 0; // pack art faces down at the player
      this.drawSprite(b.flash > 0 ? this.whiteOf(sp) : sp, b.x, b.y + Math.round(Math.sin(b.t * 3)), angle);
    }
    for (const b of w.bullets) {
      const shot = b.hostile ? undefined : b.crit ? S.critShot : S.shot;
      if (shot) {
        this.drawSprite(shot, b.x, b.y, this.snap(Math.atan2(b.vy, b.vx), 16));
        continue;
      }
      const color = b.hostile ? C.red : b.crit ? C.white : C.yellow;
      // Short trail: two fading pixels behind the bullet along its velocity.
      ctx.fillStyle = color;
      for (let i = 2; i >= 1; i--) {
        ctx.globalAlpha = 0.5 / i;
        ctx.fillRect(Math.floor(b.x - b.vx * 0.012 * i), Math.floor(b.y - b.vy * 0.012 * i), 1, 1);
      }
      ctx.globalAlpha = 1;
      if (b.hostile) {
        // Enemy shots: 3px red with a hot core so they read against the dark background.
        ctx.fillRect(Math.floor(b.x - 1), Math.floor(b.y - 1), 3, 3);
        ctx.fillStyle = C.yellow;
        ctx.fillRect(Math.floor(b.x), Math.floor(b.y), 1, 1);
      } else {
        ctx.fillRect(Math.floor(b.x - 1), Math.floor(b.y - 1), 2, 2);
      }
    }

    // Explosions: pack animation frames (falls back to particles only).
    if (S.boom) {
      for (const bm of this.booms) {
        const f = Math.min(S.boom.length - 1, Math.floor((1 - bm.t / BOOM_TIME) * S.boom.length));
        this.drawSprite(S.boom[f], bm.x, bm.y, 0, bm.big ? 2 : 1);
      }
    }

    const s = w.ship;
    if (!w.over) {
      const sp = S.ship[s.id];
      this.drawSprite(sp, s.x, s.y, this.snap(s.angle, 16));
      const nose = Math.max(7, sp.width / 2 - 4);
      if (this.muzzle > 0) {
        ctx.fillStyle = C.white;
        ctx.fillRect(Math.round(s.x + Math.cos(s.angle) * nose) - 1, Math.round(s.y + Math.sin(s.angle) * nose) - 1, 3, 3);
      }
      // Shield bubble while invulnerable, flickering out as it expires.
      if (s.invuln > 0 && (s.invuln > 0.5 || Math.floor(this.t * 20) % 2)) this.ring(s.x, s.y, nose + 3, C.cyan);
      if (w.godMode) this.ring(s.x, s.y, nose + 5, C.yellow);
    }

    for (const p of this.popups) drawText(ctx, p.text, p.x, p.y, p.t < 0.2 && Math.floor(this.t * 20) % 2 ? C.orange : p.color, 1, 'center');
  }

  /** Pixel circle outline (no anti-aliasing). */
  private ring(cx: number, cy: number, r: number, color: string): void {
    const ctx = this.screen.ctx;
    ctx.fillStyle = color;
    const n = Math.ceil(r * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }

  private drawHud(w: World): void {
    const ctx = this.screen.ctx;
    drawText(ctx, `${w.score}`.padStart(7, '0'), 6, 6, C.white);
    if (w.combo >= 5) drawText(ctx, `x${w.comboMult.toFixed(1)} COMBO ${w.combo}`, 6, 14, C.yellow);
    drawText(ctx, `WAVE ${w.wave}`, W - 6, 6, C.cyan, 1, 'right');
    drawText(ctx, `SCRAP ${Math.floor(w.scrap)}`, W - 6, 14, C.yellow, 1, 'right');
    for (let i = 0; i < w.maxHull; i++) {
      ctx.fillStyle = i < w.ship.hull ? C.red : C.ink;
      ctx.fillRect(6 + i * 6, H - 10, 4, 4);
    }
    w.weapons.forEach((id, i) => {
      const active = id === w.ship.weapon;
      drawText(ctx, `${i + 1} ${WEAPONS[id].name}`, W - 6, H - 10 - (w.weapons.length - 1 - i) * 7, active ? C.yellow : C.steel, 1, 'right');
    });
    if (w.boss) {
      const b = w.boss;
      const bw = 200, x0 = W / 2 - bw / 2;
      drawText(ctx, `DREADNOUGHT MK ${b.tier}`, W / 2, 6, C.red, 1, 'center');
      ctx.fillStyle = C.ink; ctx.fillRect(x0, 13, bw, 4);
      ctx.fillStyle = b.hp < b.maxHp / 2 ? C.orange : C.red;
      ctx.fillRect(x0, 13, Math.round(bw * Math.max(0, b.hp / b.maxHp)), 4);
    }
    if (this.banner.t > 0) {
      drawText(ctx, this.banner.text, W / 2, H / 2 - 50, this.banner.t % 0.3 < 0.2 ? this.banner.color : C.cyan, 2, 'center');
    }
  }

  private drawTitle(): void {
    const ctx = this.screen.ctx;
    drawText(ctx, 'VOID DRIFTERS', W / 2, 30, C.cyan, 4, 'center');
    drawText(ctx, 'VOID DRIFTERS', W / 2, 29, C.white, 4, 'center');

    const id = SHIP_ORDER[this.shipIndex];
    const st = SHIPS[id];
    const unlocked = shipUnlocked(this.save.meta, id);
    const cx = W / 2, cy = 120;
    ctx.save();
    ctx.translate(cx, cy);
    const zoom = this.sprites.ship[id].width > 16 ? 2 : 3; // pack ships are 32px, the fallback art is ~12px
    ctx.scale(zoom, zoom);
    ctx.rotate(-Math.PI / 2);
    if (!unlocked) ctx.globalAlpha = 0.25;
    const sp = this.sprites.ship[id];
    ctx.drawImage(sp, -Math.floor(sp.width / 2), -Math.floor(sp.height / 2));
    ctx.restore();
    drawText(ctx, '<', cx - 70, cy - 4, C.steel, 2, 'center');
    drawText(ctx, '>', cx + 70, cy - 4, C.steel, 2, 'center');
    drawText(ctx, st.name, cx, cy + 42, unlocked ? C.white : C.steel, 2, 'center');
    if (unlocked) {
      drawText(ctx, st.blurb, cx, cy + 56, C.steel, 1, 'center');
      this.statBar('SPEED', st.maxSpeed / 190, cx, cy + 68);
      this.statBar('HULL', st.hull / 5, cx, cy + 76);
      this.statBar('FIRE RATE', 0.85 / st.fireRateMul, cx, cy + 84);
    } else {
      drawText(ctx, 'LOCKED - BUY BLUEPRINT IN HANGAR', cx, cy + 58, C.red, 1, 'center');
    }

    TITLE_MENU.forEach((label, i) => {
      const sel = i === this.menuIndex;
      const text = sel ? `> ${label} <` : label;
      drawText(ctx, text, W / 2, 240 + i * 16, sel ? C.yellow : C.steel, 2, 'center');
    });
    drawText(ctx, 'WASD: MOVE   CLICK: FIRE   SHIFT: BOOST   1-3: WEAPON   M: MUTE', W / 2, H - 40, C.steel, 1, 'center');
    drawText(ctx, 'ARROWS: SHIP / MENU   ENTER: SELECT', W / 2, H - 28, C.steel, 1, 'center');
    drawText(ctx, `SCRAP ${this.save.scrap}   BEST ${this.save.highScore}   WAVE ${this.save.bestWave}`, W / 2, H - 14, C.cyan, 1, 'center');
    drawText(ctx, 'ART: KENNEY.NL', W - 6, H - 10, '#3a3660', 1, 'right');
  }

  private drawHangar(): void {
    const ctx = this.screen.ctx;
    drawText(ctx, 'HANGAR', W / 2, 16, C.cyan, 3, 'center');
    drawText(ctx, `SCRAP ${this.save.scrap}`, W / 2, 40, C.yellow, 2, 'center');
    const x0 = 70, x1 = W - 70;
    META.forEach((def, i) => {
      const y = 62 + i * 22;
      const sel = i === this.hangarIndex;
      const lv = level(this.save.meta, def.id);
      const cost = nextCost(this.save.meta, def);
      if (sel) { ctx.fillStyle = C.ink; ctx.fillRect(x0 - 6, y - 4, x1 - x0 + 12, 19); }
      drawText(ctx, def.name, x0, y, sel ? C.white : C.steel, 1);
      drawText(ctx, def.desc, x0, y + 8, C.steel, 1);
      for (let p = 0; p < def.costs.length; p++) {
        ctx.fillStyle = p < lv ? C.green : '#3a3660';
        ctx.fillRect(x1 - 70 + p * 6, y + 1, 4, 4);
      }
      const label = cost === null ? 'OWNED' : `${cost}`;
      const afford = cost !== null && this.save.scrap >= cost;
      drawText(ctx, label, x1, y, cost === null ? C.green : afford ? C.yellow : C.red, 1, 'right');
    });
    drawText(ctx, 'UP/DOWN: SELECT   ENTER: BUY   ESC: BACK', W / 2, H - 12, C.steel, 1, 'center');
  }

  private drawUpgrade(w: World): void {
    const ctx = this.screen.ctx;
    ctx.fillStyle = 'rgba(7,6,15,0.8)';
    ctx.fillRect(0, 0, W, H);
    drawText(ctx, `WAVE ${w.wave} CLEARED`, W / 2, 40, C.green, 2, 'center');
    drawText(ctx, 'CHOOSE AN UPGRADE', W / 2, 60, C.white, 1, 'center');
    const cw = 130, gap = 12;
    const total = this.choices.length * cw + (this.choices.length - 1) * gap;
    this.choices.forEach((u, i) => {
      const x = Math.round(W / 2 - total / 2 + i * (cw + gap));
      const y = 85;
      const sel = i === this.choiceIndex;
      ctx.fillStyle = sel ? '#2a2650' : C.ink;
      ctx.fillRect(x, y, cw, 80);
      ctx.strokeStyle = sel ? C.yellow : '#3a3660';
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, 79);
      drawText(ctx, `${i + 1}`, x + 6, y + 6, sel ? C.yellow : C.steel, 1);
      const taken = w.taken[u.id] ?? 0;
      if (u.max > 1 && u.max < 99) drawText(ctx, `${taken}/${u.max}`, x + cw - 6, y + 6, C.steel, 1, 'right');
      drawText(ctx, u.name, x + cw / 2, y + 28, sel ? C.white : C.steel, 1, 'center');
      drawText(ctx, u.desc, x + cw / 2, y + 46, C.cyan, 1, 'center');
    });
    if (!this.choices.length) drawText(ctx, 'NOTHING LEFT TO UPGRADE - ENTER', W / 2, 120, C.steel, 1, 'center');
    const hint = w.rerolls > 0 ? `   R: REROLL (${w.rerolls})` : '';
    drawText(ctx, `LEFT/RIGHT OR 1-3   ENTER: TAKE${hint}`, W / 2, 190, C.steel, 1, 'center');
  }

  private drawGameOver(w: World): void {
    const blinkOn = this.grace <= 0 && Math.floor(this.t * 2) % 2 === 0;
    this.drawPanel('GAME OVER', [
      `SCORE ${w.score}`,
      `WAVE ${w.wave}`,
      this.newBest ? 'NEW HIGH SCORE!' : `BEST ${this.save.highScore}`,
      `+${this.banked} SCRAP BANKED`,
      '',
      blinkOn ? 'PRESS ENTER' : '',
    ]);
  }

  private statBar(label: string, frac: number, cx: number, y: number): void {
    const ctx = this.screen.ctx;
    drawText(ctx, label, cx - 4, y, C.steel, 1, 'right');
    ctx.fillStyle = C.ink;
    ctx.fillRect(cx + 4, y, 40, 5);
    ctx.fillStyle = C.green;
    ctx.fillRect(cx + 4, y, Math.round(40 * Math.min(1, frac)), 5);
  }

  private drawPanel(title: string, lines: string[]): void {
    const ctx = this.screen.ctx;
    const pw = 220, h = 34 + lines.length * 12;
    const x0 = Math.round(W / 2 - pw / 2), y0 = Math.round(H / 2 - h / 2);
    ctx.fillStyle = 'rgba(7,6,15,0.92)';
    ctx.fillRect(x0, y0, pw, h);
    ctx.strokeStyle = C.cyan;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, pw - 1, h - 1);
    drawText(ctx, title, W / 2, y0 + 10, C.yellow, 2, 'center');
    lines.forEach((l, i) => drawText(ctx, l, W / 2, y0 + 32 + i * 12, C.white, 1, 'center'));
  }
}
