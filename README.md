# Void Drifters

A pixel-art roguelite arena shooter for the browser, rebuilt from the original
single-file prototype (preserved in [`legacy/`](legacy/)).

**▶ Play it in your browser: https://zephyr4772.github.io/Void-Drifters/**

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simulation tests
npm run build      # static build in dist/, ready for itch.io or GitHub Pages
```

**Controls:** WASD / arrows to move · Shift to boost · left click to fire · Space reserved for a ship special (coming soon) · 1-3 to switch weapon · M to mute · P / Esc to pause.

## How a run works

1. Pick a ship and launch. Enemies drop **scrap**; fly near it to pull it in.
2. Clear a wave and you **pick 1 of 3 upgrades**: damage, fire rate, extra projectiles, piercing, crits,
   new weapons, armor and more. Press R to reroll if you've bought the Reroll Module.
3. Every 5th wave a **Dreadnought boss** attacks with ring, fan and stream patterns. It gets faster below half health.
4. When you die, your scrap is banked. Spend it in the **Hangar** on permanent upgrades and on the Striker and Scout blueprints.

## Layout

```
src/core/     fixed-timestep loop, input, math + seeded RNG
src/render/   640x360 pixel screen, Kenney sprite sheets + baked fallback sprites, bitmap font
src/audio/    synth sound effects
src/game/     world simulation (DOM-free), waves, upgrades, meta shop, saves, state machine
tests/        Vitest: loop timing, waves, simulation, upgrades, bosses, meta progression
legacy/       the original index.html game and its assets
```

## Roadmap

- [x] **Phase 1:** Vite + TypeScript rebuild, fixed timestep, real ship stats, wave director, high scores
- [x] **Phase 2:** roguelite layer: scrap, upgrade picks between waves, Hangar meta shop, ship unlocks, bosses
- [ ] Port the remaining legacy content: laser weapon, lore easter egg; more boss types and enemy variety
- [x] **Phase 3a:** juice (hit-stop, flashes, trails, crit popups, spawn warnings) and a procedural chiptune soundtrack
- [x] **Phase 3b:** Kenney "Pixel Shmup" CC0 art for ships, aliens, boss, shots and explosions; 640x360 view
- [x] **Phase 4:** GitHub Pages release, deployed automatically from `main` by `.github/workflows/deploy.yml`
- [ ] itch.io page

## Credits

- Ship, bullet and explosion art: [Pixel Shmup](https://kenney.nl/assets/pixel-shmup) by Kenney, CC0
  (see `public/assets/kenney-pixel-shmup/License.txt`).
- Original game, design and code: Sinhal Joshi.
