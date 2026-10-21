// Truck physics modelled on the original engine (found by decompiling the exe):
//  * ONE rigid body with 7 collision spheres (4 wheels r=0.608 density 1.0, 3 body spheres density 0.3), mass_i = r^3 * density * 4.18879
//  * no spring suspension; contacts are impulse based; exe says tyre mu=1.1/1.5, replays show ~1.4 g longitudinal / ~1.7 g lateral grip (fitted to replay lateral accelerations), body spheres mu=1.01
//  * g = 9.80665, fixed step 1/75 s
//  * body angular momentum about the forward (z) axis is damped x0.8 every step while upright (anti-roll)
//  * steering +-20 deg, input ramps: steer 0.33 s (return 0.2 s); throttle +-15 units: 0.35 s up / 0.75 s reverse (return 0.1 s); handbrake ramp 3 s
// Drive/engine curve (top speed ~27.7 m/s, ~0.58/s approach) is fitted to the original replays; contact constants are tuned.
import * as THREE from 'three';
import { DT, G } from './physics.js';
import { loadProfile, profile } from './trucks.js';
const V = THREE.Vector3, Q = THREE.Quaternion, M3 = THREE.Matrix3;
export const G0 = 9.80665;
const GRAV = G0 * 1.25; // a 1:8 model looks floaty under real g, so fall and jump arcs run on stronger gravity (spring rate is scaled with it so ride height is unchanged)
let SPH = null;
/** load the truck profile (assets/trucks/<id>/truck.json, see trucks.js) and its collision spheres */
export async function loadTruckSpheres(data) { const P = await loadProfile(); SPH = data || await (await fetch(P.dir + P.spheres)).json(); return SPH; }

