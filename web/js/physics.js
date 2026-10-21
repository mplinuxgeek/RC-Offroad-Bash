import * as THREE from 'three';
export const DT = 1 / 75, G = 9.8;
const V = THREE.Vector3, Q = THREE.Quaternion;

/** Static triangle soup with a uniform xz grid for ray / sphere queries. */
export class TriGrid {
  constructor(cell = 4) { this.cell = cell; this.cells = new Map(); this.t = []; this.smooth = false; this.colliders = []; }
  addCollider(c) {
    if (c) this.colliders.push(c);
  }
  addMesh(verts /* Float32Array stride 8 */, idx) {
    // pass 1: geometric (area-weighted) vertex normals keyed by position, used for smooth contact normals (the mesh's own normals are lighting-oriented)
    const key = (o) => `${verts[o].toFixed(2)},${verts[o + 1].toFixed(2)},${verts[o + 2].toFixed(2)}`, acc = new Map();
    for (let i = 0; i < idx.length; i += 3) {
      const o = [idx[i] * 8, idx[i + 1] * 8, idx[i + 2] * 8];
      const e1 = [verts[o[1]] - verts[o[0]], verts[o[1] + 1] - verts[o[0] + 1], verts[o[1] + 2] - verts[o[0] + 2]], e2 = [verts[o[2]] - verts[o[0]], verts[o[2] + 1] - verts[o[0] + 1], verts[o[2] + 2] - verts[o[0] + 2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
      for (const oo of o) { const k = key(oo); const a = acc.get(k); if (a) { a[0] += n[0]; a[1] += n[1]; a[2] += n[2]; } else acc.set(k, [n[0], n[1], n[2]]); }
    }
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 8, b = idx[i + 1] * 8, c = idx[i + 2] * 8;
      const tri = new Float32Array([verts[a], verts[a + 1], verts[a + 2], verts[b], verts[b + 1], verts[b + 2], verts[c], verts[c + 1], verts[c + 2]]);
      const e1x = tri[3] - tri[0], e1y = tri[4] - tri[1], e1z = tri[5] - tri[2], e2x = tri[6] - tri[0], e2y = tri[7] - tri[1], e2z = tri[8] - tri[2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; const l = Math.hypot(nx, ny, nz);
      if (l < 1e-9) continue; nx /= l; ny /= l; nz /= l;
      const vn = new Float32Array(9); [a, b, c].forEach((o, j) => { const s = acc.get(key(o)), sl = Math.hypot(s[0], s[1], s[2]) || 1; vn[j * 3] = s[0] / sl; vn[j * 3 + 1] = s[1] / sl; vn[j * 3 + 2] = s[2] / sl; });
      const id = this.t.length; this.t.push({ p: tri, n: [nx, ny, nz], vn });
      const x0 = Math.min(tri[0], tri[3], tri[6]), x1 = Math.max(tri[0], tri[3], tri[6]), z0 = Math.min(tri[2], tri[5], tri[8]), z1 = Math.max(tri[2], tri[5], tri[8]);
      for (let ix = Math.floor(x0 / this.cell); ix <= Math.floor(x1 / this.cell); ix++) for (let iz = Math.floor(z0 / this.cell); iz <= Math.floor(z1 / this.cell); iz++) {
        const k = ix * 100003 + iz; let a2 = this.cells.get(k); if (!a2) this.cells.set(k, a2 = []); a2.push(id);
      }
    }
  }
  _gather(x0, z0, x1, z1) {
    const out = new Set(), c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) { const a = this.cells.get(ix * 100003 + iz); if (a) for (const id of a) out.add(id); }
    return out;
  }
  /** Nearest ray hit: returns {t, n:[..]} or null. dir must be unit. */
  ray(o, d, maxT) {
    const ex = o.x + d.x * maxT, ez = o.z + d.z * maxT;
    let best = null;
    for (const id of this._gather(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez))) {
      const T = this.t[id], p = T.p;
      const e1x = p[3] - p[0], e1y = p[4] - p[1], e1z = p[5] - p[2], e2x = p[6] - p[0], e2y = p[7] - p[1], e2z = p[8] - p[2];
      const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
      const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det, tx = o.x - p[0], ty = o.y - p[1], tz = o.z - p[2];
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (d.x * qx + d.y * qy + d.z * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t < 0 || t > maxT) continue;
      if (!best || t < best.t) { const s = (T.n[0] * d.x + T.n[1] * d.y + T.n[2] * d.z) > 0 ? -1 : 1; best = { t, n: [T.n[0] * s, T.n[1] * s, T.n[2] * s] }; }
    }
    return best;
  }
  /** Sphere vs triangles: returns contacts [{nx,ny,nz,depth}] (normal points out of surface toward sphere). */
  sphere(c, r, out) {
    out.length = 0;
    for (const id of this._gather(c.x - r, c.z - r, c.x + r, c.z + r)) {
      const T = this.t[id], p = T.p;
      const cp = closestOnTri(c.x, c.y, c.z, p); const dx = c.x - cp[0], dy = c.y - cp[1], dz = c.z - cp[2], d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      const d = Math.sqrt(d2); let nx, ny, nz;
      if (d > 1e-6) { nx = dx / d; ny = dy / d; nz = dz / d; } else { nx = T.n[0]; ny = T.n[1]; nz = T.n[2]; }
      // prefer face normal when sphere is off the triangle face (avoid edge-ghost normals)
      const fd = dx * T.n[0] + dy * T.n[1] + dz * T.n[2];
      if (Math.abs(fd) > d * 0.99 || d < 1e-6) { const s = fd >= 0 ? 1 : -1; nx = T.n[0] * s; ny = T.n[1] * s; nz = T.n[2] * s; }
      // modern: on a face interior use the barycentric-interpolated vertex normal (removes facet bumps on smooth terrain)
      if (this.smooth && Math.abs(fd) > d * 0.97 && T.vn) {
        const v = T.vn, a0 = T.p, bx = a0[3] - a0[0], by = a0[4] - a0[1], bz = a0[5] - a0[2], cx = a0[6] - a0[0], cy = a0[7] - a0[1], cz = a0[8] - a0[2], qx = cp[0] - a0[0], qy = cp[1] - a0[1], qz = cp[2] - a0[2];
        const d00 = bx * bx + by * by + bz * bz, d01 = bx * cx + by * cy + bz * cz, d11 = cx * cx + cy * cy + cz * cz, d20 = qx * bx + qy * by + qz * bz, d21 = qx * cx + qy * cy + qz * cz, den = d00 * d11 - d01 * d01;
        if (Math.abs(den) > 1e-12) { const u = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den, t0 = 1 - u - w;
          let sx = v[0] * t0 + v[3] * u + v[6] * w, sy = v[1] * t0 + v[4] * u + v[7] * w, sz = v[2] * t0 + v[5] * u + v[8] * w; const sl = Math.hypot(sx, sy, sz);
          if (sl > 1e-6) { sx /= sl; sy /= sl; sz /= sl; const sg = fd >= 0 ? 1 : -1; if (sx * nx * sg + sy * ny * sg + sz * nz * sg > 0.9 && (sx * T.n[0] + sy * T.n[1] + sz * T.n[2]) * sg > 0.85) { nx = sx * sg; ny = sy * sg; nz = sz * sg; } } } }
      out.push({ nx, ny, nz, depth: r - d, px: cp[0], py: cp[1], pz: cp[2] });
    }
    if (this.colliders && this.colliders.length) {
      for (let ci = 0; ci < this.colliders.length; ci++) {
        const col = this.colliders[ci];
        if (col.enabled === false) continue;
        if (col.collideSphere) {
          const hit = col.collideSphere(c, r);
          if (hit) out.push(hit);
        }
      }
    }
    return out;
  }
}
function closestOnTri(px, py, pz, t) { // Ericson, Real-Time Collision Detection
  const ax = t[0], ay = t[1], az = t[2], bx = t[3], by = t[4], bz = t[5], cx = t[6], cy = t[7], cz = t[8];
  const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az, apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [ax, ay, az];
  const bpx = px - bx, bpy = py - by, bpz = pz - bz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [bx, by, bz];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [ax + v * abx, ay + v * aby, az + v * abz]; }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [cx, cy, cz];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [ax + w * acx, ay + w * acy, az + w * acz]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz)]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w];
}
export class CylinderCollider {
  constructor(x, y0, z, radius, height, name = 'cylinder') {
    this.type = 'cylinder';
    this.name = name;
    this.x = x;
    this.y0 = y0;
    this.y1 = y0 + height;
    this.z = z;
    this.r = radius;
    this.h = height;
  }
  collideSphere(c, r) {
    // Clamp sphere y to cylinder segment [y0, y1]
    const cy = Math.max(this.y0, Math.min(this.y1, c.y));
    const dx = c.x - this.x;
    const dz = c.z - this.z;
    const dXZ2 = dx * dx + dz * dz;
    const dXZ = Math.sqrt(dXZ2);
    let px, pz;
    if (dXZ > 1e-6) {
      px = this.x + (dx / dXZ) * Math.min(this.r, dXZ);
      pz = this.z + (dz / dXZ) * Math.min(this.r, dXZ);
    } else {
      px = this.x;
      pz = this.z;
    }
    // If center was strictly inside the cylinder radially, project to surface
    if (dXZ < this.r && c.y >= this.y0 && c.y <= this.y1) {
      if (dXZ > 1e-6) {
        px = this.x + (dx / dXZ) * this.r;
        pz = this.z + (dz / dXZ) * this.r;
      } else {
        px = this.x + this.r;
        pz = this.z;
      }
    }
    const py = cy;
    const sepX = c.x - px;
    const sepY = c.y - py;
    const sepZ = c.z - pz;
    const dist2 = sepX * sepX + sepY * sepY + sepZ * sepZ;
    if (dist2 >= r * r) return null;
    const dist = Math.sqrt(dist2);
    let nx, ny, nz;
    if (dist > 1e-6) {
      nx = sepX / dist;
      ny = sepY / dist;
      nz = sepZ / dist;
    } else {
      // Default outwards radially
      nx = 1; ny = 0; nz = 0;
    }
    return { nx, ny, nz, depth: r - dist, px, py, pz, obj: this };
  }
}

