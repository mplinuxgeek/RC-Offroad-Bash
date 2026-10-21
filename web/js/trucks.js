// Truck physics/handling profile: all tunable numbers live in assets/trucks/<id>/truck.json (see assets/trucks/README.md).
// DEFAULTS below are the fall-back for any key a profile leaves out, so a new truck only needs the values it wants to change.
export const DEFAULTS = {
  name: 'Truck', model: 'model', spheres: 'collision_spheres.json',
  mass: { wheel: 0.315, body: 4.25, drop: 0.75, bodyZ: 0 },
  suspension: { sag: 0.15, travel: 0.25, droop: 0.12, springRate: 1.0, bound: 0.6, rebound: 0.9, antiRoll: 10, zFront: 1, zRear: 1,
    invertedSoftening: 0.65, invertedBound: 1.4, invertedRebound: 1.8, restitution: 0.12, restitutionBody: 0.3 },
  air: { throttlePitch: 1.6, throttlePitchMax: 2.2, brakePitch: 5, brakePitchMax: 3.6 },
  drive: { accel: 0.25, topSpeed: 28, brakeNitro: [8.5, 10, 11], brakeElectric: 10.5, launchBoost: 6, launchBoostKmh: 50, brakeGripBoost: 1.2 },
  gearing: {
    nitro: [{ n: 1, up: [999, 999], down: [999, 999], launchMu: 1.0, g1Boost: 1.0, fade: 12, dip: 0, pb: true }, { n: 2, up: [14, 999], down: [12, 999], launchMu: 1.7, g1Boost: 1.35, dip: 0.12 }, { n: 3, up: [12.5, 21], down: [10.5, 18.5], launchMu: 2.2, g1Boost: 1.65, dip: 0.12 }],
    electric: { launchMu: 2.0, fade: 10, dip: 0 },
  },
  steering: { max: 20, rate: 0.33, returnRate: 0.2, speedLock: 22, minLock: 0.3 },
  tyres: { grip: 1.4, sideGrip: 1.05, baseGrip: 0.82, frontGrip: 1, rearGrip: 1, frontSideGrip: 1, rearSideGrip: 1, sideGripCap: 1.15, sideStiffness: 0.9, frictionCircle: true, bodyGrip: 0.35 },
  stability: { groundDamp: 0.985, airDamp: 0.995, antiRoll: 0.8, wheelieDamp: 0.988, airPitchDamp: 1, articulationMax: 0.32, articulationRate: 3.5, hillGrip: 4, hillAssist: 110, wheelieBarDeg: 30 },
  resistance: { rolling: 1.2, drag: 0.0006 },
  damage: { cabResist: 1 },
  launch: { pitchCapDeg: null, squat: 0, spinRef: 1 },
  drivetrain: { frontBias: 0.5, diffFront: 0, diffCentre: 0, diffRear: 0 },
  cabSpring: [{ style: 'single', wt: 1.5, wr: 1.8, ze: 0.42, roll: 1.35, scale: 1.0 }, { style: 'twin', wt: 1.8, wr: 2.1, ze: 0.7, roll: 1.25, scale: 1.0 }, { style: 'single', wt: 2.0, wr: 2.2, ze: 0.8, roll: 1.2, scale: 1.45 }, { style: 'single', wt: 2.2, wr: 2.4, ze: 0.95, roll: 1.1, scale: 1.8 }],
};
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
function merge(base, over) { const o = { ...base }; for (const k in over) { if (k.startsWith('_')) continue; o[k] = isObj(base[k]) && isObj(over[k]) ? merge(base[k], over[k]) : over[k]; } return o; }
let P = merge(DEFAULTS, {});
/** truck id: ?truck=<id> or the menu's saved choice, default 'eighthmt' */
export function truckId() { let id = new URLSearchParams(location.search).get('truck'); if (!id) { try { id = localStorage.getItem('mts_truck'); } catch (e) {} } return id === 'eightmt' ? 'eighthmt' : id || 'eighthmt'; } // 'eightmt' was the id before the spelling fix: old saved choices and URLs still work
/** per-truck localStorage key: eighthmt keeps the original key (existing saves), other trucks get a ':<id>' suffix */
export function tkey(k, id = truckId()) { return id === 'eighthmt' ? k : k + ':' + id; }
/** selectable trucks (folder names in assets/trucks) */
export const TRUCKS = [['eighthmt', 'EighthMT · 1:8 monster truck'], ['sixthtrophy', 'SixthTrophy · 1:6 trophy truck']];
export async function loadProfile(id = truckId()) {
  const r = await fetch(`./assets/trucks/${id}/truck.json`); if (!r.ok) throw new Error('truck profile not found: ' + id);
  P = merge(DEFAULTS, await r.json()); P.id = id; P.dir = `./assets/trucks/${id}/`; return P;
}
export const profile = () => P;
