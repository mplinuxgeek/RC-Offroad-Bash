# RC Offroad Bash: Features

A browser-based 1:8 scale RC monster truck game built with Three.js and a custom rigid-body physics solver. Trucks are built from FreeCAD-derived geometry, with a deep upgrade tree, live tuning, racing, freestyle scoring and a track editor.

## Contents

1. [Game modes](#game-modes)
2. [Physics and vehicle dynamics](#physics-and-vehicle-dynamics)
3. [Damage](#damage)
4. [Main menu](#main-menu)
5. [Garage](#garage)
6. [Upgrades](#upgrades)
7. [Tuning and setup](#tuning-and-setup)
8. [Economy](#economy)
9. [Fuel and battery](#fuel-and-battery)
10. [Customisation](#customisation)
11. [Tracks and map editor](#tracks-and-map-editor)
12. [Graphics and audio](#graphics-and-audio)
13. [Controls](#controls)

## Game modes

- **Race**
  - F1-style start lights with false-start detection.
  - Neon timing gates with split-time deltas against your personal best.
  - Best lap and splits saved per map in localStorage.
- **Freestyle** (2:00 competition)
  - Tricks detected: long jumps, big air, front flips, backflips, barrel rolls, 360 spins, wheelies, two-wheel rides, endos, drifts and donuts.
  - Chained combo multiplier (up to 4x), banked on a clean landing and lost on a roof bail or crash.
  - Session trick list, personal best and end-of-run breakdown.
- **Free roam**
  - No timer, gates or fuel limit.
  - Instant right-side recovery and checkpoint respawns.
- **Map editor**: switched off for now (see [Tracks and map editor](#tracks-and-map-editor)).

## Physics and vehicle dynamics

- 1:8 scale monster truck mass distribution: chassis, engine or motor, electronics, battery, wheels.
- 75 Hz rigid-body integrator with anti-roll stabilisation, speed-sensitive steering lock and low-speed centre-of-mass placement.
- Per-wheel spring and damper contacts with tunable sag, travel, bump stops, bound and rebound damping.
- Anti-roll bar coupling on both axles.
- Single or twin (8x) shock layouts, reflected in the physics and the 3D model.
- Wheelie bar: a stop torque limits nose-up pitch to the bar angle (15°, 30° or 45°); none when set to Off or after it breaks off.
- In-air pitch control: throttle pitches the nose up, brake pitches it down.
- Truck-specific launch and air behaviour: the 1:6 trophy truck squats on its rear springs on a full-throttle launch, spins all four tyres (skid marks and tyre noise on asphalt), lifts the nose only slightly and briefly, and rotates little in the air thanks to its long wheelbase and big tyres.
- Optional grip-limited steering lock (`steering.latG` in `truck.json`): the lock never asks for more cornering than the tyres grip, so at speed the trophy truck plows wide instead of spinning its tail under throttle. `steering.counter` adds automatic counter-steer when the tail slides, and `tyres.brakeTurnIn` shifts side grip to the front under braking so a brake tap helps the nose turn in; lifting off the throttle does the same at 25% strength (`tyres.liftTurnIn`).
- Surface detection with different friction and resistance on dirt, asphalt and grass.
- Damped body-on-chassis motion (roll, dive, squat) and a flexible antenna that reacts to G-forces.

## Damage

- Hard impacts break off tyres, roof panels, exhaust, fuel tank and suspension links.
- Trophy truck panels break off individually: the front bumper first, then the hood (taking the grille and headlights with it) and the left and right rear fender pods. The side pods stay on the cab, which is sturdier and still comes off in a big rollover.
- Mass and centre of mass are recalculated when a wheel is lost.
- Broken-off panels, wheels and the wheelie bar are rigid bodies with mass, friction and bounce. They collide with the terrain (including ramp faces and walls, so they do not wedge in the ground) and with the truck's collision spheres, so a hit sends them off in the direction and with the strength of the impact. Light panels slow down in the air, slide further on low friction and heavy pieces carry more momentum; a piece at rest wakes when the truck touches it.
- Rollover failure, fire and smoke particles, and broken driveshafts under excess torque.
- The wheelie bar is part of the damage model: hard rear impacts snap it off as debris, and it returns on restart.
- Dents and dark scuffs build up on the body shell from crashes (at the struck end) and rollovers (roof and sides).
- Damage can be switched off in Options.

## Main menu

- Live 3D truck preview: drag to rotate, wheel or pinch to zoom, double-click to reset, auto-spin when idle.
- Black reflective disk under the truck with the truck mirrored in its surface.
- Selected track shown as a slowly orbiting, zoomed-out backdrop behind the truck and menus.
- Truck picker (◀ ▶) above the track picker: EighthMT 1:8 monster truck or SixthTrophy 1:6 trophy truck. The choice is saved in localStorage (`mts_truck`) and the page reloads, since physics and model load at startup. A `?truck=` URL parameter still overrides it.
- Track picker, mode selection, Options and Garage entries.
- Truck body on/off toggle to show the chassis, motor or engine, steering linkage and battery.
- Custom favicon at several sizes.

## Garage

- Six tabs: Powertrain, Drivetrain, Suspension, Wheels / Steering, Tuning & Setup, Paint & Colours.
- Fixed-size part tiles with pinned buttons: green to upgrade, red to downgrade or uninstall.
- Part descriptions with the stats each tier changes.
- Live 3D truck preview that updates as you buy or change parts, with zoom and drag.
- Refund All button to uninstall everything and recover credits.
- Full mouse, touch, keyboard and gamepad navigation.

## Upgrades

- **Powertrain route**: choose nitro or brushless electric.
  - Nitro: combustion engines (.21 up to .36+), 1/2/3-speed transmissions, mechanical brakes (single, dual, triple disc) and tuned pipes.
  - Electric: brushless motors (4074, 4282, 4985), battery and ESC tiers (3S/4S up to 8S), and centre drivetrain options (lockout, fluid centre diff, spool).
  - The body styling updates automatically (the nitro engine model is shown on nitro and hidden on brushless).
- **Shared parts**
  - Suspension: single, dual-rate, big-bore and twin shocks.
  - Driveshafts and axles: dogbones up to splined chromoly.
  - Differentials: open, sealed metal, spiral-cut and locked viscous.
  - Chassis and frame: flat alloy, twin vertical plate, long-wheelbase and carbon hybrid.
  - Steering servos.
  - Wheels and tyres: chevron, multi-block, belted and beadlock rims.

## Tuning and setup

Available in the Garage and in the in-game pause menu, with Reset to Default and a non-destructive Cancel.

- Slipper clutch
- Shock damping (5 stages)
- Spring preload
- Wheelie bar: Off, 15°, 30° or 45° (both routes)
- Nitro: carb needle, clutch engagement, brake linkage bias
- Electric: ESC and motor timing, brake and regen strength

## Economy

- Credits earned from race wins, split bonuses and freestyle scores.
- Parts refund on uninstall.
- Loans: borrowed credits are repaid from earnings first.
- Credits and loan are one wallet shared by all trucks; owned parts, route, tuning, paint, tyre art, body and lights toggles, stability and race bests are saved per truck (localStorage keys get a `:<truck id>` suffix, eighthmt keeps the original keys).
- Progress saved in localStorage.

## Fuel and battery

- Nitro: tank burns with throttle and needle setting.
- Electric: battery drains with load and motor timing.
- Throttle cut and sputter when empty, then a coast to a stop.

## Customisation

- Colour pickers with live preview: body paint, trim and decals, suspension links and crossbars, shock springs.
- Tyre sidewall art picker: BKT, Big Bash, Dirt Devil, Monster Mayhem or Stars, shown twice on each sidewall next to the rim.
- LED lights and on/off toggles are parked (disabled via `LIGHTS_ENABLED` in `web/js/rctruck.js`); code kept for later.
- Body on/off toggle (main menu, Options and the Paint tab).
- Truck colour option in the main menu.

## Tracks and map editor

- Procedural BMX dirt track with banked curves, whoops and elevation changes.
- Black corrugated ag-pipe coping along some straight edges of the BMX track (visual only, no collision).
- The map editor (`mapedit.html`), user maps and the modular dirt park kit are switched off for now (`KIT_BUILDER` in `web/js/kit.js`) because the kit pieces are third-party and not shipped. The code is kept. With the kit files back in `web/assets/kit/` it offers berms, rollers, whoops, doubles, tabletops and ramps with snapping, perimeter barriers, JSON export and import, and browser saving.

## Graphics and audio

- PBR materials, clearcoat paint, environment mapping and generated terrain and tyre textures.
- ACES tone mapping, bloom, shadows that follow the truck, and exponential fog.
- Several camera views: chase, far, hood, side, top-down, and front and rear suspension.
- Web Audio synthesis: nitro engine loop with RPM drops on shifts, brushless ESC whine, skids, crash and part-break sounds, start-light tones.
- Particles for dust, smoke and fire, including nitro exhaust smoke emitted from the expansion pipe tip (thicker with throttle, nitro only).
- Performance overlay (F3, or `?fps` in the URL): FPS, frame time, CPU busy share, GPU time, JS heap, geometry and texture counts, draw calls and triangles. GPU time shows n/a and the heap line is hidden where the browser does not expose them.
- Pause menu "Hide (test)" button (or `?hide=truck,terrain,sky`) hides the truck, the track terrain, the grass ground, props (blocks, pipe), the sky, the HUD, the physics step or everything to find what slows a weak GPU. It is not saved.
- Truck model detail: `model.bin` (high), `model_med.bin` and `model_low.bin` per truck, built by `build_rctruck.py` (an asset tool kept outside this repo) with `LOD=medium|low`. Medium and low use coarser meshes and merge small loose parts per rig frame and material; low also drops tiny parts and keeps only the stock shock. The main menu Options "Truck detail" row sets Auto, High, Medium or Low (reloads the page, saved as `mts_lod`). Auto starts at high, medium on Low quality and low on Potato, then measures 5 s of play and, below 27 fps, steps down one level and reloads once (saved as `mts_lod_auto`). The menu preview and the garage use the same model.
- Main menu Options rows for Quality (Auto, Potato, Low, High; reloads the page and reopens Options; applies to the menu preview as well as the game; Potato renders at half resolution (`&rs=0.25` sets another scale) with simpler truck materials, plain Lambert shading and no anisotropic filtering on the grass, and no terrain detail shader, for weak GPUs such as TV browsers; Low and Potato also drop the transmission lamp materials, use a coarser track mesh that matches the collision mesh, and redraw the HUD's 2D overlay every third frame), FPS counter and Debug log, saved in localStorage (`mts_quality`, `mts_perf`, `mts_debug`). The `?q=`, `?fps` and `?debug` URL parameters still work and `?q=potato|low|high` overrides the saved quality.

## Controls

- **Keyboard**: arrows or WASD, with a layout option. Tap R to right the truck, hold for 1 s to restart the track. Space handbrake or respawn.
- **Gamepad**
  - Analogue triggers for throttle and brake, stick steering, D-pad menu navigation, a mappable lights button.
  - Mapping wizard (`?padmap=1` or C in the menu) for Xbox, PlayStation and generic pads.
- **Touch**: on-screen pedals, steering, camera and reset buttons.
