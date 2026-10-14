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

## Layout

```
src/core/     fixed-timestep loop, input, math + seeded RNG
src/render/   480x270 pixel screen, baked pixel sprites, bitmap font
src/audio/    synth sound effects
src/game/     world simulation (DOM-free), waves, tuning data, saves, state machine
tests/        Vitest: loop timing, wave planning, deterministic simulation
legacy/       the original index.html game and its assets
```

## Roadmap

- [x] **Phase 1:** Vite + TypeScript rebuild, fixed timestep, real ship stats, wave director, high scores
- [ ] Port the remaining legacy content: laser weapon, powerups, fuel/shield, bosses, lore easter egg
- [ ] **Phase 2:** roguelite layer, with upgrade picks between waves and permanent unlocks
- [ ] **Phase 3:** juice (hit-stop, better particles), CC0 art packs and music
- [ ] **Phase 4:** itch.io / GitHub Pages release
