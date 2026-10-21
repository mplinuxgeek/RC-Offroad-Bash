import * as THREE from 'three';

// Damage model decoded from exe FUN_0040dba0. Each step the peak contact impulse per collision sphere is compared against
// T (= DAT_0048d7a0, 22.5 at default difficulty; 15/22.5/30 selectable). Spheres 0-3 = wheels, 4 = main body, 5/6 = front/rear body.
//  body(4) > T            -> body damage (0x10)
//  front/rear(5,6) > 1.3T -> body damage, plus random wheels lost at >1.5T, 2T, 3T, 4T
//  wheel i > 1.25T        -> wheel i lost, extra random wheels at >1.5T, 2T, 3T; body damage with p=5/6, >1.7T p=3/4(rand 0..3), >2.2T p=1/2, >2.7T always
// After a wheel loss the live threshold drops to 0.75T and recovers at tau 0.5s upward only via respawn (as in the exe).
// Assumption: bit 0x10 is treated here as "body wrecked": cab parts fly off (the original wreck/explosion handling was not decoded).
export const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export class Damage {
  constructor(vis, scene, grid, play, T = 22.5, fx = null) { Object.assign(this, { vis, scene, grid, play, T0: T, fx }); this.debris = []; this.reset(); }
  reset(keepState = false) {
    if (keepState) {
      // Recovery / Right-side up: clear flying debris and restore lost wheels so truck can drive,
      // but preserve missing panels and wrecked state (recover as is).
      for (const d of this.debris) { d.obj.parent?.remove(d.obj); d.restore(); } this.debris.length = 0;
      this.vis.wheels.forEach((w) => (w.pivot.visible = true));
      this.lost = [false, false, false, false];
      this.rollT = 0; this.rollPanels = 0; this.rollCooldown = 0;
      return;
    }
    if (this.vis.resetBodyDamage) this.vis.resetBodyDamage(); this.scuffCd = 0;
    this.T = this.T0; this.Tmin = this.T0; this.lost = [false, false, false, false]; this.wrecked = false; this.gone = {}; this.rollT = 0; this.rollPanels = 0; this.rollCooldown = 0;
    this.limit = { hood: 0.70 + Math.random() * 0.2, tailgate: 0.65 + Math.random() * 0.2, doorL: 0.75 + Math.random() * 0.2, doorR: 0.75 + Math.random() * 0.2, bumper: 0.45 + Math.random() * 0.2, fenderL: 0.6 + Math.random() * 0.2, fenderR: 0.6 + Math.random() * 0.2 }; // fraction of crash threshold (resilient panels)
    for (const d of this.debris) { d.obj.parent?.remove(d.obj); d.restore(); } this.debris.length = 0;
    this.vis.wheels.forEach((w) => (w.pivot.visible = true));
    const bt = this.barTruck; if (bt) { bt.barBroken = false; bt.barDeg = bt.barDeg0 ?? bt.barDeg; this.vis.setWheelieBar?.(bt.barDeg); }
    const bodyOn = this.vis.isBodyVisible ? this.vis.isBodyVisible() : true;
    Object.entries(this.vis.parts).forEach(([k, p]) => (p.visible = !(this.vis.hideParts || []).includes(k)));
    if (this.vis.setBodyVisible) this.vis.setBodyVisible(bodyOn);
  }
  eject(obj, truck, localPos, restore, speed = 6, opts = {}) {
    const wp = truck.localToWorld(localPos), v = truck.v.clone(); this.scene.add(obj);
    // re-centre the debris on its geometry so it tumbles about its own centre, and keep ~26 support points of its hull for ground contact
    obj.updateMatrixWorld(true); const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()); obj.children.forEach((ch) => ch.position.sub(c)); obj.updateMatrixWorld(true);
    const dirs = []; for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) dirs.push(new THREE.Vector3(x, y, z).normalize());
    const best = dirs.map(() => ({ d: -1e9, p: new THREE.Vector3() })), tp = new THREE.Vector3();
    obj.traverse((m) => { if (!m.isMesh) return; const at = m.geometry.attributes.position, st = Math.max(1, Math.floor(at.count / 3000)); for (let i = 0; i < at.count; i += st) { tp.fromBufferAttribute(at, i).applyMatrix4(m.matrixWorld); dirs.forEach((dv, k) => { const dd = tp.dot(dv); if (dd > best[k].d) { best[k].d = dd; best[k].p.copy(tp); } }); } });
    const pts = best.map((b) => b.p), R = Math.max(0.3, ...pts.map((p) => p.length()));
    obj.position.copy(wp).add(c.clone().applyQuaternion(truck.q)); obj.quaternion.copy(truck.q);
    v.add(new THREE.Vector3((Math.random() - 0.5) * speed, 2 + Math.random() * speed * 0.7, (Math.random() - 0.5) * speed));
    // mass as a fraction of the truck (thin shell panels weigh little, tyres and the roof shell more), friction and bounce per material
    const bb = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()), vol = bb.x * bb.y * bb.z, frac = opts.massFrac ?? Math.max(0.004, Math.min(0.04, vol * 2)), m = truck.M * frac;
    this.debris.push({ obj, truck, v, w: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4), restore, t: 0, pts, R, m, I: 0.4 * m * R * R, mu: opts.mu ?? 0.45, e: opts.e ?? 0.3, free: false, still: 0, asleep: false });
  }
  loseWheel(i, truck) {
    if (this.lost[i]) return; this.lost[i] = true; truck.setMask?.(truck.mask | (1 << i)); this.play('break_wheel', 0.9);
    const w = this.vis.wheels[i], g = new THREE.Group(), parent = this.vis.root;
    const m = w.spin; // spin group holds the wheel mesh; move it out as debris
    w.pivot.visible = false; const clone = w.pivot.clone(true); clone.visible = true; clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); g.add(clone);
    this.eject(g, truck, truck.sp[i].p, () => {}, 5, { massFrac: 0.03, mu: 0.9, e: 0.45 });
  }
  /** a body panel (hood, tailgate, door) or the whole shell ('roof') breaks away and tumbles off */
  dropPanel(k, truck, speed = 6) {
    const hasBody = this.vis.isBodyVisible ? this.vis.isBodyVisible() : true;
    if (!hasBody) return false;
    const p = this.vis.parts[k]; if (!p || !p.visible || !p.children.length || this.gone[k]) return false; this.gone[k] = true;
    const c = p.clone(); p.visible = false; const g = new THREE.Group(); g.add(c);
    this.eject(g, truck, new THREE.Vector3(0, 0, 0), () => {}, speed); setTimeout(() => this.play('break_roof', 0.35), 60 + Math.random() * 250); return true;
  }
  /** the wheelie bar snaps off (works with the body off too) and is restored on a full reset */
  breakBar(truck, speed = 6) {
    if (this.gone.bar || !(truck.barDeg > 0) || !this.vis.barDebris) return false; this.gone.bar = true; this.barTruck = truck; truck.barBroken = true;
    const g = this.vis.barDebris(); this.vis.setWheelieBar(truck.barDeg, true); truck.barDeg = 0;
    this.eject(g, truck, new THREE.Vector3(0, 0, 0), () => {}, speed, { massFrac: 0.006, mu: 0.3, e: 0.35 }); this.play('break_roof', 0.5); return true;
  }
  /** a panel that is still on the truck (trucks without that piece have an empty group) */
  hasPanel(k) { const p = this.vis.parts[k]; return !!p && p.visible && p.children.length > 0 && !this.gone[k]; }
  /** panels pop off on hard body hits and during rollovers (before the whole body is wrecked) */
  loosen(truck, dt) {
    const hasBody = this.vis.isBodyVisible ? this.vis.isBodyVisible() : true;
    if (this.wrecked || !hasBody) return;
    const I = truck.impact, up = new THREE.Vector3(0, 1, 0).applyQuaternion(truck.q).y;
    const isRolling = up < 0.65 && truck.touch && truck.speed > 2.0;

    if (this.rollCooldown > 0) this.rollCooldown -= dt;

    if (isRolling) {
      this.rollT += dt;
    } else if (up > 0.7) {
      this.rollT = Math.max(0, this.rollT - dt * 0.6);
      if (this.rollT <= 0.05) this.rollPanels = 0;
    }

    // Rollover panel loss: resilient, max 1 or 2 panels come off across a rollover, not all of them
    if (isRolling && this.rollPanels < 2 && this.rollCooldown <= 0) {
      const rollTrigger = this.rollT > 0.45 + this.rollPanels * 0.55;
      if (rollTrigger && Math.random() < dt * 1.8) {
        const available = ['doorL', 'doorR', 'tailgate', 'hood', 'bumper', 'fenderL', 'fenderR'].filter((k) => this.hasPanel(k));
        if (available.length > 0) {
          const sideX = new THREE.Vector3(1, 0, 0).applyQuaternion(truck.q).y;
          let chosen = available[Math.floor(Math.random() * available.length)];
          const sideK = sideX > 0.3 ? ['doorL', 'fenderL'].find((k) => available.includes(k)) : sideX < -0.3 ? ['doorR', 'fenderR'].find((k) => available.includes(k)) : null;
          if (sideK) chosen = sideK;

          if (this.dropPanel(chosen, truck, 4)) {
            this.rollPanels++;
            this.rollCooldown = 0.85;
          }
        }
      }
    }

    // dents and scuffs on the shell: rollovers scrape roof and sides, hard hits dent the struck end
    this.scuffCd = (this.scuffCd || 0) - dt;
    if (this.vis.addBodyDamage && this.scuffCd <= 0) {
      const sf = (I[5] || 0) / this.T, sr = (I[6] || 0) / this.T, sc = (I[4] || 0) / this.T, big = Math.max(sf, sr, sc);
      if (big > 0.35) { this.vis.addBodyDamage(sf >= sr && sf >= sc ? 'front' : sr >= sc ? 'rear' : 'side', 0.006 + 0.012 * Math.min(2, big), 0.04 + 0.03 * Math.min(2, big)); this.scuffCd = 0.25; }
      else if (isRolling && Math.random() < dt * 6) { this.vis.addBodyDamage(Math.random() < 0.5 ? 'top' : 'side', 0.004, 0.05); this.scuffCd = 0.15; }
    }
    // Direct hard impact panel loss (specific to panel location)
    const sevFront = (I[5] || 0) / this.T, sevRear = (I[6] || 0) / this.T, sevCab = (I[4] || 0) / this.T;
    const sevMap = {
      hood: Math.max(sevFront, (sevCab > 1.4 && sevFront > 0.4) ? sevCab * 0.8 : 0),
      tailgate: Math.max(sevRear, (sevCab > 1.4 && sevRear > 0.4) ? sevCab * 0.8 : 0),
      doorL: sevCab,
      doorR: sevCab,
      bumper: Math.max(sevFront * 1.15, sevCab * 0.6), // the bumper goes first, ahead of the hood
      fenderL: Math.max(sevRear, sevCab * 0.7),
      fenderR: Math.max(sevRear, sevCab * 0.7)
    };

    const candidates = [];
    for (const k of ['bumper', 'hood', 'tailgate', 'fenderL', 'fenderR', 'doorL', 'doorR']) {
      if (!this.hasPanel(k)) continue;
      const excess = sevMap[k] - this.limit[k];
      if (excess > 0) candidates.push({ k, excess, sev: sevMap[k] });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.excess - a.excess);
      const toDrop = candidates[0].sev > 1.6 ? candidates.slice(0, 2) : [candidates[0]];
      for (const c of toDrop) this.dropPanel(c.k, truck, 6 + 6 * Math.min(2, c.sev));
    }
  }
  wreck(truck) {
    if (this.wrecked) return; this.wrecked = true; // body shell comes off; no explosion, fire or smoke (it's an RC truck) and the truck stays drivable
    for (const k of ['roof', 'hood', 'tailgate', 'doorL', 'doorR', 'bumper', 'fenderL', 'fenderR']) this.dropPanel(k, truck, k === 'roof' ? 7 : 9);
  }
  /** returns true when something broke this step */
  check(truck, dt) {
    this.loosen(truck, dt);
    const I = truck.impact, T = this.T, R = () => rnd(0, 3); let broke = false, wr = false; const lose = (i) => { if (!this.lost[i]) { this.loseWheel(i, truck); broke = true; } };
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(truck.q).y;
    const isRolling = up < 0.65 && this.rollT > 0.1;
    const resist = truck.P?.damage?.cabResist ?? 1; // sturdy cab: the bumper, hood and pods break first, the shell still goes in a big rollover
    const bodyWreckThreshold = isRolling ? T * 1.8 * (1 + (resist - 1) * 0.3) : T * resist;
    const hasBody = this.vis.isBodyVisible ? this.vis.isBodyVisible() : true;
    // The bar sits behind the rear bumper: hard rear hits (landing on it, backing into walls) snap it off, with or without the body
    if (I[6] > T * 0.9 && this.breakBar(truck, 5)) broke = true;
    if (hasBody && (!this.wrecked || true)) {
      if (I[4] > bodyWreckThreshold) wr = true;
      else if (I[5] > T * 1.3 * resist) {
        wr = true; const x = I[5];
        if (x > T * 1.5) lose(R()); if (x > T * 2) lose(R()); if (x > T * 3) lose(R()); if (x > T * 4) lose(R());
      } else if (I[6] > T * 1.3 * resist) {
        // Rear bumper hits (e.g. wheelies, landing on rear bumper): drop tailgate, maybe lose rear wheel if extreme, but NEVER wreck hood/cab
        for (const k of ['tailgate', 'fenderL', 'fenderR']) if (this.dropPanel(k, truck, 7)) broke = true;
        const x = I[6];
        if (x > T * 1.8) lose(rnd(2, 3)); // rear wheels only
        if (x > T * 2.5) lose(rnd(2, 3));
      } else for (let i = 0; i < 4; i++) {
        if (this.lost[i] || I[i] <= T * 1.25) continue; const x = I[i]; lose(i);
        if (x > T * 1.5) lose(R()); if (x > T * 2) lose(R()); if (x > T * 3) lose(R());
        if (rnd(0, 5) !== 0) wr = true; if (x > T * 1.7 && rnd(0, 3) !== 0) wr = true; if (x > T * 2.2 && rnd(0, 1) !== 0) wr = true; if (x > T * 2.7) wr = true; break;
      }
    } else if (!hasBody) {
      // Body is off: wheels can still be lost on extreme wheel impact, but no body damage occurs
      for (let i = 0; i < 4; i++) {
        if (this.lost[i] || I[i] <= T * 1.25) continue; const x = I[i]; lose(i);
        if (x > T * 1.5) lose(R()); if (x > T * 2) lose(R()); if (x > T * 3) lose(R()); break;
      }
    }
    if (broke) this.Tmin = this.T0 * 0.75; if (this.T > this.Tmin) this.T += (this.Tmin - this.T) * Math.min(1, dt / 0.5);
    if (wr && !this.wrecked && hasBody) { this.wreck(truck); broke = true; }
    return broke;
  }
  update(dt) {
    if (!this.debris.length || dt <= 0) return;
    const n = Math.min(6, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let k = 0; k < n; k++) for (const d of this.debris) this._stepDebris(d, h);
  }
  /** one rigid body step for a piece of debris: gravity and drag, contacts with the ground mesh and the truck's collision spheres, Coulomb friction */
  _stepDebris(d, h) {
    const tr = d.truck, up = new THREE.Vector3(0, 1, 0), PR = 0.04; d.t += h;
    const A = this._A || (this._A = { r: new THREE.Vector3(), p: new THREE.Vector3(), c: new THREE.Vector3(), nn: new THREE.Vector3(), l: [] });
    if (d.asleep) { // a sleeping piece wakes when the truck touches it
      if (tr.p.distanceToSquared(d.obj.position) > 9) return;
      let hit = false; for (const s of tr.sp) { if (s.dead) continue; tr.localToWorld(s.p, A.c); if (A.c.distanceTo(d.obj.position) < s.r + d.R + 0.05) { hit = true; break; } }
      if (!hit) return; d.asleep = false; d.still = 0;
    }
    const mn = d.m / tr.M;
    d.v.y -= 9.80665 * h;
    const sp = d.v.length(); if (sp > 0.1) d.v.multiplyScalar(Math.max(0, 1 - 0.04 * d.R * d.R * sp / (0.02 + mn) * h)); // air drag: light, wide pieces slow down and flutter
    d.w.multiplyScalar(Math.exp(-0.5 * h));
    d.obj.position.addScaledVector(d.v, h);
    const wl = d.w.length(); if (wl > 1e-5) d.obj.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(d.w.clone().divideScalar(wl), wl * h));
    // contacts: {r (hull point relative to the centre), n, dep, mu, ov (velocity of the surface, truck only), truck flag}
    const cs = []; const com = tr.localToWorld(tr.com, new THREE.Vector3());
    for (const pt of d.pts) {
      const r = pt.clone().applyQuaternion(d.obj.quaternion), p = d.obj.position.clone().add(r);
      A.l.length = 0; this.grid.sphere(p, PR, A.l); let got = false;
      for (const q of A.l) { if (q.depth <= 0) continue; got = true; cs.push({ r, n: new THREE.Vector3(q.nx, q.ny, q.nz), dep: q.depth, mu: 0.6, tk: false }); }
      if (!got) { // fast fall through a face: the downward ray still finds the surface above the point
        const hit = this.grid.ray(new THREE.Vector3(p.x, p.y + 6, p.z), new THREE.Vector3(0, -1, 0), 40);
        if (hit && p.y + 6 - hit.t > p.y - PR) cs.push({ r, n: new THREE.Vector3(hit.n[0], hit.n[1], hit.n[2]), dep: p.y + 6 - hit.t - p.y + PR, mu: 0.6, tk: false });
      }
      if (d.t > 0.12) for (const s of tr.sp) { // truck spheres (wheels and body)
        if (s.dead) continue; tr.localToWorld(s.p, A.c); const dv = p.clone().sub(A.c), dist = dv.length(), rr = s.r + PR; if (dist >= rr) continue;
        const nn = dist > 1e-6 ? dv.multiplyScalar(1 / dist) : up.clone(), cp = A.c.clone().addScaledVector(nn, s.r);
        cs.push({ r, n: nn, dep: rr - dist, mu: s.wheel ? 1.0 : 0.35, tk: true, ov: new THREE.Vector3().crossVectors(tr.w, cp.sub(com)).add(tr.v), rt: cp });
      }
    }
    // a freshly ejected piece starts inside the truck's spheres: truck contacts only count once it has been clear of them
    if (!d.free) { if (!cs.some((c) => c.tk)) d.free = true; else if (d.t < 1.0) { for (let i = cs.length - 1; i >= 0; i--) if (cs[i].tk) cs.splice(i, 1); } else d.free = true; }
    if (!cs.length) { d.still = 0; return; }
    // positional push out along the contact normals
    const push = new THREE.Vector3(); for (const c of cs) push.addScaledVector(c.n, Math.min(c.dep, 0.15));
    const pl = push.length(), mx = Math.max(...cs.map((c) => c.dep)); if (pl > 1e-6) d.obj.position.addScaledVector(push, Math.min(1, mx * 0.8 / pl) );
    for (const c of cs) { c.v0 = new THREE.Vector3().crossVectors(d.w, c.r).add(d.v).sub(c.ov || A.nn.set(0, 0, 0)).dot(c.n); c.aN = 0; c.aT = new THREE.Vector3(); c.rn = new THREE.Vector3().crossVectors(c.r, c.n); }
    const iM = 1 / d.m, iI = 1 / d.I, iT = 1 / tr.M, rel = new THREE.Vector3(), rt = new THREE.Vector3();
    for (let it = 0; it < 6; it++) for (const c of cs) {
      rel.crossVectors(d.w, c.r).add(d.v); if (c.ov) rel.sub(c.ov);
      const vn = rel.dot(c.n), k = iM + c.rn.lengthSq() * iI + (c.tk ? iT : 0);
      const want = c.v0 < -1 ? -d.e * c.v0 : 0, nacc = Math.max(0, c.aN + (want - vn) / k), dj = nacc - c.aN; c.aN = nacc;
      d.v.addScaledVector(c.n, dj * iM); d.w.addScaledVector(c.rn, dj * iI); if (c.tk) tr.v.addScaledVector(c.n, -dj * iT);
      // Coulomb friction: tangential impulse accumulated over the iterations and clamped to mu * normal impulse
      rel.crossVectors(d.w, c.r).add(d.v); if (c.ov) rel.sub(c.ov); rel.addScaledVector(c.n, -rel.dot(c.n)); const vt = rel.length();
      if (vt > 1e-6) { const t = rel.clone().multiplyScalar(1 / vt); rt.crossVectors(c.r, t); const kt = iM + rt.lengthSq() * iI + (c.tk ? iT : 0), mu = Math.sqrt(d.mu * c.mu), nw = c.aT.clone().addScaledVector(t, -vt / kt), nl = nw.length(); if (nl > mu * c.aN) nw.multiplyScalar(mu * c.aN / (nl || 1)); const dT = nw.clone().sub(c.aT); c.aT.copy(nw);
        d.v.addScaledVector(dT, iM); d.w.addScaledVector(rt.crossVectors(c.r, dT), iI); if (c.tk) tr.v.addScaledVector(dT, -iT); }
    }
    d.w.multiplyScalar(Math.exp(-2.5 * h)); // tumbling energy is lost in every contact
    if (d.v.lengthSq() < 0.01 && d.w.lengthSq() < 0.04) { if ((d.still += h) > 0.3) { d.v.set(0, 0, 0); d.w.set(0, 0, 0); d.asleep = true; } } else d.still = 0;
  }
}
