# RC Offroad Bash

A browser game about driving 1:8 and 1:6 scale RC trucks over a dirt track. It uses Three.js for rendering and a custom
rigid-body physics solver with per-wheel suspension, tyre grip, a nitro or brushless powertrain and a damage model.

See [FEATURES.md](FEATURES.md) for the full feature list and [FUTURE.md](FUTURE.md) for the roadmap.

## Run

```
./run.sh
```

Then open http://localhost:8765. You only need Python 3. The game is plain static files in `web/`, so any static file server works.
`run.sh` uses `tools/serve.py`, which turns browser caching off so edits show up on reload.

Useful URL parameters:

| parameter | effect |
|---|---|
| `?truck=eighthmt` or `?truck=sixthtrophy` | pick the truck (the menu also saves a choice) |
| `?go=1&mode=race`, `free` or `freestyle` | skip the menu |
| `?q=potato`, `low` or `high` | graphics quality (also in Options) |
| `?sky=<name>` | force a sky from `web/assets/sky/sky.json` |
| `?fps`, `?debug` | performance overlay, debug log |

## GitHub Pages

The workflow in `.github/workflows/pages.yml` publishes `web/` as the site root, so the Pages URL opens the game straight away.
Set Settings -> Pages -> Source to "GitHub Actions" once, then every push to `main` deploys.

## Controls

Arrows or WASD drive, Ctrl soft throttle, B camera, R tap to right the truck (hold to restart), Space handbrake or respawn,
F1 help, Esc pause. Gamepad (with a mapping wizard) and touch controls are supported.

## Trucks

Each truck is a folder in `web/assets/trucks/<id>/` holding `truck.json` (the handling profile), the model at three detail
levels and the collision spheres. See [web/assets/trucks/README.md](web/assets/trucks/README.md) for the profile format and
how to add a truck.

- **EighthMT** (`eighthmt`): 1:8 monster truck.
- **SixthTrophy** (`sixthtrophy`): 1:6 trophy truck.

The truck models and the sound, texture and sky generators are original work. The FreeCAD sources and the scripts that build the
assets are kept outside this repository.

## Tests

```
npm install
npm test
```

The tests in `tests/` run the physics headless in Node (`tests/harness.mjs` is the shared setup) and print results rather than asserting them.

## Map editor

The map editor and its modular park kit are switched off in this release because the kit pieces are third-party.
The code is still there: set `KIT_BUILDER` to `true` in `web/js/kit.js` and add the kit files to `web/assets/kit/` to bring it back.
The built-in BMX dirt track is generated and does not need the kit.

## Credits and licence

The code is MIT licensed, see [LICENSE](LICENSE). Third-party parts:

- [three.js](https://threejs.org) (MIT), in `web/lib/`.
- Barlow and Barlow Condensed by Jeremy Tribby (SIL Open Font License 1.1), in `web/fonts/`.
