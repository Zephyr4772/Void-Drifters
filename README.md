# Void Drifters

A pixel-art roguelite arena shooter for the browser, rebuilt from the original
single-file prototype (preserved in [`legacy/`](legacy/)).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # simulation tests
npm run build      # static build in dist/, ready for itch.io or GitHub Pages
```

**Controls:** WASD / arrows to move · Shift to boost · Space to fire · 1-3 to switch weapon · P / Esc to pause.

## How a run works

1. Pick a ship and launch. Enemies drop **scrap**; fly near it to pull it in.
2. Clear a wave and you **pick 1 of 3 upgrades**: damage, fire rate, extra projectiles, piercing, crits,
   new weapons, armor and more. Press R to reroll if you've bought the Reroll Module.
3. Every 5th wave a **Dreadnought boss** attacks with ring, fan and stream patterns. It gets faster below half health.
4. When you die, your scrap is banked. Spend it in the **Hangar** on permanent upgrades and on the Striker and Scout blueprints.

## Layout

```
src/core/     fixed-timestep loop, input, math + seeded RNG
src/render/   480x270 pixel screen, baked pixel sprites, bitmap font
src/audio/    synth sound effects
src/game/     world simulation (DOM-free), waves, upgrades, meta shop, saves, state machine
tests/        Vitest: loop timing, waves, simulation, upgrades, bosses, meta progression
legacy/       the original index.html game and its assets
```

## Roadmap

- [x] **Phase 1:** Vite + TypeScript rebuild, fixed timestep, real ship stats, wave director, high scores
- [x] **Phase 2:** roguelite layer: scrap, upgrade picks between waves, Hangar meta shop, ship unlocks, bosses
- [ ] Port the remaining legacy content: laser weapon, lore easter egg; more boss types and enemy variety
- [ ] **Phase 3:** juice (hit-stop, better particles), CC0 art packs and music
- [ ] **Phase 4:** itch.io / GitHub Pages release