export class MonsterTruck {
  constructor(grid) {
    if (!SPH) throw new Error('call loadTruckSpheres() first');
    this.grid = grid; this.rigid = true;
    // mass model: the original gave ~80% of the mass to the wheels (solid spheres). Real monster trucks carry ~20-30% in the tyres, so wheels are lightened and the body/chassis
    // (engine, frame, body) made heavier: COM rises ~0.2 m, unsprung mass drops. Total ~4.1 t. (accelerations are commanded per unit mass, so only distribution matters, not total weight)
    const P = this.P = profile(), PS = P.suspension;
    this.massWheel = P.mass.wheel; this.massBody = P.mass.body;
    // the sphere list is collision geometry (cab-high); the real mass (plates, drivetrain, engine, battery) sits lower, near the chassis rails
    this.massDrop = P.mass.drop;
    // wheel suspension: spring/damper along the ground normal at each wheel contact. sag0 = static compression, travel = extra stroke before a hard bump-stop.
    this.susp = true; this.sag0 = PS.sag; this.travel = PS.travel; this.arb = PS.antiRoll; this.suspZB = PS.bound; this.suspZR = PS.rebound; this.suspK = PS.springRate;
    this.mask = 0; this._build(SPH.spheres, true);
    this.p = new V(); this.q = new Q(); this.v = new V(); this.w = new V();
    this.antiRoll = P.stability.antiRoll; this.circle = P.tyres.frictionCircle; this.circleDrive = P.tyres.circleDrive ?? 1; this.substeps = 3; this.ver = 13; this.thrEff = 0; this.steer = 0; this.thr = 0; this.hand = 0; this.input = { throttle: 0, brake: 0, steer: 0, hand: 0 };
    this.wheels = [0, 1, 2, 3].map(() => ({ len: 0, contact: false, spin: 0, force: 0, nrm: new V(0, 1, 0) }));
    this.drive = { cap: 99, k: P.drive.accel, vmax: P.drive.topSpeed }; this.crashImpact = 0; this.impact = new Array(7).fill(0); this.t = 0; this.tmp = []; this.loads = [1, 1, 1, 1];
    // original wheel model (FUN_00425500 + contact solver): per-wheel spin, torque->spin, 10%/step spin decay (min brake 0.1), spin coupled to ground by friction
    this.hillMu = P.stability.hillGrip; this.hillAssist = P.stability.hillAssist; this.artMax = P.stability.articulationMax; this.artRate = P.stability.articulationRate; this.barDeg = P.stability.wheelieBarDeg ?? 30; this.wheelieDamp = P.stability.wheelieDamp; this.brk = 0; this.brakeAccel = P.drive.brakeNitro[1]; this.brakeMu = P.drive.brakeGripBoost; this.airCtl = P.air.throttlePitch; this.airBrk = P.air.brakePitch; this.gear = 1; this.shiftT = 0; this.gearMu = 1; this.gears = { up: [12.5, 21], down: [10.5, 18.5], launchMu: 2.2, g1Boost: 1.65, dip: 0.12 };
    this.wm = { on: false, brake: 0.1, gain: 4, inertia: 6 }; this.omega = [0, 0, 0, 0];
  }
  /** 12 = original 1.2 handling (15-unit throttle, handbrake), 13 = 1.3 (25-unit throttle with launch boost, no handbrake) */
  setVersion(v) { this.ver = v; this.drive = v === 12 ? { cap: 12, k: 0.65, vmax: 28.2 } : { cap: 99, k: this.P.drive.accel, vmax: this.P.drive.topSpeed }; }
  /** (Re)build mass, COM and inertia from a sphere list (7 spheres; first 4 are wheels). */
  _build(list, fresh = false) {
    const old = this.sp, lostBefore = (m) => m;
    this.sp = list.map((s, i) => ({ p: new V(...s.p), r: s.r, m: s.r ** 3 * s.density * ((i < 4 && s.r > 0.3) ? this.massWheel : this.massBody) * 4.18879, wheel: i < 4 && s.r > 0.3, mu: i < 4 ? this.P.tyres.grip : this.P.tyres.bodyGrip, muS: i < 4 ? this.P.tyres.sideGrip : this.P.tyres.bodyGrip, front: s.p[2] > 0 }));
    for (const s of this.sp) { s.p0 = s.p.clone(); s.mp = s.wheel ? s.p.clone() : s.p.clone().add(new V(0, -this.massDrop, this.P.mass.bodyZ)); }
    if (!this.phi) this.phi = [0, 0];
    this.M = this.sp.reduce((a, s) => a + s.m, 0);
    const c = new V(); for (const s of this.sp) c.addScaledVector(s.mp, s.m / this.M); this.com = c;
    const I = new M3().set(0, 0, 0, 0, 0, 0, 0, 0, 0), e = I.elements; e.fill(0);
    for (const s of this.sp) {
      const d = s.mp.clone().sub(c), d2 = d.lengthSq(), k = 0.4 * s.r * s.r * s.m, a = [d.x, d.y, d.z];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) e[j * 3 + i] += s.m * ((i === j ? d2 : 0) - a[i] * a[j]) + (i === j ? k : 0);
    }
    this.Ibody = I; this.IbodyInv = I.clone().invert();
  }
  /** Swap to the original's lost-wheel collision hull (bit i set = wheel i lost); keeps the COM where it was in the world. */
  setMask(mask) {
    if (mask === this.mask || !SPH.variants) return; const comW = this.comWorld(), v = this.v.clone(), w = this.w.clone();
    this.mask = mask; this._build(SPH.variants[mask]); this.p.copy(comW).sub(this.com.clone().applyQuaternion(this.q)); this.v.copy(v); this.w.copy(w);
  }
  get speed() { return this.v.length(); }
  forwardSpeed() { return this.v.dot(new V(0, 0, 1).applyQuaternion(this.q)); }
  localToWorld(l, out = new V()) { return out.copy(l).applyQuaternion(this.q).add(this.p); }
  comWorld(out = new V()) { return out.copy(this.com).applyQuaternion(this.q).add(this.p); }
  wheelLocal(i) { return this.sp[i].p; }
  place(pos, headingDeg) { this.q.setFromAxisAngle(new V(0, 1, 0), headingDeg * Math.PI / 180); this.p.set(...pos).sub(this.com.clone().applyQuaternion(this.q)); this.v.set(0, 0, 0); this.w.set(0, 0, 0); this.steer = 0; this.thr = 0; this.hand = 0; this.thrEff = 0; }
  setPose(a) { this.q.set(a[3], a[4], a[5], a[6]); this.p.set(a[0], a[1], a[2]).sub(this.com.clone().applyQuaternion(this.q)); }
  _invIw() { const R = new M3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.q)); const Rt = R.clone().transpose(); return R.clone().multiply(this.IbodyInv).multiply(Rt); }
  _Iw() { const R = new M3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.q)); return R.clone().multiply(this.Ibody).multiply(R.clone().transpose()); }

  _updateInput(dt) {
    const i = this.input, lerp = (x, t, T) => x + (t - x) * Math.min(1, dt / T);
    // steering: key held -> target +-20deg in 0.33 s; released -> 0 in 0.2 s
    const spd = this.v.length(), lock = 1 / (1 + (spd / this.P.steering.speedLock) ** 2); // steering angle shrinks with speed (full lock at 20 m/s would just roll the truck)
    // steering authority drops to zero in the air and returns over steering.landRecover seconds after touchdown, so landing with the stick held does not bite the front tyres at full angle
    const rec = this.P.steering.landRecover; this._sa = !rec ? 1 : this._air > 0.1 ? 0 : Math.min(1, (this._sa ?? 1) + dt / rec);
    // grip-limited lock (steering.latG, in g): the front tyres cannot turn the truck harder than they grip, so more lock only pushes the nose wide, loads up the rear and spins the tail under throttle
    const wb = this.wheelbase ?? (this.wheelbase = (() => { const w = this.sp.filter((s) => s.wheel), z = w.map((s) => s.p.z); return Math.max(...z) - Math.min(...z); })()), latG = this.P.steering.latG;
    const lat = latG ? Math.atan(latG * 9.81 * wb / Math.max(1, spd * spd)) * 180 / Math.PI : 1e9;
    this.steer = i.steer ? lerp(this.steer, this._sa * i.steer * Math.min(lat, (this.steerMax ?? this.P.steering.max) * (this.P.steering.minLock + (1 - this.P.steering.minLock) * lock)), this.steerRate ?? this.P.steering.rate) : lerp(this.steer, 0, this.P.steering.returnRate);
    if (rec && this._sa === 0) this.steer *= Math.pow(0.8, dt * 75); // wheels centre quickly in the air so they touch down straight
    const t = i.throttle - i.brake; // +1 forward, -1 reverse
    if (this.ver === 12) {
      this.thr = t > 0 ? lerp(this.thr, 15, 0.35) : t < 0 ? lerp(this.thr, -15, 0.75) : lerp(this.thr, 0, 0.1);
      this.hand = i.hand ? lerp(this.hand, 1, 3.0) : 0; this.thrEff = this.thr; return;
    }
    // v1.3: Up -> 25 (0.35 s), Ctrl (soft) -> 15 (0.35 s), Down -> -15 (0.75 s), release -> 0 (0.2 s); no handbrake.
    // While Up is held the effective throttle is boosted at low speed: 6x at 0 km/h fading linearly to 1x at 50 km/h (FUN_0040ea20).
    // analogue: throttle/brake amounts (0..1) scale the targets; braking while rolling forward uses a dedicated, much stronger brake force
    const fs0 = this.v.dot(new V(0, 0, 1).applyQuaternion(this.q)), braking = i.brake > 0.02 && fs0 > 0.7, full = i.throttle > 0.02 && !i.brake;
    // throttle-lift transient for tyres.brakeTurnIn: tracks the throttle with a short decay, so lifting off leaves a brief positive gap (_lift) that fades over ~0.35 s
    this._tp = Math.max(i.throttle, (this._tp || 0) - dt / 0.35); this._lift = Math.max(0, this._tp - i.throttle) * (fs0 > 2 ? 1 : 0);
    this.brk = braking ? lerp(this.brk || 0, i.brake, 0.06) : lerp(this.brk || 0, 0, 0.05); if (this.brk < 0.005) this.brk = 0;
    this.thr = full ? lerp(this.thr, 25 * Math.min(1, i.throttle), 0.35) : i.soft && !i.brake ? lerp(this.thr, 15 * Math.max(i.throttle, 1), 0.35) : braking ? lerp(this.thr, 0, 0.08) : i.brake > 0.02 ? lerp(this.thr, -15 * Math.min(1, i.brake), 0.75) : lerp(this.thr, 0, 0.2);
    this.hand = 0;
    if (full && this.boost !== false) { const lb = this.P.drive.launchBoost, kb = this.P.drive.launchBoostKmh, kmh = this.v.length() * 3.6, x = Math.min(kb, Math.max(-1, kmh)), f = lb + (1 - lb) * (x + 1) / (kb + 1); this.thrEff = this.thr * (1 + (f - 1) * Math.min(1, i.throttle) ** 2); } else this.thrEff = this.thr; // part throttle gets proportionally less launch boost
  }
  /** 3-speed gearbox: 1st = punchy launch (extra traction hook-up, can lift the nose), short torque dip at each shift */
  _gearbox(dt) {
    const fwd = new V(0, 0, 1).applyQuaternion(this.q), fs = this.v.dot(fwd), G = this.gears, a = Math.abs(fs);
    if (this.shiftT > 0) this.shiftT -= dt;
    if (fs < -0.5 && this.input.brake > 0 && !this.input.throttle) { this.gear = 0; this.gearMu = 1; return; } // reverse
    if (this.gear === 0) this.gear = 1;
    if (this.gear === 1 && a > G.up[0]) { this.gear = 2; this.shiftT = G.dip; } else if (this.gear === 2 && a > G.up[1]) { this.gear = 3; this.shiftT = G.dip; }
    else if (this.gear === 3 && a < G.down[1]) { this.gear = 2; this.shiftT = G.dip * 0.5; } else if (this.gear === 2 && a < G.down[0]) { this.gear = 1; }
    // launch hook-up: full in 1st below ~4 m/s, fading to normal by the 1st->2nd shift point
    this.gearMu = this.gear === 1 && !this.wm.on ? 1 + (G.launchMu - 1) * Math.max(0, Math.min(1, ((G.fade ?? G.up[0]) - a) / ((G.fade ?? G.up[0]) - 3.5))) : 1;
    if (this.brk > 0.01) this.gearMu = Math.max(this.gearMu, 1 + (this.brakeMu - 1) * Math.min(1, this.brk * 2));
    if (this.gear === 1 && this.thrEff > 0 && !this.wm.on) this.thrEff *= 1 + (G.g1Boost - 1) * Math.min(1, this.input.throttle) ** 2 * Math.max(0, Math.min(1, ((G.fade ?? G.up[0]) - a) / ((G.fade ?? G.up[0]) - 4)));
    if (this.wheelieCut && this.thrEff > 0 && fwd.y > 0.3) this.thrEff *= 1 - this.wheelieCut * Math.min(1, (fwd.y - 0.3) / 0.4); // traction control (centre diff)
    if (this.flipK > 0 && this.thrEff > 0 && fwd.y > 0.05) { const pr = -this.w.dot(new V(1, 0, 0).applyQuaternion(this.q)); if (pr > (this.prFree ?? 0.8)) this.thrEff *= 1 - (this.prCut ?? 0.9) * Math.min(1, (pr - (this.prFree ?? 0.8)) / 1.2); } // pitch-rate traction control: power backs off while the nose is rising fast, so a launch wheelie climbs instead of snapping over
    if (G.pb && this.thrEff > 0) this.thrEff *= (a < 8 ? 0.7 + 0.3 * a / 8 : 1) * (1 - 0.22 * Math.max(0, Math.min(1, (a - 16) / 12))); // single-speed: narrow powerband
    if (this.shiftT > 0) this.thrEff *= 0.35;
    // grip: upgrades + tyre ballooning (unbelted tyres lose grip at speed); drivetrain overload can snap a shaft
    const bal = 1 - 0.18 * (this.balloon ?? 0) * Math.max(0, Math.min(1, (a - 14) / 14)), gm = (this.gripMul ?? this.P.tyres.baseGrip) * bal, PT = this.P.tyres;
    // 4WD power bleed: frontBias (0..1) shifts drive grip between axles; diff* (0 open .. 1 locked) trade steering bite for traction. Approximation: the solver has no per-wheel torque.
    const DT = this.P.drivetrain, bias = ((DT.frontBias ?? 0.5) - 0.5) * 0.8, lc = DT.diffCentre || 0;
    for (const s of this.sp) if (s.wheel) { const lk = s.front ? (DT.diffFront || 0) : (DT.diffRear || 0), ax = (s.front ? 1 + bias : 1 - bias) * (1 + 0.06 * (lk + lc) / 2); s.mu = PT.grip * gm * (s.front ? PT.frontGrip : PT.rearGrip) * ax; s.muS = PT.sideGrip * Math.min(PT.sideGripCap, 0.5 + 0.5 * gm / PT.baseGrip) * (s.front ? PT.frontSideGrip : PT.rearSideGrip) * (1 - 0.1 * lk - 0.04 * lc) * (PT.brakeTurnIn ? 1 + PT.brakeTurnIn * Math.min(1, this.brk + (PT.liftTurnIn ?? 0.25) * (this._lift || 0)) * (s.front ? 1 : -0.6) : 1); } // sideways grip saturates: better tyres add bite, not unlimited cornering force (tip limit ~1.5 g)
    if (this.snapT > 0) { this.snapT -= dt; this.thrEff = 0; }
    else if (this.deficit > 0 && this.thrEff > 8 && (this.launchHit ? false : true) && a < 4 && this.wheels.some((w) => w.contact)) { this.launchHit = true; if (Math.random() < Math.min(0.35, 0.1 * this.deficit)) { this.snapT = 5; this.snapped = true; } }
    if (a > 8) this.launchHit = false;
  }
  /** live axles: each axle rolls about its centre (forward axis) so both wheels stay planted; driven by the difference in ground penetration of the two wheels */
  _articulate(h) {
    if (!this.artMax) return; const q = this.q;
    for (let ax = 0; ax < 2; ax++) {
      const iA = ax * 2, iB = ax * 2 + 1, L = this.sp[iA].p0.x > this.sp[iB].p0.x ? iA : iB, R = L === iA ? iB : iA, sL = this.sp[L], sR = this.sp[R];
      if (sL.dead || sR.dead) { continue; }
      const depth = (s) => { const l = this.tmp; l.length = 0; this.grid.sphere(this.localToWorld(s.p), s.r + (this.susp ? this.sag0 : 0), l); let d = 0; for (const k of l) d = Math.max(d, k.depth); return d; };
      const dL = depth(sL), dR = depth(sR); let phi = this.phi[ax];
      if ((dL > 0.002 || dR > 0.002) && Math.min(dL, dR) < 0.004) { const half = Math.abs(sL.p0.x) || 1.2; phi += Math.max(-this.artRate * h, Math.min(this.artRate * h, (dL - dR) / half * 0.4)); } // depth is measured on the sag-inflated sphere; the axle only rolls while one wheel has lost the ground, so with both planted the springs alone level the body (equalising compression would leave the body stuck leaning)
      else phi -= phi * Math.min(1, 2.5 * h);
      phi = Math.max(-this.artMax, Math.min(this.artMax, phi)); this.phi[ax] = phi;
      const c = Math.cos(phi), s = Math.sin(phi);
      for (const w of [sL, sR]) { const x = w.p0.x, y = w.p0.y - sL.p0.y; w.p.set(x * c - y * s, sL.p0.y + x * s + y * c, w.p0.z); }
    }
  }
  /** extra traction on steep slopes (hill-climb): lets the wheels bite when the surface normal tilts well away from vertical */
  _hill(c) { if (!c.s.wheel || !this.hillMu) return 1; return 1 + this.hillMu * Math.max(0, Math.min(1, (0.92 - c.n.y) / 0.5)) * Math.min(1, Math.abs(this.thrEff) / 8); }
  step(dt) {
    this._updateInput(dt); this._gearbox(dt);
    this.crashImpact = 0; this.impact.fill(0); const SUB = this.substeps || 2, h = dt / SUB;
    for (let s = 0; s < SUB; s++) this._sub(h, dt);
    // anisotropic angular-momentum damping (original: z-axis factor 0.8 per step while upright)
    const up = new V(0, 1, 0).applyQuaternion(this.q);
    const Iw = this._Iw(), L = this.w.clone().applyMatrix3(Iw);
    const R = new M3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(this.q)), Lb = L.clone().applyMatrix3(R.clone().transpose());
    const grounded = this.wheels.some((w) => w.contact);
    // launch squat: with the throttle pinned from a near standstill the rear springs soften and the front stiffen (smoothed), so the rear sits down in the guards
    { const sqT = (this.P.launch.squat || 0) * Math.max(0, this.input.throttle) * (this.gear === 1 ? 1 : 0) * Math.max(0, 1 - Math.abs(this.v.dot(new V(0, 0, 1).applyQuaternion(this.q))) / (this.P.launch.squatMs ?? 8)); this._sq = (this._sq || 0) + (sqT - (this._sq || 0)) * Math.min(1, dt * 6); }
    const sq = this._sq || 0;
    // roll damping: the original's strong anti-roll only helps near level; once the truck is clearly tilted (two-wheel driving) it fades out so gravity wins and the truck comes down
    // quickly instead of hanging on its side wheels. Airborne damping is light (the original's 0.97/step made jumps feel moon-like). Frame-rate independent.
    // sustained cornering/sliding load: the heavy anti-roll damping would hold the truck flat while the tyres are pushing it over, so it fades out as lateral g rises and the tyre grip can tip the truck
    const rgt = new V(1, 0, 0).applyQuaternion(this.q), la = this._pv ? Math.abs(this.v.clone().sub(this._pv).dot(rgt)) / dt : 0; this._pv = this.v.clone(); this._la = (this._la || 0) + (la - (this._la || 0)) * Math.min(1, dt * 12);
    const lo = this.P.stability.rollFadeLo ?? 0.45, latF = Math.max(0, Math.min(1, (this._la / G0 - lo) / ((this.P.stability.rollFadeHi ?? 0.9) - lo)));
    if (up.y > -0.2) { const tilt = Math.abs(Math.asin(Math.max(-1, Math.min(1, new V(1, 0, 0).applyQuaternion(this.q).y)))) * 57.3, fade = Math.max(0, Math.min(1, (32 - tilt) / 18)), f = grounded ? this.P.stability.groundDamp + (this.antiRoll - this.P.stability.groundDamp) * fade * (1 - latF * (this.P.stability.rollFadeK ?? 1)) : this.P.stability.airDamp; Lb.z *= Math.pow(f, dt * 75); }
    // lift-off: the last wheel leaving a lip flicks the body round (rear springs unloading, front already free); shed that pitch rate over the first moments of flight so the truck leaves the jump level and the air controls decide the attitude
    if (!grounded && this._air > 0 && this._air < (this.P.stability.liftoffTime ?? 0.3) && (this.P.stability.liftoffPitchDamp ?? 1) < 1) Lb.x *= Math.pow(this.P.stability.liftoffPitchDamp, dt * 75);
    if (!grounded && (this.P.stability.airYawDamp ?? 1) < 1) Lb.y *= Math.pow(this.P.stability.airYawDamp, dt * 75); // heavy truck: steering-induced yaw fades in the air instead of carrying into a sideways landing
    if (!grounded && this.P.stability.airPitchDamp < 1) Lb.x *= Math.pow(this.P.stability.airPitchDamp, dt * 75); // long wheelbase / big tyres: little rotation in the air
    if (grounded && (this.wheels[0].contact === false && this.wheels[1].contact === false) && (this.wheels[2].contact || this.wheels[3].contact)) Lb.x *= Math.pow(this.wheelieDamp, dt * 75); // front up, rear down: wheelie pitch damping
    if (grounded && new V(0, 0, 1).applyQuaternion(this.q).y > 0.3 && (this.wheels[2].contact || this.wheels[3].contact)) Lb.z *= Math.pow(0.93, dt * 75 * Math.min(1, (new V(0, 0, 1).applyQuaternion(this.q).y - 0.3) / 0.3)); // wheelie roll damping: two rear tyres are a narrow pivot, keep it from drifting onto its side
    // one axle on the ground, the other off it (nose-down on a lip, rear lifted on a ramp crest): a driven axle pushing from one end is yaw-unstable and the slightest asymmetry spins the truck, so damp the yaw rate there
    { const fC = this.wheels[0].contact || this.wheels[1].contact, rC = this.wheels[2].contact || this.wheels[3].contact; if (fC !== rC && (this.P.stability.axleYawDamp ?? 1) < 1) Lb.y *= Math.pow(this.P.stability.axleYawDamp ?? 1, dt * 75); }
    // tumble pitch damping: when tumbling end-over-end (upside down, nose/tail bouncing, or steep pitch rate), damp pitch momentum so contacts bleed energy rather than accelerating the roll
    const onTail = new V(0, 0, 1).applyQuaternion(this.q).y > 0.6 && (this.wheels[2].contact || this.wheels[3].contact), tumbling = (up.y < 0.6 && !onTail) || Math.abs(this.w.x) > 2.5; // a wheelie held near vertical is not a tumble: its pitch must be free to fall back
    if (tumbling && (this.touch || grounded)) {
      const damp = Math.min(1, Math.max(0.75, 0.94 - Math.min(0.12, Math.abs(this.w.x) * 0.02)));
      Lb.x *= Math.pow(damp, dt * 75);
    }
    L.copy(Lb).applyMatrix3(R); this.w.copy(L).applyMatrix3(this._invIw());
    this.t += dt;
  }
  _sub(h, dtFull) {
    const q = this.q, M = this.M, sp = this.sp, up = new V(0, 1, 0).applyQuaternion(q), fwd = new V(0, 0, 1).applyQuaternion(q);
    this._articulate(h);
    const com = this.comWorld(), invIw = this._invIw();
    this.v.y -= GRAV * h;
    { const sp2 = this.v.length(); if (sp2 > 1) this.v.multiplyScalar(1 - this.P.resistance.drag * sp2 * h); } // aerodynamic drag (CdA~5 m^2 on ~4 t)
    const fs = this.v.dot(fwd), thr = this.thrEff / 15;
    // drive acceleration command (fitted): traction limited ~mu*g, approaches ~27.7 m/s
    const D = this.drive, aCmd = this.brk > 0.01 ? -this.brk * Math.min(this.brakeAccel, 9.2) * (1 - 0.7 * Math.max(0, Math.min(1, (-fwd.y - 0.12) / 0.25))) : thr * Math.min(D.cap, D.k * (D.vmax - Math.sign(thr) * fs));
    // coasting: gentle rolling resistance applied at the COM (no pitching), ~1.2 m/s^2 off-throttle while grounded
    if (!this.wm.on && Math.abs(thr) < 0.02 && Math.abs(fs) > 0.05 && this.wheels.some((w) => w.contact)) { const d = Math.min(Math.abs(fs), this.P.resistance.rolling * h); this.v.addScaledVector(fwd, -Math.sign(fs) * d); }
    // air control: throttle pitches the nose up (wheel-spin reaction), brake pitches it down (stopping the spinning wheels/driveline: stronger, ~5 rad/s^2, capped at 3.6 rad/s)
    if (this.airCtl !== 0 && !this.wheels.some((w) => w.contact) && !this.touch) { const pc = (this.input.throttle > 0 ? this.input.throttle : 0) - (this.input.brake > 0 ? this.input.brake : 0); if (pc) { const xa = new V(1, 0, 0).applyQuaternion(q); const PA = this.P.air, ac = pc < 0 ? (this.airBrk ?? PA.brakePitch) : (this.airCtl ?? PA.throttlePitch), cap = pc < 0 ? PA.brakePitchMax : PA.throttlePitchMax; this.w.addScaledVector(xa, -pc * ac * h); const wp = this.w.dot(xa); if (wp * -pc > cap) this.w.addScaledVector(xa, -(wp - Math.sign(wp) * cap)); } }
    // standing-flip assist (big brushless builds): once the nose is up, instant motor torque keeps rotating the truck over backwards
    if (this.flipK > 0 && !(this.rockT > 0) && this.input.throttle > 0.9 && !this.input.brake && fwd.y > 0.55 && up.y > -0.7 && Math.abs(fs) < 20) this.w.addScaledVector(new V(1, 0, 0).applyQuaternion(q), -this.flipK * h * Math.max(0, Math.min(1, (20 - Math.abs(fs)) / 6)) * Math.max(0, Math.min(1, (0.88 - fwd.y) / 0.2)) * Math.max(0, Math.min(1, ((this.flipRate ?? 2.2) + this.w.dot(new V(1, 0, 0).applyQuaternion(q))) / 1.2)));
    if ((this.perchK ?? 3) > 0 && this.input.throttle < 0.1 && fwd.y > 0.85 && up.y > -0.7 && (this.wheels[2].contact || this.wheels[3].contact)) this.w.addScaledVector(new V(1, 0, 0).applyQuaternion(q), (this.perchK ?? 3) * h * Math.min(1, (fwd.y - 0.85) / 0.1)); // released near vertical: tail-balance is unstable on a real truck, so settle nose-down
    // rolling wheelie: a hard punch from a brushless setup lifts the nose up to ~45 mph; above that the tyres hook up and it stays down
    if (this.liftK > 0 && !(this.rockT > 0) && this.input.throttle > 0.9 && !this.input.brake && fwd.y < (this.flipK > 0 ? 0.5 : 0.3) && (this.wheels[2].contact || this.wheels[3].contact)) { const sf = Math.abs(fs); this.w.addScaledVector(new V(1, 0, 0).applyQuaternion(q), -this.liftK * h * Math.max(0, Math.min(1, (sf - 3) / 3)) * Math.max(0, Math.min(1, (26 - sf) / 5))); }
    // standing on the rear bumper: spinning wheels walk the truck off its tail (nose-down torque) unless the build has flip power
    if (fwd.y > 0.88 && !(this.flipK > 0) && Math.abs(this.input.throttle) > 0.3 && this.wheels.some((w) => w.contact)) this.w.addScaledVector(new V(1, 0, 0).applyQuaternion(q), 5 * Math.min(1, (fwd.y - 0.88) / 0.1) * h);
    // soft wheelie limit (power-dependent): a restoring nose-down torque while any wheel is on the ground, so wheelies settle unless the build has flip power
    if (this.wheelieCap != null && fwd.y > this.wheelieCap && this.wheels.some((w) => w.contact)) this.w.addScaledVector(new V(1, 0, 0).applyQuaternion(q), (this.capGain ?? 60) * (fwd.y - this.wheelieCap) * h);
    // wheelie bar: the tail wheels touch down once the nose is up by the bar angle (15, 30 or 45 deg, matching the model); a stiff damped spring stops the pitch there and the truck rides on the bar
    if (this.barDeg > 0 && fwd.y > Math.sin(this.barDeg * Math.PI / 180) && up.y > 0 && (this.wheels[2].contact || this.wheels[3].contact)) { const xa = new V(1, 0, 0).applyQuaternion(q), ex = fwd.y - Math.sin(this.barDeg * Math.PI / 180), pr = -this.w.dot(xa); this.w.addScaledVector(xa, (500 * ex + (pr > 0 ? 40 * pr : 0)) * h); }
    // self-righting attempt: upside down with the wheels spinning, the truck rocks gently side to side and, after a few seconds of held power (sooner with a stronger build),
    // the tyres catch the ground and flip it over once onto its side; the tip assist below then finishes the job. One catch per attempt, then a cooldown.
    if (up.y < -0.3 && this.touch && Math.abs(this.input.throttle - this.input.brake) > 0.3) {
      this.rockT = (this.rockT || 0) + h; const xa = fwd.clone(), pw = Math.min(1.5, 0.55 + 0.35 * (this.drive.k / 0.25)), wr = this.w.dot(xa), ang = Math.min(1, this.rockT / 3);
      const s = Math.sign(wr) || (Math.floor(this.rockT / 1.1) % 2 ? 1 : -1); if (Math.abs(wr) < 1.1 + 0.6 * ang) this.w.addScaledVector(xa, s * (2.5 + 3 * ang) * h);
      if (!this.caught && this.rockT > 4.2 / pw && up.y < -0.6) { this.caught = true; this.w.addScaledVector(xa, (Math.sign(wr) || 1) * (4.2 + 1.2 * pw)); this.v.y += 2.6 + 0.8 * pw; }
      if (this.caught && up.y < -0.6 && this.rockT > 8 / pw) { this.caught = false; this.rockT = 4 / pw; } // failed attempt: try again
    } else if (up.y > 0.55) { this.rockT = 0; this.caught = false; }
    // a truck that has just rocked over onto its side/wheels loses its roll momentum quickly instead of rolling on
    if (this.rockT > 0 && up.y > -0.45 && this.touch && Math.abs(fwd.y) < 0.6) this.w.multiplyScalar(Math.pow(0.9, h * 75));
    // balanced on its side with power on: the wheels bite and tip it the rest of the way onto its wheels
    if (this.rockT > 0 && up.y > -0.3 && up.y < 0.55 && this.touch && Math.abs(fwd.y) < 0.6 && Math.abs(this.input.throttle - this.input.brake) > 0.3) { const ax = new V().crossVectors(up, new V(0, 1, 0)); if (ax.lengthSq() > 1e-4) { ax.normalize(); const al = ax.dot(this.w); if (al < 2.2) this.w.addScaledVector(ax, 26 * h); } }
    // gather contacts
    const cons = [];
    for (let i = 0; i < sp.length; i++) {
      const s = sp[i]; if (s.dead) continue; const c = this.localToWorld(s.p), list = this.tmp;
      const ex = s.wheel && this.susp ? this.sag0 : 0; this.grid.sphere(c, s.r + ex, list);
      // merge near-duplicate normals
      const keep = [];
      for (const k of list.sort((a, b) => b.depth - a.depth)) { if (!keep.some((o) => o.nx * k.nx + o.ny * k.ny + o.nz * k.nz > 0.97)) keep.push(k); if (keep.length >= 4) break; }
      // the bump stop must sit above the tyre centre (stroke < wheel radius), or a hard landing pushes the wheel through the ground
      for (const k of keep) {
        const n = new V(k.nx, k.ny, k.nz), pt = c.clone().addScaledVector(n, -s.r + 0); const r = pt.clone().sub(com);
        cons.push({ i, s, n, pt, r, depth: k.depth - ex - (ex ? Math.min(this.travel, s.r - 0.1) : 0), comp: k.depth, accN: 0, accL: 0, accS: 0, nF: null, nS: null, drive: 0 });
      }
    }
    this.touch = cons.length > 0;
    for (const w of this.wheels) { w.contact = false; w.force = 0; }
    // wheel friction frames + drive impulses (split by previous load)
    const wc = cons.filter((c) => c.s.wheel && c.n.y > -2);
    const loadSum = wc.reduce((a, c) => a + this.loads[c.i], 0) || 1;
    // hill-climb assist: wheels pressed into a steep surface that the truck is facing claw their way up it (the original's wheel spin-up took seconds; here it is immediate)
    if (this.hillAssist && Math.abs(this.thrEff) > 8) { const sgn = Math.sign(this.thrEff), fh = fwd.clone().setY(0).normalize();
      const deep = [0, 0, 0, 0]; for (const c of wc) deep[c.i] = Math.max(deep[c.i], c.comp);
      for (const c of wc) { if (c.comp < deep[c.i] || c.n.y > 0.85 || c.n.y < 0.05) continue; const tu = new V(0, 1, 0).addScaledVector(c.n, -c.n.y).normalize(), th = tu.clone().setY(0); if (th.lengthSq() < 1e-4) continue; th.normalize(); if (th.dot(fh) * sgn < 0.25) continue;
        // fades out on near-vertical faces (a wall is not a hill) and stops adding speed once climbing at 8 m/s, so it cannot keep accelerating the truck up a lip and launch it
        const steep = Math.max(0, Math.min(1, (c.n.y - 0.15) / 0.35)), vu = this.v.dot(tu); if (!steep || vu * sgn > 8) continue;
        { const th2 = fh.clone().multiplyScalar(tu.dot(fh)); tu.set(th2.x, tu.y, th2.z); } // along the heading only: a sideways component of the slope (edge or neighbouring-face contacts) would shove the truck sideways and yaw it
        this.v.addScaledVector(tu, sgn * this.hillAssist * h * (0.85 - c.n.y) / 0.8 * steep * Math.min(1, Math.abs(this.thrEff) / 15) / Math.max(1, wc.length)); } }
    // stability assist (steering.counter): when the tail steps out the front wheels point themselves toward the direction of travel, so a slide is caught instead of snapping round
    let cs = 0; { const cK = this.P.steering.counter; if (cK && up.y > 0.7) { const sp = this.v.length(), vf = this.v.dot(fwd), vl = this.v.dot(new V(1, 0, 0).applyQuaternion(this.q)); if (sp > 3 && vf > 0) cs = Math.max(-12, Math.min(12, -cK * Math.atan2(vl, vf) * 180 / Math.PI)); } }
    const steerRad = (this.steer + cs) * Math.PI / 180;
    for (const c of cons) {
      if (!c.s.wheel) continue;
      let f = fwd.clone(); if (c.s.front) f.applyAxisAngle(up, steerRad);
      const fp = f.clone().addScaledVector(c.n, -f.dot(c.n));
      if (fp.length() < 0.6 || up.y < 0.1) {
        // nose-up on the rear wheels / upside down / on its side: 'forward projected onto the contact plane' degenerates, so use the rolling direction
        // perpendicular to the axle (axle x normal). Its sign follows the truck's heading H = flat(fwd - up) so throttle keeps driving the truck the way it faces.
        const ax = new V(1, 0, 0).applyQuaternion(q); if (c.s.front) ax.applyAxisAngle(up, steerRad);
        let nf = new V().crossVectors(ax, c.n); if (nf.lengthSq() < 1e-6) nf = fp.lengthSq() > 1e-6 ? fp : f.clone(); nf.normalize();
        const Hd = fwd.clone().sub(up); Hd.y = 0; if (Hd.lengthSq() < 0.01) { Hd.copy(fwd); Hd.y = 0; } if (nf.dot(Hd) < 0) nf.negate(); c.nF = nf;
      } else c.nF = fp.normalize();
      c.nS = new V().crossVectors(c.nF, c.n).normalize();
      const tumbleScale = Math.abs(this.w.x) > 2.0 ? Math.max(0, 1 - (Math.abs(this.w.x) - 2.0) / 2.0) : 1;
      c.drive = M * aCmd * h * (this.loads[c.i] / loadSum) * (this.rockT > 0 && up.y < 0.8 ? 0.02 : Math.max(0.02, Math.min(1, (up.y + 0.05) / 0.45))) * tumbleScale; // upside down / on the roof / tumbling fast the wheels don't accelerate the roll
    }
    const rot = (r, d) => new V().crossVectors(r, d);
    const kEff = (c, d) => { const rd = rot(c.r, d); return 1 / (1 / M + rd.clone().dot(rd.clone().applyMatrix3(invIw))); };
    const imp = (c, J) => { this.v.addScaledVector(J, 1 / M); this.w.add(new V().crossVectors(c.r, J).applyMatrix3(invIw)); };
    // the lateral tyre force torques the body about an arm rollLever metres longer than the real contact-to-COM distance (a stand-in for sidewall flex and a higher centre of gravity than the collision spheres give), so enough tyre grip trips the truck over instead of the body staying flat
    const lev = this.P.stability.rollLever || 0, rS = (c) => lev ? c.r.clone().addScaledVector(c.n, -lev) : c.r;
    const kEffS = (c, d) => { const rd = rot(rS(c), d); return 1 / (1 / M + rd.clone().dot(rd.clone().applyMatrix3(invIw))); };
    const impS = (c, J) => { this.v.addScaledVector(J, 1 / M); this.w.add(new V().crossVectors(rS(c), J).applyMatrix3(invIw)); };
    const vel = (c) => new V().crossVectors(this.w, c.r).add(this.v);
    // initial normal speeds for restitution
    for (const c of cons) c.vn0 = vel(c).dot(c.n);
    const WM = this.wm; if (WM.on) {
      const decay = Math.pow(1 - WM.brake, h * 75), dr = this.thrEff * (1 - WM.brake) * WM.gain;
      for (let i = 0; i < 4; i++) { const r = sp[i].r; if (sp[i].dead || !sp[i].wheel) { this.omega[i] = 0; continue; } this.omega[i] = this.omega[i] * decay + dr / (WM.inertia * r * r) * h; }
    }
    // suspension springs (explicit, per substep)
    if (this.susp) { const invT = Math.max(0, Math.min(1, (0.3 - new V(0, 1, 0).applyQuaternion(this.q).y) / 0.6)), ks0 = this.suspK * M * GRAV / 4 / this.sag0 * (1 - this.P.suspension.invertedSoftening * invT), mw = M / 4, crit = 2 * Math.sqrt(ks0 * mw), arbK = this.arb * (1 - invT);
      // upside down the wheels are not carrying the truck: a soft, heavily damped spring (no rebound pumping, no anti-roll coupling) so landings on the tyres/roof don't bounce
      const zb = this.suspZB + (this.P.suspension.invertedBound - this.suspZB) * invT, zr = this.suspZR + (this.P.suspension.invertedRebound - this.suspZR) * invT;
      const cw = [0, 0, 0, 0]; for (const c of cons) if (c.s.wheel) cw[c.i] = Math.max(cw[c.i], c.comp); for (let i = 0; i < 4; i++) this.wheels[i].comp = cw[i];
      // a wheel sphere on a triangle mesh also touches neighbouring faces (edges, vertices): only the deepest contact carries the spring, otherwise several springs stack and the ride goes stiff off the flat plane
      for (const c of cons) if (c.s.wheel && c.comp >= cw[c.i]) { const vn = vel(c).dot(c.n), cd = crit * (vn < 0 ? zb : zr); const ks = ks0 * (1 + (c.i < 2 ? 0.3 : -0.5) * (this._sq || 0)); const F = Math.max(0, ks * c.comp - cd * vn + arbK * ks * (cw[c.i] - cw[c.i ^ 1])); c.accN = F * h; imp(c, c.n.clone().multiplyScalar(c.accN)); }
      // tyre bounce: after a real fall, at the moment the stroke turns round the tyres hop the truck back up (rubber rebound the spring+damper would soak up)
      const wcs = cons.filter((c) => c.s.wheel);
      if (!wcs.length) { this._air = (this._air || 0) + h; this._land = null; if (this.v.y < 0) this._fall = -this.v.y; }
      else {
        if (this._air > 0.12 && this._fall > 1.5) this._land = { vin: this._fall, t: 0, down: false }; this._air = 0;
        const L = this._land; if (L) { L.t += h; const mvn = wcs.reduce((a, c) => a + vel(c).dot(c.n), 0) / wcs.length; if (mvn < -0.3) L.down = true;
          if (L.down && mvn >= 0) { const tr = (this.restitution ?? this.P.suspension.restitution) * (1 - 0.75 * invT), J = 1.6 * tr * Math.min(L.vin, 9) * M / wcs.length; for (const c of wcs) { this.v.addScaledVector(c.n, J / M); c.accN += J; } this._land = null; }
          else if (L.t > 0.6) this._land = null; } } }

    // drive impulses (traction limited later by friction cap); wspin = how far each wheel's demanded drive exceeds grip (0..1), for skid marks/sound
    this.wspin = this.wspin || [0, 0, 0, 0]; for (let i = 0; i < 4; i++) this.wspin[i] *= 0.9;
    for (const c of (WM.on ? [] : wc)) { const cap = c.s.mu * this.gearMu * this._hill(c) * Math.max(this.loads[c.i], M * G0 / 4 * h); const j = Math.max(-cap, Math.min(cap, c.drive)); this.wspin[c.i] = Math.max(this.wspin[c.i], Math.min(1, Math.max(0, Math.abs(c.drive) / (cap * (1 - (1 - (this.P.launch.spinRef || 1)) * Math.max(0, 1 - this.v.length() / 10))) - 1))); imp(c, c.nF.clone().multiplyScalar(j)); }
    const invT2 = Math.max(0, Math.min(1, (0.3 - new V(0, 1, 0).applyQuaternion(this.q).y) / 0.6));
    const ITER = 10;
    for (let it = 0; it < ITER; it++) {
      for (const c of cons) {
        // normal
        if (this.susp && c.s.wheel && c.depth <= 0) { /* sprung: no hard normal constraint inside the stroke */ } else {
        const vn = vel(c).dot(c.n), bias = Math.min(3, 0.25 * Math.max(0, c.depth - 0.004) / h);
        const wheelRest = this.restitution ?? this.P.suspension.restitution;
        const bodyRest = this.restitutionBody ?? this.P.suspension.restitutionBody;
        const rest = c.vn0 < -2.5 ? -(c.s.wheel ? wheelRest * (1 - 0.75 * invT2) : bodyRest - 0.2 * invT2) * c.vn0 : 0; // upside down: landings on the roof/tyres are dead, not bouncy
        let dj = (-vn + Math.max(bias, rest)) * kEff(c, c.n); const nacc = Math.max(0, c.accN + dj); dj = nacc - c.accN; c.accN = nacc;
        imp(c, c.n.clone().multiplyScalar(dj)); }
        const base = c.s.wheel ? Math.min(Math.max(c.accN, this.loads[c.i]), (this.P.stability.impactGripCap ?? 1e9) * M * G0 / 4 * h) : c.accN, cap = c.s.mu * (c.s.wheel ? this.gearMu * this._hill(c) : 1) * base, capS = c.s.muS * base;
        if (c.s.wheel) {
          const hb = c.s.front ? 0 : this.hand;
          const v = vel(c); let dS = -v.dot(c.nS) * kEffS(c, c.nS) * (hb > 0 ? 1 - 0.6 * hb : this.P.tyres.sideStiffness);
          let nS = Math.max(-capS, Math.min(capS, c.accS + dS)); dS = nS - c.accS; c.accS = nS; impS(c, c.nS.clone().multiplyScalar(dS));
          // combined slip: friction circle (long/lat share the grip budget)
          { const ratio = Math.hypot(c.accS / (capS || 1), (c.accL / (cap || 1)) * (c.accL * c.drive > 0 ? this.circleDrive : 1)); if (ratio > 1 && this.circle) { const k = 1 / ratio, dS2 = c.accS * k - c.accS, dL2 = c.accL * k - c.accL; c.accS *= k; c.accL *= k; impS(c, c.nS.clone().multiplyScalar(dS2)); imp(c, c.nF.clone().multiplyScalar(dL2)); } }
          if (WM.on) { const r = c.s.r, vr = vel(c).dot(c.nF); let dL = (this.omega[c.i] * r - vr) * kEff(c, c.nF); const nL = Math.max(-cap, Math.min(cap, c.accL + dL)); dL = nL - c.accL; c.accL = nL; imp(c, c.nF.clone().multiplyScalar(dL)); c.react = (c.react || 0) + dL; }
          if (hb > 0) {
            // handbrake lock / light rolling drag
            const k = hb, dL = -v.dot(c.nF) * kEff(c, c.nF) * k; let nL = Math.max(-cap, Math.min(cap, c.accL + dL)); const d2 = nL - c.accL; c.accL = nL; imp(c, c.nF.clone().multiplyScalar(d2));
          }
        } else {
          // Coulomb friction with the impulse accumulated over the solver iterations and clamped to mu * normal impulse (a per-iteration clamp let ITER x the limit through, so a nose or belly strike gripped like glue instead of skidding)
          const v = vel(c), vt = v.addScaledVector(c.n, -v.dot(c.n)), l = vt.length();
          if (l > 1e-5) { const dir = vt.clone().multiplyScalar(1 / l), acc = c.accT || (c.accT = new V()), nw = acc.clone().addScaledVector(dir, -l * kEff(c, dir)), nl = nw.length(); if (nl > cap) nw.multiplyScalar(cap / nl); imp(c, nw.clone().sub(acc)); acc.copy(nw); }
        }
      }
    }
    if (WM.on) for (const c of cons) if (c.s.wheel && c.react) this.omega[c.i] -= c.react * c.s.r / (WM.inertia * c.s.r * c.s.r);
    // positional correction and bookkeeping
    for (const c of cons) {
      if (c.s.wheel) { const w = this.wheels[c.i]; w.contact = true; w.force = Math.max(w.force, c.accN / h); w.nrm.copy(c.n); this.loads[c.i] = Math.max(c.accN, 1e-3); }
      this.impact[c.i] += c.accN;
      if (c.vn0 < 0) this.crashImpact = Math.max(this.crashImpact, -c.vn0 * (c.s.wheel ? 0.5 : 1));
    }
    for (let i = 0; i < 4; i++) if (!this.wheels[i].contact) this.loads[i] = 1e-3;
    // visual wheel spin: ground-coupled while touching; in the air the wheels spin up with the throttle (and brake) like a real drivetrain
    this.wheels.forEach((w, i) => { const fc = cons.find((c) => c.i === i && c.nF), r = sp[i].r;
      const lr = fc ? Math.min(1, (this.loads[i] || 0) / (M * G0 / 4 * h * 0.6)) : 0; if (fc && lr > 0.99) { w.om = vel(fc).dot(fc.nF) / r; } else if (fc) { const g = vel(fc).dot(fc.nF) / r, fr = (this.input.throttle > 0 ? this.input.throttle : 0) * 55; w.om = g * lr + Math.max(g, fr) * (1 - lr) * 0.9 + fr * (1 - lr) * 0.1; } else { const tgt = (this.input.throttle > 0 ? this.input.throttle : 0) * 55 * Math.sign(this.thrEff || 1); const bk = this.input.brake > 0.2 && !this.input.throttle; w.om = (w.om ?? fs / r) + ((bk ? 0 : tgt) - (w.om ?? 0)) * Math.min(1, (this.input.throttle > 0.02 ? 6 : bk ? 9 : 1.2) * h); }
      w.spin += w.om * h; });
    // integrate
    const c2 = this.comWorld().addScaledVector(this.v, h);
    const wq = new Q(this.w.x * h * 0.5, this.w.y * h * 0.5, this.w.z * h * 0.5, 0).multiply(this.q);
    this.q.set(this.q.x + wq.x, this.q.y + wq.y, this.q.z + wq.z, this.q.w + wq.w).normalize();
    this.p.copy(c2).sub(this.com.clone().applyQuaternion(this.q));
    // gentle aerodynamic drag keeps the truck inside the observed ~27.7 m/s envelope in free fall
    this.v.multiplyScalar(1 - 0.00002);
  }
}

// Backwards compatibility alias
export const TruckRB = MonsterTruck;