export class BoxCollider {
  constructor(x, y, z, sizeX, sizeY, sizeZ, rotY = 0, name = 'box') {
    this.type = 'box';
    this.name = name;
    this.p = new THREE.Vector3(x, y, z);
    this.half = new THREE.Vector3(sizeX * 0.5, sizeY * 0.5, sizeZ * 0.5);
    this.rotY = rotY;
    this.cos = Math.cos(-rotY);
    this.sin = Math.sin(-rotY);
    this.cosFwd = Math.cos(rotY);
    this.sinFwd = Math.sin(rotY);
  }
  collideSphere(c, r) {
    // Transform sphere center into box local space
    const dx = c.x - this.p.x;
    const dy = c.y - this.p.y;
    const dz = c.z - this.p.z;
    const lx = dx * this.cos - dz * this.sin;
    const ly = dy;
    const lz = dx * this.sin + dz * this.cos;

    // Closest point on box
    const cx = Math.max(-this.half.x, Math.min(this.half.x, lx));
    const cy = Math.max(-this.half.y, Math.min(this.half.y, ly));
    const cz = Math.max(-this.half.z, Math.min(this.half.z, lz));

    let sepX = lx - cx;
    let sepY = ly - cy;
    let sepZ = lz - cz;
    let dist2 = sepX * sepX + sepY * sepY + sepZ * sepZ;

    // If center is strictly inside the box, push to nearest face
    if (dist2 < 1e-9) {
      const pX = this.half.x - Math.abs(lx);
      const pY = this.half.y - Math.abs(ly);
      const pZ = this.half.z - Math.abs(lz);
      if (pX <= pY && pX <= pZ) {
        sepX = Math.sign(lx || 1) * pX;
        dist2 = pX * pX;
      } else if (pY <= pX && pY <= pZ) {
        sepY = Math.sign(ly || 1) * pY;
        dist2 = pY * pY;
      } else {
        sepZ = Math.sign(lz || 1) * pZ;
        dist2 = pZ * pZ;
      }
    }

    if (dist2 >= r * r) return null;
    const dist = Math.sqrt(dist2);
    let lnx, lny, lnz;
    if (dist > 1e-6) {
      lnx = sepX / dist;
      lny = sepY / dist;
      lnz = sepZ / dist;
    } else {
      lnx = 0; lny = 1; lnz = 0;
    }

    // Transform closest point and normal back to world space
    const px = this.p.x + (cx * this.cosFwd - cz * this.sinFwd);
    const py = this.p.y + cy;
    const pz = this.p.z + (cx * this.sinFwd + cz * this.cosFwd);

    const nx = lnx * this.cosFwd - lnz * this.sinFwd;
    const ny = lny;
    const nz = lnx * this.sinFwd + lnz * this.cosFwd;

    return { nx, ny, nz, depth: r - dist, px, py, pz, obj: this };
  }
}

