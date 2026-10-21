# Truck profiles

One folder per truck, all its assets together: `assets/trucks/<id>/` = `truck.json` (this profile), `model.json`+`model.bin` (model; optional `model_med.*` and `model_low.*` lower-detail variants, built with `LOD=medium` / `LOD=low`, picked by frame rate), `collision_spheres.json` (collision). Select with `?truck=<id>` (or `localStorage mts_truck`); default `eighthmt`.
Loaded by `js/trucks.js`; every key is optional — missing keys fall back to `DEFAULTS` in that file, so a new truck only lists what differs.
Keys starting with `_` are comments. Units: metres, seconds, m/s, m/s². Edit, save, reload the page (hard reload / disable cache) — no code changes needed.

To add a truck: copy the `eighthmt` folder to `<id>/`, rebuild/replace its model + spheres, set `model` (folder under `assets/` with `model.json/model.bin`, built by `build_rctruck.py` (an asset tool kept outside this repo)), `spheres` (collision spheres json, `update_spheres.py` (also kept outside this repo)), then tune.

| section | what it does | tune when… |
|---|---|---|
| `mass` | `wheel`/`body` relative weights, `drop` = body mass below the spheres (COG height), `bodyZ` = shift body mass fore/aft (weight distribution) | truck flips too easily → raise `drop` |
| `suspension.sag / travel` | static compression and extra stroke before the bump stop (m; the engine caps it at wheel radius minus 0.1 m, since a longer stroke lets the wheel sink through the ground) | ride height / how much it absorbs |
| `suspension.springRate` | spring stiffness multiplier (1 = `mass·g/4/sag`) | stiffer/softer ride |
| `suspension.bound / rebound` | damping on compression / extension as a fraction of critical. Rebound > bound is normal | **bouncy → raise `rebound` (1.0–1.4) and `bound`** |
| `suspension.antiRoll` | left/right wheel coupling | body roll in corners |
| `suspension.restitution(Body)` | bounce off hard landings (wheels / body) | pogo-ing on landings → lower |
| `suspension.inverted*` | softer, heavily damped spring when upside down | |
| `air.throttlePitch / brakePitch` (+`Max`) | mid-air pitch acceleration (rad/s²) and its rate cap | air control too strong/weak |
| `launch.pitchCapDeg / squat / spinRef` | `pitchCapDeg`: hard nose-up limit in degrees (replaces the flip and lift assists when set); `squat`: rear springs soften and front stiffen on a standing start; `spinRef`: grip fraction used for the wheelspin display (skid marks, tyre noise), lower = more spin | truck wheelies too easily, no wheelspin on asphalt |
| `damage.cabResist` | how much harder the cab shell is to wreck (1 = same as the monster truck); the front bumper, hood (with grille and headlights) and the left and right rear fender pods break off first. Which pieces are separate panels is set in `tools/build_rctruck.py` (`TROPHY_PANELS`) | cab comes off too easily or not at all |
| `drive.accel / topSpeed` | launch acceleration factor and top speed (m/s) | |
| `drive.brakeNitro[] / brakeElectric` | braking decel per brake upgrade level / electric | |
| `drive.batterySpeed[] / batteryPower[]` | optional per-battery-tier (NiMH, 3S/4S, 6S, 8S) top-speed and launch multipliers, replacing the shared defaults | pin 6S and 8S top speeds |
| `drive.speedTable[][]` / `drive.motorSpeed[]` | `speedTable`: electric top speed in mph, one row per brushless motor tier (1 to 3), one column per battery tier (as many as `partTiers.battery` has); replaces the motor and battery factors and is corrected for air drag. `motorSpeed`: motor-tier speed factors `[unused, tier 1, 2, 3]` used when there is no table | pin speeds to real Kv and cell-count figures |
| `partTiers.motor` / `partTiers.battery` | garage names and descriptions for the brushless motor and battery tiers (`[name, description]`; the motor list starts with `null` for tier 0, the battery list has no null (its first entry is the pack included with the conversion kit), so the number of entries sets how many battery tiers exist) | Kv-rated motors |
| `drivetrain` | 4WD power bleed: `frontBias` (0..1, 0.5 even) shifts drive grip between axles; `diffFront/diffCentre/diffRear` (0 open .. 1 locked) add traction and cost steering bite. Approximate: no per-wheel torque in the solver | more rear bias = looser, more front = pulls through corners |
| `drive.launchBoost / launchBoostKmh` | extra thrust at standstill, fading to 1× at that speed | standing wheelies |
| `gearing.nitro[]` | one entry per transmission level: `up`/`down` shift speeds (m/s), `launchMu`, `g1Boost`, `fade`, `dip`, `pb` | gear feel, engine sound follows these |
| `gearing.electric` | launch traction/fade for the brushless route | |
| `steering` | `max` angle (°), `rate`, `returnRate`, `speedLock` (m/s where lock halves), `minLock`, optional `landRecover` (seconds for steering authority to return after touchdown; wheels also centre in the air) | |
| `tyres.grip / sideGrip` | longitudinal (drive/brake) and lateral (cornering) friction | grip vs slide |
| `tyres.front*/rear*` | per-axle multipliers (`frontGrip`, `rearGrip`, `frontSideGrip`, `rearSideGrip`) | lower `rearSideGrip` = loose tail, lower `frontSideGrip` = understeer |
| `tyres.sideStiffness / sideGripCap / frictionCircle / bodyGrip` | how fast sideways slip is killed, upgrade ceiling, shared long/lat grip budget, body-panel friction | |
| `stability` | `antiRoll` roll damping, `wheelieDamp`, `airPitchDamp` (per-step pitch-rate damping in the air, 1 = none, lower = less rotation), `airYawDamp` (per-step yaw-rate damping while no wheel touches, 1 = none), `rollLever` (metres added to the arm of the lateral tyre force about the centre of mass; raises how easily tyre grip tips the truck over, 0 = off), `rollFadeLo` / `rollFadeHi` / `rollFadeK` (lateral g where the ground roll damping starts fading out, where it is fully faded, and how much of it is removed; defaults 0.45, 0.9, 1), `impactGripCap` (ceiling on the tyre friction budget as a multiple of the static per-wheel load, so a landing impact does not make the tyres grip like glue and kick the truck sideways; omit for no ceiling), `axleYawDamp` (per-step yaw-rate damping while only one axle touches the ground, 1 = none), `liftoffPitchDamp` / `liftoffTime` (extra per-step pitch-rate damping for the first `liftoffTime` s, default 0.3, after the last wheel leaves the ground; sheds the flick from the lip, 1 = none), axle articulation `articulationMax/Rate`, hill climbing | |
| `resistance` | rolling resistance (m/s²) and air drag | |
| `cabSpring[]` | per shock-upgrade level: body bounce on its mounts (`wt`,`wr` Hz, `ze` damping ratio, `roll`, visual `scale`) | body wobble → raise `ze` |

Upgrades (garage) multiply these base values; the profile is the "stock truck".
