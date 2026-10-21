import * as THREE from 'three';
import { profile } from './trucks.js';
import { LOWQ, POTATO } from './gfx.js';

// Truck visual built from the user's own 1:8 RC monster truck model (assets/trucks/<id>, made by build_rctruck.py, an asset tool kept outside this repo).
// Rig: S = sprung (chassis + body, moves with the cab spring), AF/AR = live axles (roll with the axle articulation), W0-3 = wheel pivots (steer + axle roll; tyre/rim/disc spin inside),
// struts (links, coil-overs, driveshafts) are re-aimed every frame between an axle point and a sprung point.
const V = THREE.Vector3, M4 = THREE.Matrix4;
export const PAINTS = { ranger: 0xd8261c, comet: 0x2d7be0, nature: 0x4caf50, nitro: 0xe8a21a, safari: 0xb79a6a, spider: 0x8e44ad };
let cache = null;
const rcCache = {};
async function loadRc(lod = 'high') {
  if (!rcCache[lod]) rcCache[lod] = (async () => {
    const dir = profile().dir, model = dir + profile().model;
    let base = model + ({ medium: '_med', low: '_low' }[lod] || ''), res = await fetch(base + '.json');
    if (!res.ok) { base = model; res = await fetch(base + '.json'); } // trucks without detail variants use the full model
    const meta = await res.json(), buf = await (await fetch(base + '.bin')).arrayBuffer(); return { meta, buf };
  })();
  return rcCache[lod];
}
function material(mc, paint) {
  const c = mc.col ? new THREE.Color(mc.col[0] / 255, mc.col[1] / 255, mc.col[2] / 255).convertSRGBToLinear() : new THREE.Color(1, 1, 1);
  const o = { side: THREE.DoubleSide };
  if (LOWQ && (mc.kind === 'lens' || mc.kind === 'lamp')) return new THREE.MeshStandardMaterial({ ...o, color: mc.kind === 'lamp' ? c : 0xffffff, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.6 }); // transmission costs an extra scene pass
  if (POTATO && (mc.kind === 'paint' || mc.kind === 'glass')) return new THREE.MeshStandardMaterial({ ...o, color: mc.kind === 'paint' ? paint : 0x1c2a33, roughness: 0.4, metalness: 0.2, ...(mc.kind === 'glass' ? { transparent: true, opacity: 0.55, depthWrite: false } : {}) });
  switch (mc.kind) {
    case 'paint': return new THREE.MeshPhysicalMaterial({ ...o, color: paint, roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'glass': return new THREE.MeshPhysicalMaterial({ ...o, color: 0x1c2a33, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.55, depthWrite: false });
    case 'rubber': return new THREE.MeshStandardMaterial({ ...o, color: c.multiplyScalar(1.4), roughness: 0.92, metalness: 0 });
    case 'chrome': return new THREE.MeshStandardMaterial({ ...o, color: 0xdfe3ea, roughness: 0.12, metalness: 1 });
    case 'lens': return new THREE.MeshPhysicalMaterial({ ...o, color: 0xffffff, roughness: 0.1, metalness: 0.05, transmission: 0.75, transparent: true, opacity: 0.55, depthWrite: true, ior: 1.5 });
    case 'lamp': return new THREE.MeshPhysicalMaterial({ ...o, color: c, roughness: 0.15, metalness: 0.05, transmission: 0.70, transparent: true, opacity: 0.65, depthWrite: true, ior: 1.5, emissive: c.clone().multiplyScalar(0.2) });
    case 'metal': return new THREE.MeshStandardMaterial({ ...o, color: c, roughness: 0.3, metalness: 0.9 });
    case 'body': return new THREE.MeshStandardMaterial({ ...o, color: c.multiplyScalar(1.6), roughness: 0.55, metalness: 0.1 });
    default: return new THREE.MeshStandardMaterial({ ...o, color: c.multiplyScalar(1.9), roughness: 0.5, metalness: 0.55 });
  }
}
function geom(buf, meta, p) {
  const vb = new Float32Array(buf, p.vOff * 24, p.vCnt * 6), ib = new Uint32Array(buf, meta.vBytes + p.iOff * 4, p.iCnt), g = new THREE.BufferGeometry(), inter = new THREE.InterleavedBuffer(vb, 6);
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(inter, 3, 0)); g.setAttribute('normal', new THREE.InterleavedBufferAttribute(inter, 3, 3)); g.setIndex(new THREE.BufferAttribute(ib, 1)); g.computeBoundingSphere(); return g;
}
/** shock parts keep a fixed length: body-end parts (mode 'B') follow the body anchor, rod-end parts (mode 'A') follow the axle anchor */
function shockMode(name) {
  if (/^shock_/.test(name)) return 'split';
  if (!/_Shock_/.test(name)) return null;
  if (/_(Body|Bladder)$/.test(name)) return 'B';
  if (/_Shaft$/.test(name)) return 'A';
  return null;
}
/** copy of the shaft geometry with its inner end lengthened so it stays hidden inside the body when the shock extends */
function longShaft(g, p) {
  const ax = new V(...p.B).sub(new V(...p.A)), L = ax.length(); ax.divideScalar(L);
  const src = g.getAttribute('position').data.array, vb = new Float32Array(src), A = p.A;
  for (let i = 0; i < vb.length; i += 6) {
    const t = (vb[i] - A[0]) * ax.x + (vb[i + 1] - A[1]) * ax.y + (vb[i + 2] - A[2]) * ax.z;
    if (t > 0.16) { vb[i] += ax.x * 0.25; vb[i + 1] += ax.y * 0.25; vb[i + 2] += ax.z * 0.25; }
  }
  const inter = new THREE.InterleavedBuffer(vb, 6);
  g.setAttribute('position', new THREE.InterleavedBufferAttribute(inter, 3, 0)); g.setAttribute('normal', new THREE.InterleavedBufferAttribute(inter, 3, 3)); g.computeBoundingSphere();
}
/** split a combined shock mount mesh into its axle-end and body-end halves by triangle position along the shock */
function splitShock(g, p) {
  const ax = new V(...p.B).sub(new V(...p.A)), L = ax.length(); ax.divideScalar(L);
  const pos = g.getAttribute('position'), idx = g.index.array, lo = [], hi = [], v = new V();
  const t = i => v.fromBufferAttribute(pos, i).sub(_A.set(...p.A)).dot(ax);
  for (let i = 0; i < idx.length; i += 3) ((t(idx[i]) + t(idx[i + 1]) + t(idx[i + 2])) / 3 > L * 0.45 ? hi : lo).push(idx[i], idx[i + 1], idx[i + 2]);
  const g2 = g.clone(); g.setIndex(lo); g2.setIndex(hi); g2.computeBoundingSphere(); g.computeBoundingSphere();
  return g2;
}
const _A = new V(), _B = new V(), _d0 = new V(), _d1 = new V(), _q = new THREE.Quaternion();
/** matrix mapping rest anchors (A,B) onto the current ones: translate to A', rotate d0->d1, stretch along the strut */
function strutMatrix(out, A, B, A2, B2) {
  _d0.copy(B).sub(A); const l0 = _d0.length() || 1; _d0.divideScalar(l0); _d1.copy(B2).sub(A2); const l1 = _d1.length() || 1; _d1.divideScalar(l1);
  _q.setFromUnitVectors(_d0, _d1); const s = Math.max(0.7, Math.min(1.3, l1 / l0)) - 1; // stretch along the rest axis
  const a = _d0, k = new M4().set(1 + s * a.x * a.x, s * a.x * a.y, s * a.x * a.z, 0, s * a.y * a.x, 1 + s * a.y * a.y, s * a.y * a.z, 0, s * a.z * a.x, s * a.z * a.y, 1 + s * a.z * a.z, 0, 0, 0, 0, 1);
  const pre = new M4().makeTranslation(-A.x, -A.y, -A.z);
  return out.makeTranslation(A2.x, A2.y, A2.z).multiply(new M4().makeRotationFromQuaternion(_q)).multiply(k).multiply(pre);
}
/** rigid version of strutMatrix: rotate to the new axis, pinned at the A anchor, or at the B anchor when atB */
function rigidMatrix(out, A, B, A2, B2, atB) {
  _d0.copy(B).sub(A).normalize(); _d1.copy(B2).sub(A2).normalize(); _q.setFromUnitVectors(_d0, _d1);
  const P = atB ? B : A, P2 = atB ? B2 : A2;
  return out.makeTranslation(P2.x, P2.y, P2.z).multiply(new M4().makeRotationFromQuaternion(_q)).multiply(new M4().makeTranslation(-P.x, -P.y, -P.z));
}
// Sidewall art: text repeated around a 512px canvas that a 0.4-0.62 radius ring maps onto; r is the text radius in canvas px
const TYRE_ART = {
  bkt: { text: 'BKT', color: '#f8fafc', size: 44, r: 190, reps: 2 },
  bigbash: { text: 'BIG BASH', color: '#f8fafc', size: 34, r: 190, reps: 2 },
  dirtdevil: { text: 'DIRT DEVIL', color: '#ef4444', size: 32, r: 190, reps: 2 },
  mayhem: { text: 'MONSTER MAYHEM', color: '#facc15', size: 26, r: 190, reps: 2 },
  stars: { text: '\u2605 \u2605 \u2605', color: '#f8fafc', size: 40, r: 190, reps: 2 },
};
export const TYRE_ART_LIST = [['none', 'No art'], ['bkt', 'BKT'], ['bigbash', 'Big Bash'], ['dirtdevil', 'Dirt Devil'], ['mayhem', 'Monster Mayhem'], ['stars', 'Stars']];

export async function buildRcTruck({ lod = 'high' } = {}) {
  const { meta, buf } = await loadRc(lod), root = new THREE.Group(), body = new THREE.Group(), paintMats = [], stripeMats = [], linkMats = [], springMats = [];
  // Groups of meshes for the 4 suspension tiers:
  // tier 0: 4x basic single spring shock (std body + spring_single + single mounts)
  // tier 1: 4x upgraded dual spring shock (std body + spring + divider + spring2 + single mounts)
  // tier 2: 4x upgraded big bore shock (big bore body + spring_bigbore + single mounts)
  // tier 3: 8x dual shocks (twin coil-overs TwinA + TwinB + dual mounts)
  const tierParts = {
    t0_springSingle: [],
    t1_dualSprings: [],
    std_damper: [],
    bigbore_all: [],
    twin_all: [],
    twin_hidden: [],
    single_mounts: [],
    dual_mounts: []
  };
  body.matrixAutoUpdate = false; root.add(body);
  const axles = [new THREE.Group(), new THREE.Group()]; axles.forEach((a) => root.add(a));
  const wheels = [0, 1, 2, 3].map((i) => { const pivot = new THREE.Group(), spin = new THREE.Group(); pivot.add(spin); root.add(pivot); return { pivot, spin }; });
  const frameOf = { S: body, AF: axles[0], AR: axles[1] }, struts = [], parts = {}, strutRoot = new THREE.Group(); root.add(strutRoot);
  let paint = new THREE.Color(PAINTS.ranger);
  let stripeCol = new THREE.Color(0xffffff);
  let linkCol = new THREE.Color(0x222226);
  let springCol = new THREE.Color(0xf5c714);
  const barMeshes = {}, nitroMeshes = [], electricMeshes = []; let exhaustMesh = null;
  const tireMeshes = [], tireDecals = []; const paintMeshes = [], lensMeshes = [];
  const LIGHTS_ENABLED = false; // lights work is parked; flip to true to bring back the toggles and glow
  const lightMats = []; let lightsOn = false;
  // Soft additive flare sprites, one per lamp (each lamp mesh holds a left and a right lamp, split by the sign of x), hidden until the lights are switched on.
  // Lamp hue picks the light source: reds stay red (tail), oranges and yellows go amber (indicators), anything else keeps its own colour.
  const lampSource = (col) => { const hsl = {}; col.getHSL(hsl); if (hsl.s > 0.25 && (hsl.h < 0.04 || hsl.h > 0.93)) return new THREE.Color(1, 0.04, 0.02); if (hsl.s > 0.25 && hsl.h < 0.17) return new THREE.Color(1, 0.5, 0.03); return col.clone(); };
  // Unit half-sphere facing +z; vertex brightness fades from the pole to the rim so it reads as a soft cone of light.
  const flareDome = (() => { const g = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const v = Math.pow(Math.max(p.getZ(i), 0), 1.5); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; })();
  function addFlare(l, mesh) {
    const pos = mesh.geometry.attributes.position; l.mesh = mesh; l.src = l.lens ? new THREE.Color(1, 0.95, 0.82) : lampSource(l.mat.color); l.flares = [];
    for (const side of [-1, 1]) {
      const bb = new THREE.Box3(); for (let k = 0; k < pos.count; k++) if (Math.sign(pos.getX(k)) === side) bb.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, k));
      if (bb.isEmpty()) continue;
      const ctr = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      const front = ctr.z > 0, d = Math.max(sz.x, sz.y) * (l.lens ? 1.8 : 1.6);
      const sp = new THREE.Mesh(flareDome, new THREE.MeshBasicMaterial({ color: l.src, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
      sp.position.set(ctr.x, ctr.y, front ? bb.max.z : bb.min.z); sp.rotation.y = front ? 0 : Math.PI; sp.scale.set(d * 0.5, d * 0.5, d * 0.35); sp.renderOrder = 10; sp.visible = false; mesh.add(sp); l.flares.push(sp); // half-sphere glow facing out of the housing
    }
  }
  const bodyGroup = new THREE.Group(); body.add(bodyGroup);
  const panels = {}; for (const k of ['shell', 'hood', 'tailgate', 'doorL', 'doorR', 'bumper', 'fenderL', 'fenderR']) { panels[k] = new THREE.Group(); bodyGroup.add(panels[k]); }
  const shell = panels.shell; parts.roof = shell; parts.hood = panels.hood; parts.tailgate = panels.tailgate; parts.doorL = panels.doorL; parts.doorR = panels.doorR; parts.bumper = panels.bumper; parts.fenderL = panels.fenderL; parts.fenderR = panels.fenderR; // whole body shell (paint, glass, stripes, lamps, bumpers, mirrors...) comes off as one piece in a wreck
  for (const p of meta.parts) {
    const isStripe = p.mat && p.mat.kind === 'body' && (
      (p.mat.col && p.mat.col[0] === 237 && p.mat.col[1] === 237 && p.mat.col[2] === 237) ||
      (p.mat.col && p.mat.col[0] === 191 && p.mat.col[1] === 20 && p.mat.col[2] === 20 && (p.name === 'S_doorR' || p.name === 'S_doorL' || (p.name === 'S_shell' && p.panel === 'shell')))
    );
    const isLink = (p.name && (p.name.startsWith('Lower_Link_') || p.name.startsWith('Upper_Link_') || p.name === 'Crossbars')) || (p.mat && p.mat.kind === 'crossbars');
    const isSpring = p.name && (p.name.includes('_Spring') || p.name.includes('Spring_BigBore')); // all spring coils get the spring material & colour
    let mat;
    if (isStripe) {
      mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: stripeCol, roughness: 0.38, metalness: 0.1 });
      stripeMats.push(mat);
    } else if (isLink) {
      mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: linkCol, roughness: 0.42, metalness: 0.4 });
      linkMats.push(mat);
    } else if (isSpring) {
      mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: springCol, roughness: 0.28, metalness: 0.8 });
      springMats.push(mat);
    } else {
      mat = material(p.mat, paint);
      if (p.mat && p.mat.kind === 'paint') paintMats.push(mat);
      if (p.mat && (p.mat.kind === 'lens' || p.mat.kind === 'lamp')) lightMats.push({ mat, base: mat.emissive.clone(), lens: p.mat.kind === 'lens', glow: null });
    }
    const g = geom(buf, meta, p), sm = p.frame === 'strut' && !p.stretch ? shockMode(p.name) : null; if (sm === 'A') longShaft(g, p);
    const g2 = sm === 'split' ? splitShock(g, p) : null; let mesh2 = null; const mesh = new THREE.Mesh(g, mat); mesh.name = p.name; mesh.castShadow = true; mesh.receiveShadow = true;
    if (p.mat && p.mat.kind === 'glass') mesh.castShadow = false;
    if (lightMats.length && lightMats[lightMats.length - 1].mat === mat && !lightMats[lightMats.length - 1].mesh) addFlare(lightMats[lightMats.length - 1], mesh);
    if (/_Tire$/.test(p.name)) tireMeshes.push(mesh);
    if (p.mat && p.mat.kind === 'paint') paintMeshes.push(mesh);
    if (p.mat && p.mat.kind === 'lens') lensMeshes.push(mesh);
    if (p.frame === 'strut') { mesh.matrixAutoUpdate = false; strutRoot.add(mesh); struts.push({ mesh, a: p.a, b: p.b, A: new V(...p.A), B: new V(...p.B), arm: p.arm ? { A: new V(...p.arm.A), B: new V(...p.arm.B) } : null, rigid: sm === 'A' || sm === 'split' ? 'A' : sm === 'B' ? 'B' : null });
      if (g2) { mesh2 = new THREE.Mesh(g2, mat); mesh2.name = p.name; mesh2.castShadow = mesh2.receiveShadow = true; mesh2.matrixAutoUpdate = false; strutRoot.add(mesh2); struts.push({ mesh: mesh2, a: p.a, b: p.b, A: new V(...p.A), B: new V(...p.B), arm: p.arm ? { A: new V(...p.arm.A), B: new V(...p.arm.B) } : null, rigid: 'B' }); } }
    else if (p.frame[0] === 'W') { const w = wheels[+p.frame[1]]; (p.spin ? w.spin : w.pivot).add(mesh); }
    else if (p.panel) panels[p.panel].add(mesh);
    else frameOf[p.frame].add(mesh);

    // Categorize shock parts & mounts
    const nm = p.name || '';
    if (nm.includes('DualMount') || nm.includes('DualBrkt')) {
      tierParts.dual_mounts.push(mesh);
    } else if (nm.includes('Shock_Mount') || nm.includes('Shock_Brkt')) {
      tierParts.single_mounts.push(mesh);
    } else if (nm.includes('BigBore')) {
      tierParts.bigbore_all.push(mesh);
    } else if (nm.includes('TwinA') || nm.includes('TwinB')) {
      // Twin shocks: one single coil per shock (tier 3 only); the dual-rate spring/divider variants stay hidden
      if (/_Spring2?$|_Divider$/.test(nm)) mesh.visible = false, tierParts.twin_hidden.push(mesh);
      else tierParts.twin_all.push(mesh);
    } else if (nm.includes('_Spring_Single')) {
      tierParts.t0_springSingle.push(mesh);
    } else if (nm.includes('_Divider') || (nm.includes('_Spring') && !nm.includes('_Spring_Single'))) {
      tierParts.t1_dualSprings.push(mesh);
    } else if (nm.includes('Shock_') || nm.startsWith('shock_')) {
      tierParts.std_damper.push(mesh);
    }
    if (mesh2) for (const k in tierParts) if (tierParts[k].includes(mesh)) tierParts[k].push(mesh2);
    if (nm.startsWith('Wheelie_Bar_')) barMeshes[nm.slice(12)] = mesh;
    else if (nm.startsWith('Nitro_')) { nitroMeshes.push(mesh); if (nm === 'Nitro_Exhaust') exhaustMesh = mesh; }
    else if (nm.startsWith('Battery_')) electricMeshes.push(mesh);
  }
  // Nitro exhaust tip: centre of the flat outlet disc on the underside of the pipe (its lowest vertices), body-local, as the point source for exhaust smoke; the outlet faces down
  const exhaustTip = new V(), exhaustDir = new V(0, -1, 0); let exhaustPresent = false;
  if (exhaustMesh) {
    const pa = exhaustMesh.geometry.attributes.position; let minY = Infinity;
    for (let i = 0; i < pa.count; i++) minY = Math.min(minY, pa.getY(i));
    let n = 0;
    for (let i = 0; i < pa.count; i++) if (pa.getY(i) < minY + 0.01) { exhaustTip.x += pa.getX(i); exhaustTip.y += pa.getY(i); exhaustTip.z += pa.getZ(i); n++; }
    if (n) { exhaustTip.multiplyScalar(1 / n); exhaustPresent = true; }
  }
  // Wheelie bar: model.bin bakes the 30 degree variant. Other angles re-pose the arms and the wheel pair about the pivot
  // using the generator formula (arm slope and length from the pivot offset to the rear tyre contact point).
  const BAR_S = 0.008, BAR_WA = { 15: 30, 30: 15, 45: 0 }, D2R = Math.PI / 180;
  const barLen = (deg) => { const th = deg * D2R, wa = BAR_WA[deg] * D2R; return (156.2 * Math.cos(th) - 41.5 * Math.sin(th) - 14) / Math.sin(wa + th); };
  let barPivot = null, barWheel0 = null;
  if (barMeshes.Wheels && barMeshes.Arms) {
    barMeshes.Wheels.geometry.computeBoundingBox(); const c = barMeshes.Wheels.geometry.boundingBox.getCenter(new V()), L = barLen(30) * BAR_S, a = BAR_WA[30] * D2R;
    barWheel0 = c; barPivot = new V(c.x, c.y + L * Math.sin(a), c.z + L * Math.cos(a));
  }
  function poseBar(deg) {
    const { Arms, Wheels } = barMeshes;
    if (!barPivot || !(deg in BAR_WA)) return;
    const a0 = BAR_WA[30] * D2R, a1 = BAR_WA[deg] * D2R, k = barLen(deg) / barLen(30);
    const d0 = new V(0, -Math.sin(a0), -Math.cos(a0)), d1 = new V(0, -Math.sin(a1), -Math.cos(a1));
    const tip = new V(barPivot.x, barPivot.y + d1.y * barLen(deg) * BAR_S, barPivot.z + d1.z * barLen(deg) * BAR_S);
    // arms: stretch along the baked arm direction, swing to the new slope, all about the pivot
    const st = new THREE.Matrix4().set(
      1 + (k - 1) * d0.x * d0.x, (k - 1) * d0.x * d0.y, (k - 1) * d0.x * d0.z, 0,
      (k - 1) * d0.y * d0.x, 1 + (k - 1) * d0.y * d0.y, (k - 1) * d0.y * d0.z, 0,
      (k - 1) * d0.z * d0.x, (k - 1) * d0.z * d0.y, 1 + (k - 1) * d0.z * d0.z, 0,
      0, 0, 0, 1);
    const rot = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(d0, d1));
    Arms.matrixAutoUpdate = false;
    Arms.matrix.makeTranslation(barPivot.x, barPivot.y, barPivot.z).multiply(rot).multiply(st).multiply(new THREE.Matrix4().makeTranslation(-barPivot.x, -barPivot.y, -barPivot.z));
    Arms.matrixWorldNeedsUpdate = true;
    Wheels.matrixAutoUpdate = false;
    Wheels.matrix.makeTranslation(tip.x - barWheel0.x, tip.y - barWheel0.y, tip.z - barWheel0.z);
    Wheels.matrixWorldNeedsUpdate = true;
  }
  // antenna stub kept for the shared sync code (an RC truck's whip is drawn only when the cab spring wiggles it)
  const antGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
  const antenna = new THREE.Line(antGeo, new THREE.LineBasicMaterial({ color: 0x111111 })); antenna.visible = false;
  const { CabSpring } = await import('./cab.js'); const cab = new CabSpring();
  const linkage = { group: strutRoot, struts, style: 'rc' };

  function applyShockTier(tier = 0) {
    const t = Math.max(0, Math.min(3, Math.floor(tier)));
    // A truck that ships only the stock single-spring shock (no dual-rate, big-bore or twin meshes) keeps showing it at every tier
    const has = [true, tierParts.t1_dualSprings.length > 0, tierParts.bigbore_all.length > 0, tierParts.twin_all.length > 0];
    const stock = !has[t];
    // Mounts: single mounts for tiers 0, 1, 2; dual mounts for tier 3
    tierParts.single_mounts.forEach((m) => { m.visible = (t < 3 || stock); });
    tierParts.dual_mounts.forEach((m) => { m.visible = (t === 3); });

    // Standard dampers (body, shaft, cap, perch, bladder): active on tiers 0 and 1
    tierParts.std_damper.forEach((m) => { m.visible = (t === 0 || t === 1 || stock); });

    // Tier 0: Single full-length spring
    tierParts.t0_springSingle.forEach((m) => { m.visible = (t === 0 || stock); });

    // Tier 1: Dual-rate tender + main springs + divider collar
    tierParts.t1_dualSprings.forEach((m) => { m.visible = (t === 1); });

    // Tier 2: Big bore shocks (all components)
    tierParts.bigbore_all.forEach((m) => { m.visible = (t === 2); });

    // Tier 3: Twin shocks per corner (TwinA and TwinB, with dual mounts)
    tierParts.twin_all.forEach((m) => { m.visible = (t === 3); });
    tierParts.twin_hidden.forEach((m) => { m.visible = false; });
  }

  // Initialize with stock tier 0
  applyShockTier(0);

  // lazy per-mesh copies so dents never touch the shared model.bin buffer; vertex colours carry the scuffs
  const dmg = new Map(); let dmgBox = null, dmgFront = 1;
  function dmgInit() {
    if (dmgBox) return true;
    if (!paintMeshes.length) return false;
    dmgBox = new THREE.Box3();
    for (const m of paintMeshes) {
      const g = m.geometry, src = g.attributes.position, n = src.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = src.getX(i); arr[i * 3 + 1] = src.getY(i); arr[i * 3 + 2] = src.getZ(i); }
      const pos = new THREE.BufferAttribute(arr, 3), col = new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3);
      g.setAttribute('position', pos); g.setAttribute('color', col); m.material.vertexColors = true; m.material.needsUpdate = true;
      dmg.set(m, { pos, col, orig: arr.slice() }); g.computeBoundingBox(); dmgBox.union(g.boundingBox);
    }
    const lb = new THREE.Box3(); for (const m of lensMeshes) { m.geometry.computeBoundingBox(); lb.union(m.geometry.boundingBox); }
    dmgFront = lensMeshes.length && (lb.min.z + lb.max.z) < (dmgBox.min.z + dmgBox.max.z) ? -1 : 1;
    return true;
  }
  const vis = { rc: true, root, wheels, axles, body, bodyGroup, panels, parts, antenna, cab, linkage, cabParts: [],
    exhaustTip: exhaustPresent ? exhaustTip : null, exhaustDir,
    // Engine, pipe and fuel system meshes: shown on the nitro route only; the battery tray is the electric route's counterpart
    setNitro(on) { for (const m of nitroMeshes) m.visible = !!on; for (const m of electricMeshes) m.visible = !on; },
    // deg: 0 (off) / 15 / 30 / 45; broken hides the whole bar after it snaps off in a crash
    setWheelieBar(deg, broken = false) {
      const on = deg > 0 && !broken;
      for (const k in barMeshes) barMeshes[k].visible = on;
      if (on) poseBar(deg);
    },
    // Clones of the currently posed bar meshes in one Group, for the damage model to throw off as debris
    barDebris() { const g = new THREE.Group(); for (const k in barMeshes) if (barMeshes[k].visible) g.add(barMeshes[k].clone()); return g; },
    setBodyVisible(visible) { bodyGroup.visible = !!visible; },
    isBodyVisible() { return bodyGroup.visible; },
    setBodyColor(color) { paint.set(color); paintMats.forEach((m) => m.color.copy(paint)); },
    setStripeColor(color) { stripeCol.set(color); stripeMats.forEach((m) => m.color.copy(stripeCol)); },
    setLinkColor(color) { linkCol.set(color); linkMats.forEach((m) => m.color.copy(linkCol)); },
    setSpringColor(color) { springCol.set(color); springMats.forEach((m) => m.color.copy(springCol)); },
    // Sidewall lettering: ring decals on both faces of each tyre, drawn on a canvas (the tyre meshes have no UVs)
    setTyreArt(id) {
      for (const d of tireDecals) { d.parent && d.parent.remove(d); d.material.map.dispose(); d.material.dispose(); d.geometry.dispose(); }
      tireDecals.length = 0;
      const art = TYRE_ART[id];
      if (!art) return;
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d'); g.translate(256, 256);
      g.fillStyle = art.color; g.font = 'bold ' + art.size + 'px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let k = 0; k < art.reps; k++) {
        g.save(); g.rotate(k * Math.PI * 2 / art.reps); g.translate(0, -art.r); g.fillText(art.text, 0, 0); g.restore();
      }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      for (const t of tireMeshes) {
        const bb = t.geometry.boundingBox || (t.geometry.computeBoundingBox(), t.geometry.boundingBox);
        const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2, hw = (bb.max.x - bb.min.x) / 2;
        for (const sd of [1, -1]) {
          const m = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.62, 64, 1), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false }));
          m.position.set(cx + sd * (hw + 0.002), cy, cz); m.rotation.y = sd * Math.PI / 2;
          t.parent.add(m); tireDecals.push(m);
        }
      }
    },
    // dents and scuffs: pushes paint vertices inward and darkens them around a point picked on the shell by region
    addBodyDamage(region, depth = 0.01, radius = 0.05) {
      if (!dmgInit()) return;
      const sel = dmgBox, p = new V();
      const fr = dmgFront, pick = () => {
        const u = Math.random(), w = Math.random(), h = Math.random();
        let x = sel.min.x + u * (sel.max.x - sel.min.x), y = sel.min.y + h * (sel.max.y - sel.min.y), z = sel.min.z + w * (sel.max.z - sel.min.z);
        const zf = fr > 0 ? sel.max.z : sel.min.z, zr = fr > 0 ? sel.min.z : sel.max.z;
        if (region === 'front') z = zf + (z - zf) * 0.2; else if (region === 'rear') z = zr + (z - zr) * 0.2;
        else if (region === 'top') y = sel.max.y - (y - sel.min.y) * 0.15; else if (region === 'side') x = Math.random() < 0.5 ? sel.min.x + (x - sel.min.x) * 0.15 : sel.max.x - (sel.max.x - x) * 0.15;
        return p.set(x, y, z);
      };
      const c = pick(), r2 = radius * radius;
      for (const m of paintMeshes) {
        const d = dmg.get(m); if (!d) continue;
        const pos = d.pos, nor = m.geometry.attributes.normal, col = d.col; let hit = false;
        for (let i = 0; i < pos.count; i++) {
          const dx = d.orig[i * 3] - c.x, dy = d.orig[i * 3 + 1] - c.y, dz = d.orig[i * 3 + 2] - c.z, q = dx * dx + dy * dy + dz * dz;
          if (q > r2) continue;
          const f = (1 - q / r2) * (1 - q / r2);
          pos.setXYZ(i, pos.getX(i) - nor.getX(i) * depth * f, pos.getY(i) - nor.getY(i) * depth * f, pos.getZ(i) - nor.getZ(i) * depth * f);
          const k = Math.max(0.3, col.getX(i) - 0.5 * f); col.setXYZ(i, k, k, k); hit = true;
        }
        if (hit) { pos.needsUpdate = true; col.needsUpdate = true; }
      }
    },
    resetBodyDamage() {
      for (const [, d] of dmg) { d.pos.array.set(d.orig); d.col.array.fill(1); d.pos.needsUpdate = true; d.col.needsUpdate = true; }
    },
    // LEDs in the light buckets: headlight lenses glow white, tail lamps red and indicators amber, each with a small flare sprite
    setLights(on) {
      lightsOn = !!on;
      for (const l of lightMats) {
        if (!lightsOn) l.mat.emissive.copy(l.base);
        else if (l.lens) l.mat.emissive.setRGB(1, 0.97, 0.88);
        else l.mat.emissive.copy(l.src || l.mat.color);
        l.mat.emissiveIntensity = lightsOn ? (l.lens ? 3 : 2.5) : 1;
        for (const f of l.flares || []) { f.visible = lightsOn; f.material.opacity = lightsOn ? (l.lens ? 0.7 : 0.6) : 0; }
      }
    },
    isLightsOn() { return lightsOn; },
    setShockTier(tier) { applyShockTier(tier); },
    setDualSprings(show) { applyShockTier(show ? 1 : 0); }, // backwards compatibility
    async setSkin(name) { const c = PAINTS[String(name).replace(/^.*\/|\.jpg$/g, '')] ?? PAINTS.ranger; this.setBodyColor(c); } };
  if (!LIGHTS_ENABLED) { delete vis.setLights; delete vis.isLightsOn; } // callers feature-detect setLights, so the UI hides with it
  return vis;
}
const _m = new M4(), _ax = [new M4(), new M4()], _a1 = new V(), _b1 = new V(), _armA = new V(), _armB = new V(), _armM = new M4();
/** per-frame strut update; axle frames follow truck.phi, sprung frame = body.matrix */
export function updateStruts(vis, truck) {
  const bodyM = vis.body.matrix, y0 = truck.sp[0].p0.y;
  for (let a = 0; a < 2; a++) { const ph = truck.phi ? truck.phi[a] : 0; _ax[a].makeTranslation(0, y0 - (vis.droop ? vis.droop[a] : 0), 0).multiply(new M4().makeRotationZ(ph)).multiply(new M4().makeTranslation(0, -y0, 0)); }
  for (const s of vis.linkage.struts) {
    const am = s.a === 'AF' ? _ax[0] : s.a === 'AR' ? _ax[1] : bodyM, bm = s.b === 'S' ? bodyM : s.b === 'AF' ? _ax[0] : _ax[1];
    _a1.copy(s.A).applyMatrix4(am); _b1.copy(s.B).applyMatrix4(bm);
    // a shock whose bottom sits on its lower arm rides that arm: carry the rest point through the arm's current matrix
    if (s.arm) { _armA.copy(s.arm.A).applyMatrix4(am); _armB.copy(s.arm.B).applyMatrix4(bm); strutMatrix(_armM, s.arm.A, s.arm.B, _armA, _armB); _a1.copy(s.A).applyMatrix4(_armM); } s.rigid ? rigidMatrix(s.mesh.matrix, s.A, s.B, _a1, _b1, s.rigid === 'B') : strutMatrix(s.mesh.matrix, s.A, s.B, _a1, _b1); s.mesh.matrixWorldNeedsUpdate = true;
  }
}