export const TRUCK = {
  mass: 3500, com: new V(0, 0.687, 0), inertia: new V(4800, 5200, 1700), // local principal moments (x pitch, y yaw, z roll)
  radius: 0.6656, mountY: 1.15, lMax: 0.8, k: 31000, c: 5000, mu: 1.35,
  wheels: [ // x,z (local); front wheels (+z) steer
    { x: -1.25, z: 1.28, steer: true }, { x: 1.25, z: 1.28, steer: true }, { x: -1.25, z: -1.18, steer: false }, { x: 1.25, z: -1.18, steer: false } ],
  hull: [ [0.6, 0.75, 1.75], [-0.6, 0.75, 1.75], [0.6, 0.75, -1.65], [-0.6, 0.75, -1.65], [0.6, 1.8, 0.9], [-0.6, 1.8, 0.9], [0.6, 1.8, -0.3], [-0.6, 1.8, -0.3], [0, 1.0, 0], [0.65, 1.2, 1.9], [-0.65, 1.2, 1.9] ],
  hullR: 0.25,
};

export class Truck {
  constructor(grid) {
    this.grid = grid; this.p = new V(); this.q = new Q(); this.v = new V(); this.w = new V();
    this.steer = 0; this.wheels = TRUCK.wheels.map(() => ({ len: 0.5, contact: false, spin: 0, nrm: new V(0, 1, 0), force: 0 }));
    this.input = { throttle: 0, brake: 0, steer: 0, hand: 0 }; this.contacts = []; this.tmp = []; this.crashImpact = 0; this.t = 0;
  }
  /** Place with body origin at (x,y,z), heading degrees about Y. */
  place(pos, headingDeg) { this.q.setFromAxisAngle(new V(0, 1, 0), headingDeg * Math.PI / 180); this.p.set(...pos).sub(TRUCK.com.clone().applyQuaternion(this.q)); this.v.set(0, 0, 0); this.w.set(0, 0, 0); }
  setPose(arr) { this.q.set(arr[3], arr[4], arr[5], arr[6]); this.p.set(arr[0], arr[1], arr[2]).sub(TRUCK.com.clone().applyQuaternion(this.q)); }
  get speed() { return this.v.length(); }
  forwardSpeed() { return this.v.dot(new V(0, 0, 1).applyQuaternion(this.q)); }
  localToWorld(l, out = new V()) { return out.copy(l).applyQuaternion(this.q).add(this.p); }
  comWorld(out = new V()) { return out.copy(TRUCK.com).applyQuaternion(this.q).add(this.p); }
  _invI(rotQ) { // world inverse inertia applied to vector
    return (vec) => { const l = vec.clone().applyQuaternion(rotQ.clone().invert()); l.set(l.x / TRUCK.inertia.x, l.y / TRUCK.inertia.y, l.z / TRUCK.inertia.z); return l.applyQuaternion(rotQ); };
  }
  step(dt) {
    const T = TRUCK, M = T.mass, q = this.q, inp = this.input;
    const invI = this._invI(q); const com = this.comWorld();
    const up = new V(0, 1, 0).applyQuaternion(q), fwd = new V(0, 0, 1).applyQuaternion(q), right = new V(1, 0, 0).applyQuaternion(q);
    const pointVel = (pt) => new V().crossVectors(this.w, new V().subVectors(pt, com)).add(this.v);
    const applyImpulse = (pt, J) => { const r = new V().subVectors(pt, com); this.v.addScaledVector(J, 1 / M); this.w.add(invI(new V().crossVectors(r, J))); };
    const effMass = (pt, dir) => { const r = new V().subVectors(pt, com), rn = new V().crossVectors(r, dir); return 1 / (1 / M + rn.dot(invI(rn))); };
    // gravity
    this.v.y -= G * dt;
    // steering (speed-sensitive)
    const sp = this.speed, maxSteer = 0.55 / (1 + sp * 0.08);
    this.steer += (inp.steer * maxSteer - this.steer) * Math.min(1, dt * 8);
    const fs = this.forwardSpeed();
    // drive command: acceleration per wheel pool
    let aCmd = 0;
    if (inp.throttle > 0) aCmd = inp.throttle * (fs >= -0.5 ? Math.min(12, 0.58 * (27.7 - Math.max(fs, 0))) : 12);
    if (inp.brake > 0) { if (fs > 0.8) aCmd = -inp.brake * 14; else aCmd = -inp.brake * Math.min(7, 0.8 * (11 + fs)); }
    const nContact = [];
    const rayDir = up.clone().negate();
    this.wheels.forEach((wh, i) => {
      const d = T.wheels[i];
      const mount = this.localToWorld(new V(d.x, T.mountY, d.z));
      const maxLen = T.lMax + T.radius;
      let hit = this.grid.ray(mount, rayDir, maxLen);
      // side rays so the tyre width rides over edges
      for (const sx of [-0.3, 0.3]) { const o = mount.clone().addScaledVector(right, sx), h2 = this.grid.ray(o, rayDir, maxLen); if (h2 && (!hit || h2.t < hit.t)) hit = h2; }
      wh.contact = !!hit;
      if (!hit) { wh.len += (T.lMax - wh.len) * Math.min(1, dt * 10); wh.force = 0; wh.spin += (fs / T.radius) * dt; return; }
      const len = Math.max(0, hit.t - T.radius), comp = T.lMax - len, prevLen = wh.len; wh.len = len;
      const contactPt = mount.clone().addScaledVector(rayDir, hit.t);
      const n = new V(...hit.n); wh.nrm.copy(n);
      const pv = pointVel(contactPt); const vn = pv.dot(n), vs = (prevLen - len) / dt; // compression speed along suspension
      let Fn = T.k * comp + T.c * vs; if (len <= 0.02) Fn += 60000 * (0.02 - len); Fn = Math.max(0, Fn);
      wh.force = Fn;
      // suspension force along suspension axis (up)
      applyImpulse(contactPt, up.clone().multiplyScalar(Fn * dt));
      // tyre friction in contact plane
      let fwdW = fwd.clone(); if (d.steer) fwdW.applyAxisAngle(up, this.steer);
      const nF = fwdW.clone().addScaledVector(n, -fwdW.dot(n)).normalize(), nR = new V().crossVectors(n, nF).normalize().negate().multiplyScalar(-1);
      const sideDir = new V().crossVectors(nF, n).normalize(); // lateral direction in plane
      const maxF = T.mu * Fn * dt; // max friction impulse
      nContact.push({ pt: contactPt, nF, sideDir, maxF, wh, i });
    });
    // drive + brake distributed on grounded wheels, then lateral grip
    const loadSum = nContact.reduce((a, c) => a + c.wh.force, 0) || 1;
    for (const c of nContact) {
      let jl = M * (c.wh.force / loadSum) * aCmd * dt; // drive/brake split by wheel load
      const pv = pointVel(c.pt); const vl = pv.dot(c.nF), vs = pv.dot(c.sideDir);
      let jLat = -vs * effMass(c.pt, c.sideDir) * 0.9;
      // rolling resistance
      let jRoll = (aCmd === 0 && !inp.hand) ? -vl * effMass(c.pt, c.nF) * 0.01 : 0;
      if (inp.hand && !TRUCK.wheels[c.i].steer) { jRoll = -vl * effMass(c.pt, c.nF) * 0.6; jLat *= 0.4; }
      let jLong = jl + jRoll;
      const mag = Math.hypot(jLat, jLong); if (mag > c.maxF) { const s = c.maxF / mag; jLat *= s; jLong *= s; }
      applyImpulse(c.pt, c.nF.clone().multiplyScalar(jLong).addScaledVector(c.sideDir, jLat));
      c.wh.spin += (pv.dot(c.nF) / T.radius) * dt;
    }
    // air drag & angular damping
    this.v.multiplyScalar(1 - 0.0012 * sp * dt * 8 / 8 - 0.0); this.w.multiplyScalar(1 - 0.35 * dt);
    // chassis collisions (impulse based)
    this.crashImpact = 0;
    const list = this.tmp;
    const bodyPts = T.hull.map((h) => [this.localToWorld(new V(...h)), T.hullR]);
    this.wheels.forEach((wh, i) => { const d = T.wheels[i]; bodyPts.push([this.localToWorld(new V(d.x, T.mountY - wh.len, d.z)), T.radius * 0.98, true]); });
    for (let iter = 0; iter < 2; iter++) for (const [pt, r, isWheel] of bodyPts) {
      this.grid.sphere(pt, r, list);
      for (const c of list) {
        const n = new V(c.nx, c.ny, c.nz);
        if (isWheel && Math.abs(n.dot(up)) > 0.6) continue; // handled by suspension
        const pv = pointVel(pt), vn = pv.dot(n);
        const m = effMass(pt, n);
        if (vn < 0) {
          const e = vn < -3 ? 0.25 : 0; let j = -(1 + e) * vn * m;
          this.crashImpact = Math.max(this.crashImpact, -vn);
          applyImpulse(pt, n.clone().multiplyScalar(j));
          const vt = pv.clone().addScaledVector(n, -vn); const vtl = vt.length();
          if (vtl > 1e-4) { const jt = Math.min(vtl * m, 0.5 * j); applyImpulse(pt, vt.multiplyScalar(-jt / vtl)); }
        }
        // positional correction
        const push = Math.max(0, c.depth - 0.01) * 0.3; this.p.addScaledVector(n, push);
      }
    }
    // integrate COM, then derive body origin from rotated COM offset
    const c2 = this.comWorld().addScaledVector(this.v, dt);
    const wq = new Q(this.w.x * dt * 0.5, this.w.y * dt * 0.5, this.w.z * dt * 0.5, 0).multiply(this.q);
    this.q.set(this.q.x + wq.x, this.q.y + wq.y, this.q.z + wq.z, this.q.w + wq.w).normalize();
    this.p.copy(c2).sub(T.com.clone().applyQuaternion(this.q));
    this.t += dt;
  }
}
