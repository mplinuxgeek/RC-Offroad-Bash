import * as THREE from 'three';

// Sprung-body motion: the original truck is one rigid chassis (7 spheres, no wheel travel) with the cab shell attached by a spring joint (iSpringCreate in the exe,
// params 0.3/0.3/0.15/0.02) plus a second spring for the antenna. The susp* meshes are the shocks/links drawn between chassis and cab.
// The exact spring solver was not recovered; this is a tuned damped spring model of the same arrangement (cab lags chassis acceleration).
const V = THREE.Vector3, Q = THREE.Quaternion;
export class CabSpring {
  constructor() { this.o = new V(); this.ov = new V(); this.r = new V(); this.rv = new V(); this.ant = new V(); this.antv = new V(); this.prevV = null; this.prevW = null; this.tilt = new Q(); }
  reset() { this.o.set(0, 0, 0); this.ov.set(0, 0, 0); this.r.set(0, 0, 0); this.rv.set(0, 0, 0); this.ant.set(0, 0, 0); this.antv.set(0, 0, 0); this.prevV = null; this.prevW = null; this.fa = null; this.fal = null; }
  update(truck, dt) {
    if (dt <= 0) return; const qi = truck.q.clone().invert();
    const v = truck.v.clone(), w = truck.w.clone();
    if (!this.prevV) { this.prevV = v.clone(); this.prevW = w.clone(); }
    const a = v.clone().sub(this.prevV).divideScalar(dt).applyQuaternion(qi), al = w.clone().sub(this.prevW).divideScalar(dt).applyQuaternion(qi);
    this.prevV.copy(v); this.prevW.copy(w);
    for (const k of ['x', 'y', 'z']) { const am = k === 'y' ? 200 : 60; a[k] = Math.max(-am, Math.min(am, a[k])); al[k] = Math.max(-80, Math.min(80, al[k])); }
    // Contact impulses make single-frame acceleration spikes that would drive the shell straight into its stops; low-pass them so the shell reacts to sustained load only.
    if (!this.fa) { this.fa = a.clone(); this.fal = al.clone(); }
    const lp = 1 - Math.exp(-dt / 0.06); this.fa.lerp(a, lp); this.fal.lerp(al, lp); a.copy(this.fa); al.copy(this.fal);
    const step = (x, xv, f, om, ze, lim) => { xv += (f - om * om * x - 2 * ze * om * xv) * dt; x += xv * dt; if (Math.abs(x) > lim) { x = Math.sign(x) * lim; xv *= -0.3; } return [x, xv]; };
    const tn = this.tune || { wt: 1.8, wr: 2.1, ze: 0.7, roll: 1.25 }, wt = 2 * Math.PI * tn.wt, wr = 2 * Math.PI * tn.wr; // softer springs: more travel, slower recovery
    for (const k of ['x', 'y', 'z']) { [this.o[k], this.ov[k]] = step(this.o[k], this.ov[k], -a[k] * 0.9, wt, tn.ze, k === 'y' ? 0.24 : 0.14); }
    // rotation (small angles about chassis x=pitch, y=yaw, z=roll): lateral/longitudinal accel tips the cab about its mount
    [this.r.z, this.rv.z] = step(this.r.z, this.rv.z, a.x * tn.roll - al.z * 0.8, wr, tn.ze + 0.1, 0.3);
    [this.r.x, this.rv.x] = step(this.r.x, this.rv.x, -a.z * 1.0 - al.x * 0.9, wr, tn.ze + 0.1, 0.28);
    [this.r.y, this.rv.y] = step(this.r.y, this.rv.y, -al.y * 0.25, wr, 0.5, 0.1);
    // antenna: whips opposite to acceleration
    for (const [k, s] of [['x', -0.05], ['z', -0.05]]) { [this.ant[k], this.antv[k]] = step(this.ant[k], this.antv[k], a[k] * s, 2 * Math.PI * 3.2, 0.06, 0.6); }
  }
  /** cab transform in chassis space about pivot (0,0.6,0) */
  matrix(out = new THREE.Matrix4()) {
    const pv = new V(0, 0.75, 0), q = new Q().setFromEuler(new THREE.Euler(this.r.x, this.r.y, this.r.z, 'XYZ'));
    const pos = this.o.clone().add(pv).sub(pv.clone().applyQuaternion(q)); return out.compose(pos, q, new V(1, 1, 1));
  }
}

export function setShockStyle() {}
