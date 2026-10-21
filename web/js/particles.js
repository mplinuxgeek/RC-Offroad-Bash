import * as THREE from 'three';

const V = THREE.Vector3;

// Generated particle/skid textures (no image files). Seeded so every load looks the same.
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const blob = (g, x, y, r, stops) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); for (const [o, c] of stops) gr.addColorStop(o, c); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
// smoke/dust: overlapping soft lobes, grey-white so the sprite colour tints it
const smokeTex = () => canvasTex(128, 128, (g, w, h) => { const r = rng(21); for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = r() * 26; blob(g, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 26 + r() * 14, [[0, 'rgba(255,255,255,0.35)'], [0.6, 'rgba(235,235,235,0.14)'], [1, 'rgba(220,220,220,0)']]); } });
// fire: hot white core, yellow-orange body, ragged tongues; drawn additively in game
const flameTex = () => canvasTex(128, 128, (g, w, h) => { const r = rng(5); for (let i = 0; i < 7; i++) { const a = r() * 6.28, d = r() * 18; blob(g, w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d - 6, 24 + r() * 12, [[0, 'rgba(255,255,255,0.5)'], [0.35, 'rgba(255,230,140,0.4)'], [0.7, 'rgba(255,140,40,0.15)'], [1, 'rgba(255,80,0,0)']]); } blob(g, w / 2, h / 2, 20, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,230,160,0)']]); });
// skid mark: u across the tyre, v along it. Soft edges, two faint tread bands, speckled wear; ends stay solid so chained quads join.
const skidTex = () => canvasTex(64, 128, (g, w, h) => { const r = rng(9); const img = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = x / (w - 1) * 2 - 1; let a = Math.min(1, (1 - Math.abs(u)) * 3.5); a *= 0.75 + 0.15 * Math.cos(u * 12) + 0.25 * (r() - 0.5); a = Math.max(0, Math.min(1, a)); const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 12; img.data[i + 3] = a * 255; } g.putImageData(img, 0, 0); });

/** Sprite particles (dust/smoke/flame) + ring-buffer skid marks, using generated textures. */
export class Particles {
  constructor(scene, N = 260, SK = 700) {
    this.scene = scene; this.pool = []; this.next = 0;
    const mats = { smoke: new THREE.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, color: 0xcdbf99 }), flame: new THREE.SpriteMaterial({ map: flameTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xff9030 }) };
    // grass flick: small soft blades/clods, tinted per particle, thrown up and back with gravity
    { const c = document.createElement('canvas'); c.width = 32; c.height = 32; const g = c.getContext('2d'); g.translate(16, 16); g.rotate(-0.6); const gr = g.createRadialGradient(0, 0, 1, 0, 0, 14); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.scale(1, 0.32); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; mats.blade = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, color: 0x6aa83a }); }
    this.mats = mats;
    for (let i = 0; i < N; i++) { const s = new THREE.Sprite(mats.smoke.clone()); s.visible = false; scene.add(s); this.pool.push({ s, v: new V(), life: 0, max: 1, size0: 1, size1: 2, a: 1, kind: 'smoke' }); }
    // skid marks
    this.SK = SK; this.sk = 0; this.last = [null, null, null, null];
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(SK * 12); this.uv = new Float32Array(SK * 8); this.col = new Float32Array(SK * 4); this.idx = new Uint16Array(SK * 6);
    for (let i = 0; i < SK; i++) { this.idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6); this.uv.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2)); g.setIndex(new THREE.BufferAttribute(this.idx, 1));
    this.skMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: skidTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide, opacity: 0.8 }));
    this.skMesh.frustumCulled = false; scene.add(this.skMesh);
  }
  emit(kind, p, v, life, s0, s1, a = 1, col = null) {
    const q = this.pool[this.next]; this.next = (this.next + 1) % this.pool.length;
    q.kind = kind; q.s.material.map = this.mats[kind].map; q.s.material.blending = this.mats[kind].blending; q.s.material.color.copy(this.mats[kind].color); if (col !== null) q.s.material.color.set(col); q.s.material.rotation = kind === 'blade' ? Math.random() * 6.28 : 0;
    q.s.position.copy(p); q.v.copy(v); q.life = q.max = life; q.size0 = s0; q.size1 = s1; q.a = a; q.s.visible = true;
  }
  burst(p, n = 40, flame = true) {
    for (let i = 0; i < n; i++) { const d = new V(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 6); this.emit(flame && i % 2 ? 'flame' : 'smoke', p, d, 0.8 + Math.random() * 1.2, 0.6, 3 + Math.random() * 2, flame && i % 2 ? 0.9 : 0.6); }
  }
  /** Wheel contact. surf: 'dirt' (dust + marks), 'grass' (flicked grass only: no dust, no marks), 'tarmac' (marks only: no dust). */
  wheel(i, contactPt, normal, along, slip, speed, dt, surf = 'dirt') {
    if (surf !== 'grass' && slip > 3.0) {
      const last = this.last[i];
      if (last && last.distanceToSquared(contactPt) > 0.04) this.mark(last, contactPt, normal, along);
      if (!last || last.distanceToSquared(contactPt) > 0.04) this.last[i] = contactPt.clone();
    } else this.last[i] = null;
    if (surf === 'dirt' && speed > 4 && Math.random() < Math.min(1, dt * 30) * Math.min(1, (speed + slip) / 20)) {
      this.emit('smoke', contactPt, new V((Math.random() - 0.5) * 1.2, 0.6 + Math.random(), (Math.random() - 0.5) * 1.2), 0.9 + Math.random() * 0.6, 0.5, 2.2, 0.35 + Math.min(0.3, slip / 20));
    }
    if (surf === 'grass' && speed > 2.5) {
      const n = Math.min(4, dt * 70 * Math.min(1, (speed + slip * 1.5) / 14)), cnt = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0), greens = [0x5f9a32, 0x76b042, 0x4c8528, 0x8aa84a, 0x6b4f2c];
      for (let k = 0; k < cnt; k++) {
        const sp = 1.5 + speed * 0.22 + Math.random() * 2.5, v = new V().copy(along).multiplyScalar(-sp * (0.6 + Math.random() * 0.6)).add(new V((Math.random() - 0.5) * 2.2, 2.2 + Math.random() * 3.2 + speed * 0.08, (Math.random() - 0.5) * 2.2)), pos = contactPt.clone().add(new V((Math.random() - 0.5) * 0.35, 0.08, (Math.random() - 0.5) * 0.35));
        this.emit('blade', pos, v, 0.55 + Math.random() * 0.55, 0.16 + Math.random() * 0.1, 0.12, 0.95, greens[Math.floor(Math.random() * greens.length)]);
      }
    }
  }
  mark(a, b, n, along) {
    const d = b.clone().sub(a); if (d.lengthSq() < 1e-6) return; const side = new V().crossVectors(n, d).normalize().multiplyScalar(0.28), o = n.clone().multiplyScalar(0.03), k = this.sk, p = this.pos;
    const pts = [a.clone().add(side).add(o), a.clone().sub(side).add(o), b.clone().add(side).add(o), b.clone().sub(side).add(o)];
    pts.forEach((v, j) => { p[k * 12 + j * 3] = v.x; p[k * 12 + j * 3 + 1] = v.y; p[k * 12 + j * 3 + 2] = v.z; });
    this.sk = (this.sk + 1) % this.SK; this.skMesh.geometry.attributes.position.needsUpdate = true;
  }
  clearMarks() { this.pos.fill(0); this.skMesh.geometry.attributes.position.needsUpdate = true; this.last.fill(null); }
  update(dt) {
    for (const q of this.pool) {
      if (!q.s.visible) continue; q.life -= dt; if (q.life <= 0) { q.s.visible = false; continue; }
      const t = 1 - q.life / q.max; q.s.position.addScaledVector(q.v, dt); if (q.kind !== 'blade') q.v.multiplyScalar(Math.max(0, 1 - 1.5 * dt)); if (q.kind === 'blade') { q.v.y -= 11 * dt; } else if (q.kind === 'flame') q.v.y += 2 * dt; else q.v.y += 0.4 * dt;
      const sz = q.size0 + (q.size1 - q.size0) * t; q.s.scale.set(sz, sz, 1); q.s.material.opacity = q.kind === 'blade' ? q.a * (t > 0.7 ? (1 - t) / 0.3 : 1) : q.a * (1 - t) * (t < 0.1 ? t * 10 : 1);
    }
  }
}
