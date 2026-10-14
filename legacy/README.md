# Void Drifters

**A browser space-combat game that is one HTML file.** No build step, no bundler,
no dependencies — all game logic, rendering and state live in `index.html`
(~200 KB), with sprite art loaded alongside it.

## Play it

Clone and open `index.html` in a browser. That's the whole process.

```bash
git clone https://github.com/Zephyr4772/Void-Drifters.git
cd Void-Drifters
# open index.html
```

Or serve it, if your browser blocks local asset loading:

```bash
python -m http.server 8000     # then visit http://localhost:8000
```

## Why one file

A constraint for its own sake: no tooling meant no setup to fight, and the whole
game stays greppable. The trade-off is that `index.html` is a 200 KB file with
everything in it — fine at this scale, and the reason you wouldn't do this for
anything bigger.

## Contents

```
index.html      game loop, rendering, input, entities, state
aliens/         enemy sprites
spaceships/     player ship sprites
```

## Limitations

- Desktop keyboard only — no touch controls.
- No save state; no score persistence.
- Untested outside recent Chrome and Firefox.
