import * as THREE from 'three';
import { LOWQ } from './gfx.js';
import { TriGrid, CylinderCollider, BoxCollider } from './physics.js';
// Modular dirt-park kit: module loader, placed-item objects, collision grid, map storage and the random map generator.
// Assets (assets/kit/*) come from the "Low-Poly Dirt Park Modular Kit" (FlunkedPunk, Sketchfab Standard licence): personal/local use only, do not redistribute.
let KIT = null;
/** The map editor and its modular park kit (assets/kit/park_modules.*) are switched off: the kit pieces are third-party and not shipped.
 *  Set to true and put the kit files back to re-enable the editor, user maps and kit pieces. The built-in BMX track is generated and does not need the kit. */
export const KIT_BUILDER = false;
export async function loadKit() {
  if (KIT) return KIT;
  const tl = new THREE.TextureLoader(), meta = KIT_BUILDER ? await (await fetch('./assets/kit/park_modules.json')).json() : { scale: 1, mats: [], modules: [] }, buf = KIT_BUILDER ? await (await fetch('./assets/kit/park_modules.bin')).arrayBuffer() : new ArrayBuffer(0);
  const mats = await Promise.all(meta.mats.map(async (m) => {
    let map = null; if (m.tex) { map = await tl.loadAsync('./assets/kit/' + m.tex); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.flipY = false; map.anisotropy = 8; }
    return new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0xcccccc, roughness: 0.95, metalness: m.name.includes('Metal') ? 0.35 : 0 });
  }));
  const byId = new Map(), geos = new Map();
  for (const m of meta.modules) { byId.set(m.id, m); const parts = m.parts.map((p) => { const g = new THREE.BufferGeometry(), ib = new THREE.InterleavedBuffer(new Float32Array(buf, p.vOff, p.vCnt * 8), 8); g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0)); g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3)); g.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 6)); g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf, p.iOff, p.iCnt), 1)); g.computeBoundingSphere(); return { geo: g, mat: p.mat, v: new Float32Array(buf, p.vOff, p.vCnt * 8), i: new Uint16Array(buf, p.iOff, p.iCnt) }; }); geos.set(m.id, parts); }
  KIT = { meta, mats, byId, geos, modules: meta.modules }; computePorts(KIT);
  // terrain textures (terrain_grass, terrain_dirt, terrain_asphalt and terrain_grass_dirt_mix, made by gen_terrain_tex.py, an asset tool kept outside this repo); ?gs=6&ds=4&ts=4&as=3 set the tiling scales
  const qp = new URLSearchParams(location.search), ld = async (n) => { const t = await tl.loadAsync(`./assets/kit/tex/${n}.jpg`); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  KIT.tgrass = await ld('terrain_grass'); KIT.tdirt = await ld('terrain_dirt');
  KIT.tasph = await ld('terrain_asphalt'); KIT.ttop = await ld('terrain_grass_dirt_mix'); KIT.tscale = +qp.get('ts') || 4; KIT.ascale = +qp.get('as') || 3;
  KIT.gscale = +qp.get('gs') || 6; KIT.dscale = +qp.get('ds') || 4;
  return KIT;
}
// ---------------- ports (open join faces), joining and capping ----------------
// Many pieces are open-ended track sections that butt against each other. A "port" is the set of open (single-triangle) edges lying on one side of a piece's footprint.
const SIDES = [['+x', 1, 0], ['-x', -1, 0], ['+z', 0, 1], ['-z', 0, -1]];
function computePorts(kit) {
  kit.ports = new Map(); const K = (x, y, z) => `${Math.round(x / 0.02)},${Math.round(y / 0.02)},${Math.round(z / 0.02)}`;
  for (const [id, parts] of kit.geos) {
    const lo = [1e9, 1e9], hi = [-1e9, -1e9], E = new Map();
    for (const p of parts) for (let k = 0; k < p.v.length; k += 8) { lo[0] = Math.min(lo[0], p.v[k]); hi[0] = Math.max(hi[0], p.v[k]); lo[1] = Math.min(lo[1], p.v[k + 2]); hi[1] = Math.max(hi[1], p.v[k + 2]); }
    for (const p of parts) for (let t = 0; t < p.i.length; t += 3) for (let c = 0; c < 3; c++) {
      const ia = p.i[t + c] * 8, ib = p.i[t + (c + 1) % 3] * 8, ka = K(p.v[ia], p.v[ia + 1], p.v[ia + 2]), kb = K(p.v[ib], p.v[ib + 1], p.v[ib + 2]); if (ka === kb) continue;
      const ek = ka < kb ? ka + '|' + kb : kb + '|' + ka, e = E.get(ek); if (e) e.n++; else E.set(ek, { n: 1, a: [p.v[ia], p.v[ia + 1], p.v[ia + 2]], b: [p.v[ib], p.v[ib + 1], p.v[ib + 2]], mat: p.mat });
    }
    const ports = [];
    for (const [name, dx, dz] of SIDES) {
      const edges = [...E.values()].filter((e) => e.n === 1 && Math.max(e.a[1], e.b[1]) > 0.1 && [e.a, e.b].every((q) => Math.abs((dx ? q[0] : q[2]) - (dx ? (dx > 0 ? hi[0] : lo[0]) : (dz > 0 ? hi[1] : lo[1]))) < 0.1));
      if (edges.length >= 2) { const c = [0, 0, 0]; for (const e of edges) for (let k = 0; k < 3; k++) c[k] += (e.a[k] + e.b[k]) / (2 * edges.length); ports.push({ name, n: [dx, dz], edges, c }); }
    }
    kit.ports.set(id, ports);
  }
}
const itemMatrix = (it, m4 = new THREE.Matrix4()) => m4.compose(new THREE.Vector3(it.x, it.y || 0, it.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (it.rot || 0) * Math.PI / 180, 0)), new THREE.Vector3(it.sx || 1, it.sy || 1, it.sz || 1));
/** world-space ports of a placed item */
export function worldPorts(kit, it) {
  const m = itemMatrix(it), r = (it.rot || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), v = new THREE.Vector3(), W = (p) => v.set(p[0], p[1], p[2]).applyMatrix4(m).toArray();
  return (kit.ports.get(it.m) || []).map((p) => ({ n: [p.n[0] * c + p.n[1] * sn, -p.n[0] * sn + p.n[1] * c], c: W(p.c), edges: p.edges.map((e) => ({ a: W(e.a), b: W(e.b), mat: e.mat })) }));
}
const TOL = 0.45;
const edgeMatch = (e, f) => { const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); return (d(e.a, f.a) < TOL && d(e.b, f.b) < TOL) || (d(e.a, f.b) < TOL && d(e.b, f.a) < TOL); };
const midKey = (e) => [Math.floor((e.a[0] + e.b[0]) / 2 / 2), Math.floor((e.a[2] + e.b[2]) / 2 / 2)];
/** which open edges of a set of items are closed by a neighbour; returns the unmatched ones (to be capped) */
export function openEdges(kit, items) {
  const all = [], grid = new Map();
  items.forEach((it, i) => { if (!kit.ports.has(it.m)) return; for (const p of worldPorts(kit, it)) for (const e of p.edges) { e.item = i; const [kx, kz] = midKey(e); all.push(e); const k = kx + ',' + kz; (grid.get(k) || grid.set(k, []).get(k)).push(e); } });
  const open = []; let joined = 0;
  for (const e of all) { const [kx, kz] = midKey(e); let hit = false; for (let a = -1; a <= 1 && !hit; a++) for (let b = -1; b <= 1 && !hit; b++) for (const f of grid.get((kx + a) + ',' + (kz + b)) || []) if (f.item !== e.item && edgeMatch(e, f)) { hit = true; break; } if (hit) joined++; else open.push(e); }
  return { open, joined };
}
/** vertical curtains from each open edge down to y=0, as { mat -> [x,y,z,u,v ...quads as 4 verts] } */
export function capTriangles(kit, items) {
  const { open, joined } = openEdges(kit, items), byMat = new Map();
  for (const e of open) { if (e.a[1] < 0.03 && e.b[1] < 0.03) continue; const l = byMat.get(e.mat) || byMat.set(e.mat, []).get(e.mat); l.push(e); }
  return { byMat, openCount: open.length, joined };
}
export function buildCaps(kit, items) {
  const g = new THREE.Group(), { byMat, openCount, joined } = capTriangles(kit, items);
  kit.capMats = kit.capMats || new Map();
  for (const [mat, edges] of byMat) {
    const pos = [], uv = [], idx = []; for (const e of edges) { const b = pos.length / 3, q = [e.a, e.b, [e.b[0], 0, e.b[2]], [e.a[0], 0, e.a[2]]]; for (const p of q) { pos.push(p[0], p[1], p[2]); uv.push((p[0] + p[2]) * 0.25, p[1] * 0.25); } idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    let cm = kit.capMats.get(mat); if (!cm) { cm = kit.mats[mat].clone(); cm.side = THREE.DoubleSide; kit.capMats.set(mat, cm); }
    const m = new THREE.Mesh(geo, cm); m.castShadow = m.receiveShadow = true; m.userData.edges = edges; g.add(m);
  }
  g.userData = { openCount, joined }; return g;
}
const SNAP_DIST = 8;
/** snap a candidate item onto an open port of another item (rotating to face it); returns a new item or null */
export function snapItem(kit, items, skip, cand) {
  const mine = worldPorts(kit, cand); if (!mine.length) return null; let best = null;
  const others = []; items.forEach((it, i) => { if (i !== skip && kit.ports.has(it.m)) others.push(...worldPorts(kit, it)); });
  const ang = (n) => Math.atan2(n[0], n[1]) * 180 / Math.PI;
  for (const q of others) for (const [pi, p] of mine.entries()) {
    const d0 = Math.hypot(p.c[0] - q.c[0], p.c[2] - q.c[2]); if (d0 > SNAP_DIST + 0.5 * Math.max(10, p.edges.length)) continue;
    let delta = ang([-q.n[0], -q.n[1]]) - ang(p.n); delta = ((Math.round(delta / 15) * 15) % 360 + 540) % 360 - 180; const t = { ...cand, rot: (((cand.rot || 0) + delta) % 360 + 360) % 360 };
    const p2 = worldPorts(kit, t)[pi]; t.x += q.c[0] - p2.c[0]; t.z += q.c[2] - p2.c[2]; t.y = (t.y || 0) + q.c[1] - p2.c[1]; if (t.y < -0.01) continue;
    const p3 = worldPorts(kit, t)[pi]; if (Math.abs(p3.edges.length - q.edges.length) > 2) continue;
    let ok = 0; for (const e of p3.edges) if (q.edges.some((f) => edgeMatch(e, f))) ok++; if (ok < 0.7 * Math.max(p3.edges.length, q.edges.length)) continue;
    const cost = d0 + Math.abs(delta) * 0.02; if (!best || cost < best.cost) best = { cost, t };
  }
  return best && best.cost < SNAP_DIST + 4 ? best.t : null;
}
/** three.js object for one module (origin = footprint centre on the ground) */
export function makeModule(kit, id, { shadows = true } = {}) {
  const g = new THREE.Group(); for (const p of kit.geos.get(id)) { const m = new THREE.Mesh(p.geo, kit.mats[p.mat]); m.castShadow = m.receiveShadow = shadows; g.add(m); } return g;
}
export function applyItem(obj, it) { obj.position.set(it.x, it.y || 0, it.z); obj.rotation.set(0, (it.rot || 0) * Math.PI / 180, 0); obj.scale.set(it.sx || 1, it.sy || 1, it.sz || 1); }
/** build collision for a map into a TriGrid: ground tiles + every placed module */
export function buildCollision(kit, map, grid = new TriGrid(4)) {
  const td0 = terrainData(map), bbx = td0 ? td0.bb : null;
  const half = Math.max(map.size || 400, 200) / 2 + 150, T = 60, n = Math.ceil(half * 2 / T), v = [], idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x0 = -half + i * T, z0 = -half + j * T, b = v.length / 8; if (bbx && x0 >= bbx.x0 && x0 + T <= bbx.x1 && z0 >= bbx.z0 && z0 + T <= bbx.z1) continue; for (const [x, z] of [[x0, z0], [x0 + T, z0], [x0, z0 + T], [x0 + T, z0 + T]]) v.push(x, 0, z, 0, 1, 0, 0, 0); idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); if (v.length / 8 > 60000) { grid.addMesh(new Float32Array(v), new Uint16Array(idx)); v.length = 0; idx.length = 0; } }
  if (v.length) grid.addMesh(new Float32Array(v), new Uint16Array(idx));
  const e = new THREE.Euler(), m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
  for (const it of map.items) {
    if (!kit.geos.has(it.m)) continue; q.setFromEuler(e.set(0, (it.rot || 0) * Math.PI / 180, 0)); m4.compose(p.set(it.x, it.y || 0, it.z), q, s.set(it.sx || 1, it.sy || 1, it.sz || 1));
    for (const part of kit.geos.get(it.m)) { const nv = part.v.length / 8, out = new Float32Array(nv * 8); for (let k = 0; k < nv; k++) { t.set(part.v[k * 8], part.v[k * 8 + 1], part.v[k * 8 + 2]).applyMatrix4(m4); out[k * 8] = t.x; out[k * 8 + 1] = t.y; out[k * 8 + 2] = t.z; } grid.addMesh(out, part.i); }
  }
  const td = terrainData(map); if (td) grid.addMesh(td.coll.v8, td.coll.idx);
  const caps = capTriangles(kit, map.items);
  for (const [, edges] of caps.byMat) { const out = [], ix = []; for (const e of edges) { const b = out.length / 8; for (const p of [e.a, e.b, [e.b[0], 0, e.b[2]], [e.a[0], 0, e.a[2]]]) out.push(p[0], p[1], p[2], 0, 1, 0, 0, 0); ix.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2); } grid.addMesh(new Float32Array(out), new Uint16Array(ix)); }

  // Decor objects collision: hay bales (boxes)
  if (td && td.T && td.T.decor) {
    const hs = (x, z) => td.T.heightAt(x, z);
    for (const d of td.T.decor) {
      if (d.t === 'bale') {
        const y = hs(d.x, d.z) + 0.625;
        const rot = d.rot + (d.s % 2 ? 0.05 : -0.04);
        grid.addCollider(new BoxCollider(d.x, y, d.z, 2.5, 1.25, 1.25, rot, 'bale'));
      }
    }
  }

  return grid;
}
/** random equirectangular sky (see assets/sky/sky.json); ?sky=name forces one. Also tints the scene fog to the horizon colour and sets sky.userData.sunDir (world direction to the sun, from the sky image) and sky.userData.light (sun strength). */
export async function buildEquirectSky(scene) {
  const list = await (await fetch('./assets/sky/sky.json')).json(), names = Object.keys(list), forced = new URLSearchParams(location.search).get('sky'), name = names.includes(forced) ? forced : names[Math.floor(Math.random() * names.length)];
  const tex = await new THREE.TextureLoader().loadAsync(`./assets/sky/${name}.jpg`); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }), mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
  mesh.renderOrder = -1; mesh.frustumCulled = false; mesh.rotation.y = Math.random() * Math.PI * 2; const sky = new THREE.Group(); sky.add(mesh); sky.scale.setScalar(1000); sky.userData.name = name; scene.add(sky);
  const info = typeof list[name] === 'string' ? { fog: list[name] } : list[name];
  if (scene.fog) scene.fog.color.set(info.fog);
  if (info.sun) { // direction of the sun in the image -> through the sphere's uv mapping and the random yaw -> world
    const az = info.sun[0] * Math.PI / 180, el = Math.max(info.sun[1], 14) * Math.PI / 180, phi = ((az / Math.PI + 1) / 2) * Math.PI * 2, r = mesh.rotation.y;
    const x = -Math.cos(phi) * Math.cos(el), z = Math.sin(phi) * Math.cos(el);
    sky.userData.sunDir = new THREE.Vector3(x * Math.cos(r) + z * Math.sin(r), Math.sin(el), -x * Math.sin(r) + z * Math.cos(r)).normalize(); sky.userData.light = info.light;
  }
  return sky;
}
/** the rendered world for a map: grass ground (named 'sceneryc' so the terrain shading applies) + all modules */
export async function buildKitWorld(scene, buildSky, map) {
  const kit = await loadKit(), world = new THREE.Group(); scene.add(world);
  const gt = kit.tgrass.clone(); gt.needsUpdate = true; gt.repeat.set(6000 / kit.gscale, 6000 / kit.gscale); gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })); ground.name = 'sceneryc'; ground.receiveShadow = true; world.add(ground);
  const tm = buildTerrainMesh(kit, map); if (tm) { ground.position.y = -0.06; world.add(tm); }
  const props = new THREE.Group(); props.name = 'kitprops'; world.add(props);
  for (const it of map.items) { if (!kit.geos.has(it.m)) continue; const o = makeModule(kit, it.m); applyItem(o, it); props.add(o); }
  world.add(buildCaps(kit, map.items));
  return { world, sky: await buildEquirectSky(scene), kit };
}
// ---------------- storage ----------------
const KEY = 'mts_maps';
export const emptyMap = (name = 'My map') => ({ v: 1, name, size: 400, start: { x: 0, z: -150, yaw: 0 }, items: [] });
export function listMaps() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
export function loadMap(name) { try { const s = localStorage.getItem('mts_map_' + name); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
export function saveMap(map) { try { localStorage.setItem('mts_map_' + map.name, JSON.stringify(map)); const l = listMaps(); if (!l.includes(map.name)) { l.push(map.name); localStorage.setItem(KEY, JSON.stringify(l)); } return true; } catch (e) { return false; } }
export function deleteMap(name) { try { localStorage.removeItem('mts_map_' + name); localStorage.setItem(KEY, JSON.stringify(listMaps().filter((n) => n !== name))); } catch (e) {} }

// ---------------- procedural BMX terrain ----------------
// A closed dirt track: spline centreline, banked berms in the turns, and on the straights a random mix of whoops, rollers, tabletops and doubles.
// Height/dirt are analytic functions of (x,z); the mesh and collision are sampled from them.
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HW = 12, HWB = 15, BERM = 4.8;
const _tcache = new Map();
export function terrainOf(map) {
  if (!map.terrain || map.terrain.kind !== 'bmx') return null; const k = 'bmx' + map.terrain.seed; if (!_tcache.has(k)) _tcache.set(k, makeBmxTerrain(map.terrain.seed || 1)); return _tcache.get(k);
}
export function makeBmxTerrain(seed = 1) {
  const R = rngFor(seed * 7919 + 13);
  const S_TRACK = 1.45; // scale factor so the 1/8 truck feels properly proportioned on the track
  const wpRaw = [[-112, -26, 0], [-56, -26, 0], [0, -26, 0], [56, -26, 0], [112, -26, 0], [135, -18], [142, 0], [135, 18], [111, 32], [82, 38], [55, 36], [30, 28], [0, 12], [-30, 28], [-55, 36], [-82, 38], [-111, 32], [-135, 18], [-142, 0], [-135, -18]];
  const wp = wpRaw.map(([x, z, j]) => {
    const sx = x * S_TRACK, sz = z * S_TRACK;
    return j === 0 ? [sx, sz] : [sx + (R() - 0.5) * 6, sz + (R() - 0.5) * 5];
  });
  // dense closed Catmull-Rom, then resample at ~1 m
  const dense = [], n = wp.length;
  for (let i = 0; i < n; i++) { const p0 = wp[(i + n - 1) % n], p1 = wp[i], p2 = wp[(i + 1) % n], p3 = wp[(i + 2) % n]; for (let j = 0; j < 60; j++) { const t = j / 60, t2 = t * t, t3 = t2 * t; dense.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))); } }
  const cum = [0]; for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i % dense.length][0] - dense[i - 1][0], dense[i % dense.length][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1], N = Math.round(total), ds = total / N, P = []; let k = 0;
  for (let i = 0; i < N; i++) { const s = i * ds; while (cum[k + 1] < s) k++; const f = (s - cum[k]) / (cum[k + 1] - cum[k]), a = dense[k], b = dense[(k + 1) % dense.length]; P.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); }
  const wrap = (i) => ((i % N) + N) % N, T = P.map((_, i) => { const a = P[wrap(i - 1)], b = P[wrap(i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; });
  const kr = P.map((_, i) => { const a = T[wrap(i - 1)], b = T[wrap(i + 1)]; return (a[0] * b[1] - a[1] * b[0]) / (2 * ds); }), ks = kr.map((_, i) => { let sum = 0; for (let j = -10; j <= 10; j++) sum += kr[wrap(i + j)]; return sum / 21; });
  const smooth = (arr, r) => arr.map((_, i) => { let sum = 0; for (let j = -r; j <= r; j++) sum += arr[wrap(i + j)]; return sum / (2 * r + 1); });
  const w0 = smooth(kr, 16).map((v) => Math.sign(v) * sstep(0.007, 0.016, Math.abs(v))), sw = smooth(smooth(w0, 16), 14), turnW = sw.map(Math.abs), isTurn = turnW.map((w) => w > 0.22), turn2 = isTurn.map((_, i) => { for (let j = -4; j <= 4; j++) if (isTurn[wrap(i + j)]) return true; return false; });
  // straight runs -> features
  const hc = new Float32Array(N), topA = new Float32Array(N), runs = []; let j0 = turn2.indexOf(true);
  if (j0 < 0) runs.push([0, N - 1]); else { let a = -1; for (let q = 1; q <= N; q++) { const i = j0 + q, t2 = turn2[wrap(i)]; if (!t2 && a < 0) a = i; if ((t2 || q === N) && a >= 0) { runs.push([a, i - 1]); a = -1; } } }
  const put = (s0, L, f) => { for (let u = 0; u < L; u++) hc[wrap(Math.round(s0 + u))] = f(u + 0.5); };
  const items = {
    rollers() { const kk = 3 + Math.floor(R() * 3), L = 20 + R() * 6, A = 1.6 + R() * 1.0; return { len: kk * (L + 3), place(s0) { for (let q = 0; q < kk; q++) put(s0 + q * (L + 3), L, (u) => A * (0.5 - 0.5 * Math.cos(2 * Math.PI * u / L))); } }; },
    whoops() { const kk = 5 + Math.floor(R() * 4), L = 12.0, A = 0.5 + R() * 0.25; return { len: kk * L, place(s0) { for (let q = 0; q < kk; q++) put(s0 + q * L, L, (u) => A * (0.5 - 0.5 * Math.cos(2 * Math.PI * u / L))); } }; },
    moto() { const kk = 7, L = 11.0, A = 0.8; return { len: kk * L, place(s0) { for (let q = 0; q < kk; q++) put(s0 + q * L, L, (u) => A * Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * u / L), 0.85)); } }; },
    table() { const Lr = 16, Lp = 16 + R() * 8, H = 3.6 + R() * 1.2; return { len: 2 * Lr + Lp, place(s0) { put(s0, 2 * Lr + Lp, (u) => (u < Lr ? H * sstep(0, 1, u / Lr) : u < Lr + Lp ? H : H * sstep(0, 1, (2 * Lr + Lp - u) / Lr))); } }; },
    single() { const L = 18, A = 2.0 + R() * 0.9; return { len: L, place(s0) { put(s0, L, (u) => A * (0.5 - 0.5 * Math.cos(2 * Math.PI * u / L))); } }; },
    bigtable() { const Lr = 20, Lp = 18, H = 6.2; return { len: 2 * Lr + Lp, place(s0) { put(s0, 2 * Lr + Lp, (u) => (u < Lr ? H * sstep(0, 1, u / Lr) : u < Lr + Lp ? H : H * sstep(0, 1, (2 * Lr + Lp - u) / Lr))); for (let u = Lr; u < Lr + Lp; u++) topA[wrap(Math.round(s0 + u))] = sstep(0, 5, Math.min(u - Lr, Lr + Lp - u)); } }; },
    bigdouble() { const K = 17, H = 5.8, gap = 26, LH = 4.8; return { len: K + gap + 30, place(s0) { put(s0, K, (u) => H * Math.pow(u / K, 1.7)); put(s0 + K + gap, 30, (u) => (u < 18 ? LH * sstep(0, 1, u / 18) : LH * (1 - sstep(0, 1, (u - 18) / 12)))); } }; },
    double() { const K = 14, H = 3.8 + R() * 1.2, gap = 20 + R() * 6, LH = H * 0.82; return { len: K + gap + 24, place(s0) { put(s0, K, (u) => H * Math.pow(u / K, 1.7)); put(s0 + K + gap, 24, (u) => (u < 15 ? LH * sstep(0, 1, u / 15) : LH * (1 - sstep(0, 1, (u - 15) / 9)))); } }; },
  };
  const kinds = ['rollers', 'whoops', 'table', 'double', 'table', 'double', 'rollers', 'single'];
  let startIdx = -1, gateIdx = -1;
  const okRuns = runs.filter((r) => r[1] - r[0] >= 48), mainRun = okRuns.slice().sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
  for (const [a, b] of runs) {
    if (b - a < 48) continue; const main = mainRun && a === mainRun[0]; if (main) startIdx = a + 2;
    let pos = a + (main ? 32 : 25);
    if (main) for (const kname of ['bigtable', 'moto', 'bigdouble']) { const it = items[kname](); if (kname === 'bigtable') { const tp = a + 20; if (tp + it.len <= b - 2) { gateIdx = Math.round(tp + it.len / 2); it.place(tp); } pos = a + 32 + it.len + 8; continue; } if (pos + it.len <= b - 2) { it.place(pos); pos += it.len + 8; } }
    for (let guard = 0; guard < 120; guard++) { const it = items[kinds[Math.floor(R() * kinds.length)]](); if (pos + it.len > b - 18) { if (b - 18 - pos < 20) break; else continue; } it.place(pos); pos += it.len + 10 + R() * 6; }
  }
  if (startIdx < 0) startIdx = 0;
  // spatial hash of centreline samples
  const CELL = 28, hash = new Map(), hk = (cx, cz) => cx * 4099 + cz; P.forEach((p, i) => { const k2 = hk(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)); (hash.get(k2) || hash.set(k2, []).get(k2)).push(i); });
  function nearest(x, z) {
    let best = null; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of hash.get(hk(cx + a, cz + b)) || []) { const p = P[i], q = P[wrap(i + 1)], ex = q[0] - p[0], ez = q[1] - p[1], t = Math.max(0, Math.min(1, ((x - p[0]) * ex + (z - p[1]) * ez) / (ex * ex + ez * ez))), qx = p[0] + ex * t, qz = p[1] + ez * t, dist = Math.hypot(x - qx, z - qz); if (!best || dist < best.dist) best = { i, t, dist, qx, qz }; }
    if (best) { const tg = T[best.i]; best.d = (x - best.qx) * -tg[1] + (z - best.qz) * tg[0]; }
    return best;
  }
  const noise = (x, z) => Math.sin(x * 0.015 + seed) * Math.cos(z * 0.012 - seed) + 0.5 * Math.sin(x * 0.033 + z * 0.027 + seed * 2) + 0.25 * Math.cos(x * 0.065 - z * 0.055);
  function sample(x, z) {
    const q = nearest(x, z), nz = (noise(x, z) + 1.75) / 3.5, far = nz * nz * 2.2 * sstep(22, 65, q ? q.dist : 99) * sstep(0, 40, Math.min(x - bb.x0, bb.x1 - x, z - bb.z0, bb.z1 - z)); if (!q) return { h: far, dirt: 0, pack: 0, asph: 0, top: 0 };
    const i = q.i, j = wrap(i + 1), t = q.t, hcv = hc[i] + (hc[j] - hc[i]) * t, swv = sw[i] + (sw[j] - sw[i]) * t, w = Math.abs(swv), sg = Math.sign(swv) || 1;
    let h = hcv * (1 - sstep(HW - 2.0, HW + 2.0, q.dist)) + far;
    if (w > 0) { const dout = -sg * q.d, u = (dout + HWB) / (2 * HWB), bank = u <= 0 ? 0 : u <= 1 ? BERM * Math.pow(u, 2.3) : BERM * (1 - sstep(0, 1, (dout - HWB) / 5.5)); h += w * bank; }
    const flatW = (1 - w) * (1 - sstep(0.4, 1.6, Math.abs(hcv))), ridge = 0.52 * Math.exp(-(((q.dist - (HW + 1.0)) / 1.15) ** 2)) * (1 - 0.8 * w), rutA = Math.exp(-(((Math.abs(q.d) - 2.8) / 0.7) ** 2)) * flatW;
    h += ridge - 0.08 * rutA;
    const edgeN = 1.6 * (Math.sin(x * 0.26 + z * 0.15) + Math.sin(x * 0.09 - z * 0.21) * 1.2), ext = HW + 6.5 * w + edgeN * 0.6, dirt = (1 - sstep(ext - 1.6, ext + 1.6, q.dist)) * (0.9 + 0.1 * Math.sin(x * 0.22) * Math.cos(z * 0.19));
    const topW = (topA[i] + (topA[j] - topA[i]) * t) * (1 - sstep(HW - 3.2, HW + 0.7, q.dist)), dO = -sg * q.d, asph = w * sstep(-2.5, 4, dO) * (1 - sstep(HWB + 1.5, HWB + 4, dO));
    return { h, dirt: Math.max(0, Math.min(1, dirt)), pack: rutA * Math.max(0, Math.min(1, dirt)), asph, top: topW };
  }
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9; for (const p of P) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); bz0 = Math.min(bz0, p[1]); bz1 = Math.max(bz1, p[1]); }
  const bb = { x0: Math.floor(bx0 - 60), x1: Math.ceil(bx1 + 60), z0: Math.floor(bz0 - 60), z1: Math.ceil(bz1 + 60) };
  const decor = [], nrm = (i) => [-T[wrap(i)][1], T[wrap(i)][0]];
  for (let i = 1; i < N; i++) if (turnW[wrap(i - 1)] < 0.5 && turnW[i] >= 0.5) { const sg = Math.sign(sw[i]) || 1, n = nrm(i); for (let b = -3; b <= 3; b++) { const j = wrap(i + b * 5), nn = nrm(j); decor.push({ t: 'bale', x: P[j][0] + nn[0] * sg * -(HWB + 4), z: P[j][1] + nn[1] * sg * -(HWB + 4), rot: Math.atan2(T[j][0], T[j][1]), s: b }); } }
  // ag-pipe coping: a few straight stretches, one side each, edge of the dirt
  { const seg = Math.max(1, Math.round(2.4 / ds)), blk = 36; for (let b = 0; b * blk < N; b++) { const hr = Math.sin(b * 12.9898 + seed * 78.233) * 43758.5453; if (hr - Math.floor(hr) > 0.3) continue; const side = b % 2 ? 1 : -1; for (let i = b * blk; i < (b + 1) * blk && i + seg < N; i += seg) { if (turnW[wrap(i)] > 0.15 || turnW[wrap(i + seg)] > 0.15) continue; const n0 = nrm(i), n1 = nrm(i + seg), o = HW + 2.6; decor.push({ t: 'pipe', x0: P[i][0] + n0[0] * side * o, z0: P[i][1] + n0[1] * side * o, x1: P[wrap(i + seg)][0] + n1[0] * side * o, z1: P[wrap(i + seg)][1] + n1[1] * side * o }); } } }
  const sp = P[startIdx], st = T[startIdx];
  return { heightAt: (x, z) => sample(x, z).h, sample, bb, decor, runs, length: total, path: P, tangents: T, startIdx, gateIdx, start: { x: +sp[0].toFixed(2), z: +sp[1].toFixed(2), yaw: +(Math.atan2(st[0], st[1]) * 180 / Math.PI).toFixed(1) } };
}
const _dcache = new Map();
function gridMesh(T, sp, wantAttrs) {
  const bb = T.bb, nx = Math.ceil((bb.x1 - bb.x0) / sp), nz = Math.ceil((bb.z1 - bb.z0) / sp), sx = (bb.x1 - bb.x0) / nx, sz = (bb.z1 - bb.z0) / nz, W = nx + 1, n = W * (nz + 1), H = new Float32Array(n), D = new Float32Array(n), Pk = new Float32Array(n), Ak = new Float32Array(n), Tk = new Float32Array(n);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const r = T.sample(bb.x0 + i * sx, bb.z0 + j * sz), k = j * W + i; H[k] = r.h; D[k] = r.dirt; Pk[k] = r.pack; Ak[k] = r.asph; Tk[k] = r.top; }
  const at = (i, j) => H[Math.max(0, Math.min(nz, j)) * W + Math.max(0, Math.min(nx, i))], v8 = new Float32Array(n * 8), nor = wantAttrs ? new Float32Array(n * 3) : null, uv = wantAttrs ? new Float32Array(n * 2) : null, uv2 = wantAttrs ? new Float32Array(n * 2) : null;
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * W + i, x = bb.x0 + i * sx, z = bb.z0 + j * sz, h = H[k], gx = (at(i - 1, j) - at(i + 1, j)) / (2 * sx), gz = (at(i, j - 1) - at(i, j + 1)) / (2 * sz), l = Math.hypot(gx, 1, gz);
    v8.set([x, h, z, gx / l, 1 / l, gz / l, 0, 0], k * 8); if (wantAttrs) { nor.set([gx / l, 1 / l, gz / l], k * 3); uv.set([x, z], k * 2); uv2.set([x, z], k * 2); }
  }
  const idx = new Uint32Array(nx * nz * 6); let o = 0; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.set([a, c, b, b, c, d], o); o += 6; }
  return { v8, nor, uv, uv2, D, Pk, Ak, Tk, idx };
}
/** terrain grids: a fine render mesh (1.2 m) and a coarser collision mesh (1.8 m), both over the track's bounding box */
export function terrainData(map) {
  const T = terrainOf(map); if (!T) return null; const key = 'bmx' + map.terrain.seed; if (_dcache.has(key)) return _dcache.get(key);
  const out = { T, bb: T.bb, render: null, coll: gridMesh(T, 1.8, false) }; _dcache.set(key, out); return out;
}
function renderData(td) { return td.render || (td.render = gridMesh(td.T, LOWQ ? 1.8 : 1.2, true)); }
let _tmat = null;
export function terrainMaterial(kit) {
  if (_tmat) return _tmat; const m = new THREE.MeshStandardMaterial({ map: kit.tgrass, roughness: 1 }); m.onBeforeCompile = (sh) => {
    sh.uniforms.dirtMap = { value: kit.tdirt }; sh.uniforms.asphMap = { value: kit.tasph }; sh.uniforms.topMap = { value: kit.ttop }; sh.uniforms.uTS = { value: kit.tscale }; sh.uniforms.uAS = { value: kit.ascale }; sh.uniforms.uGS = { value: kit.gscale }; sh.uniforms.uDS = { value: kit.dscale };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDirt; attribute float aPack; attribute float aAsph; attribute float aTop; attribute vec2 uv2d; varying float vDirt; varying float vPack; varying float vAsph; varying float vTop; varying vec2 vUv2; varying vec3 vWN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN = normal; vDirt = aDirt; vPack = aPack; vAsph = aAsph; vTop = aTop; vUv2 = uv2d;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D dirtMap; uniform sampler2D asphMap; uniform sampler2D topMap; uniform float uTS; varying float vTop; uniform float uGS; uniform float uDS; uniform float uAS; varying float vAsph; varying float vDirt; varying float vPack; varying vec2 vUv2; varying vec3 vWN; float tHgt;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`).replace('#include <map_fragment>', `
vec2 gU = vUv2 / uGS, dU = vUv2 / uDS, nU = vUv2 / 5.0;
vec4 gr = texture2D(map, gU) * 0.62 + texture2D(map, gU * 4.3 + 0.37) * 0.38;
vec4 dr = texture2D(dirtMap, dU) * 0.6 + texture2D(dirtMap, dU * 3.7 + 0.21) * 0.4;
float nz = vn(nU * 2.3) * 0.6 + vn(nU * 9.0) * 0.4;
dr.rgb *= 0.72 + 0.55 * nz; dr.rgb *= 1.0 - 0.28 * vPack; dr.rgb = mix(dr.rgb, dr.rgb * vec3(1.12, 1.02, 0.86), vn(nU * 0.7));
gr.rgb *= 0.85 + 0.3 * vn(nU * 0.6);
vec2 aU = vUv2 / uAS; vec4 ar = texture2D(asphMap, aU) * 0.7 + texture2D(asphMap, aU * 3.3 + 0.5) * 0.3; ar.rgb *= 0.9 + 0.2 * vn(nU * 1.7);
dr = mix(dr, ar, smoothstep(0.15, 0.7, vAsph));
vec2 tU = vUv2 / uTS; vec4 tr = texture2D(topMap, tU) * 0.7 + texture2D(topMap, tU * 3.1 + 0.3) * 0.3; tr.rgb *= 0.9 + 0.25 * vn(nU * 1.3); tr = mix(tr, gr * vec4(0.95, 1.0, 0.8, 1.0), smoothstep(0.35, 0.7, vn(nU * 2.6 + 7.0)) * 0.75);
dr = mix(dr, tr, smoothstep(0.1, 0.6, vTop));
float steep = smoothstep(0.22, 0.5, 1.0 - normalize(vWN).y);
float n1 = vn(vUv2 * 0.9), n2 = vn(vUv2 * 3.1 + 11.0), n3 = vn(vUv2 * 11.0 + 3.0), n4 = vn(vUv2 * 37.0);
float macro = vn(vUv2 / 23.0) * 0.6 + vn(vUv2 / 61.0) * 0.4;
gr.rgb *= 0.8 + 0.4 * macro; gr.rgb = mix(gr.rgb, gr.rgb * vec3(1.1, 1.0, 0.7), smoothstep(0.55, 0.8, vn(vUv2 / 9.0 + 5.0)) * 0.6);
gr.rgb *= 0.88 + 0.24 * n3;
vec3 rock = dr.rgb * vec3(0.78, 0.74, 0.7) * (0.85 + 0.3 * n2);
gr.rgb = mix(gr.rgb, rock, steep * 0.7);
dr.rgb *= 0.85 + 0.3 * macro;
dr.rgb *= 1.0 - 0.22 * steep * n2;
float edge = smoothstep(0.2, 0.5, vDirt) * (1.0 - smoothstep(0.5, 0.9, vDirt));
dr.rgb *= 1.0 - 0.3 * edge; gr.rgb *= 1.0 - 0.12 * edge;
tHgt = (dr.g * 0.5 + n4 * 0.25 + n3 * 0.25) * smoothstep(0.1, 0.9, vDirt) + (gr.g * 0.6 + n3 * 0.4) * (1.0 - smoothstep(0.1, 0.9, vDirt)) * 0.6;
diffuseColor *= mix(gr, dr, smoothstep(0.15, 0.85, vDirt));`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(1.0, 0.82, vPack * smoothstep(0.3, 0.9, vDirt));`);
  }; return (_tmat = m);
}
export function buildTerrainMesh(kit, map) {
  const td = terrainData(map); if (!td) return null; const d = renderData(td), g = new THREE.BufferGeometry();
  const pos = new Float32Array(d.v8.length / 8 * 3); for (let k = 0; k < pos.length / 3; k++) { pos[k * 3] = d.v8[k * 8]; pos[k * 3 + 1] = d.v8[k * 8 + 1]; pos[k * 3 + 2] = d.v8[k * 8 + 2]; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(d.nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2)); g.setAttribute('uv2d', new THREE.BufferAttribute(d.uv2, 2)); g.setAttribute('aDirt', new THREE.BufferAttribute(d.D, 1)); g.setAttribute('aPack', new THREE.BufferAttribute(d.Pk, 1)); g.setAttribute('aAsph', new THREE.BufferAttribute(d.Ak, 1)); g.setAttribute('aTop', new THREE.BufferAttribute(d.Tk, 1)); g.setIndex(new THREE.BufferAttribute(d.idx, 1));
  g.computeBoundingSphere(); const m = new THREE.Mesh(g, terrainMaterial(kit)); m.name = 'bmxterrain'; m.receiveShadow = true; m.castShadow = true;
  const grp = new THREE.Group(); grp.name = 'bmxterrain'; grp.add(m); grp.add(buildDecor(td.T)); return grp;
}
function buildDecor(T) {
  const g = new THREE.Group(), hs = (x, z) => T.heightAt(x, z), bales = T.decor.filter((d) => d.t === 'bale');
  const inst = (geo, mat, list, f) => { if (!list.length) return; const im = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D(); list.forEach((d, i) => { f(o, d); o.updateMatrix(); im.setMatrixAt(i, o.matrix); if (d.col !== undefined) im.setColorAt(i, new THREE.Color(d.col)); }); im.castShadow = im.receiveShadow = true; g.add(im); };
  inst(new THREE.BoxGeometry(2.5, 1.25, 1.25).translate(0, 0.625, 0), new THREE.MeshStandardMaterial({ color: 0xffffff }), bales.map((d, i) => ({ ...d, col: i % 3 ? 0xcaa95a : 0xb89848 })), (o, d) => { o.position.set(d.x, hs(d.x, d.z) - 0.05, d.z); o.rotation.set(0, d.rot + (d.s % 2 ? 0.05 : -0.04), 0); });
  // corrugated black drainage pipe, lathe ribs along +Z, laid on the ground
  const pipes = T.decor.filter((d) => d.t === 'pipe');
  if (pipes.length) {
    const prof = [], R0 = 0.2, L = 2.4, rb = 12; for (let k = 0; k <= rb * 8; k++) { const y = k / (rb * 8) * L, ph = (k % 8) / 8; prof.push(new THREE.Vector2(R0 * (0.9 + 0.1 * Math.pow(Math.abs(Math.sin(ph * Math.PI)), 0.6)), y - L / 2)); }
    const geo = new THREE.LatheGeometry(prof, 14).rotateX(Math.PI / 2);
    inst(geo, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6, metalness: 0.1 }), pipes, (o, d) => { const y0 = hs(d.x0, d.z0), y1 = hs(d.x1, d.z1), dx = d.x1 - d.x0, dz = d.z1 - d.z0, l = Math.hypot(dx, dz) || 1; o.scale.set(1, 1, l / L); o.position.set((d.x0 + d.x1) / 2, (y0 + y1) / 2 + R0 * 0.6, (d.z0 + d.z1) / 2); o.rotation.set(-Math.atan2(y1 - y0, l), Math.atan2(dx, dz), 0, 'YXZ'); });
  }
  return g;
}
export const BUILTIN = { 'builtin:bmx': { title: 'BMX Dirt Track', desc: 'A flowing looped dirt track: banked berms, whoops, rollers, tabletops and doubles. Free roam.' } };
export function bmxMap(seed = 1, name = 'BMX Dirt Track') { const m = emptyMap(name); m.terrain = { kind: 'bmx', seed }; const T = terrainOf(m); m.start = { ...T.start }; m.path = T.path; m.tangents = T.tangents; m.startIdx = T.startIdx; return m; }
export function getMap(id) { if (id === 'builtin:bmx') return bmxMap(1); return loadMap(id); }
// ---------------- generator ----------------
const rngFor = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const STYLES = { bmx: 'BMX dirt track (looped, berms & jumps)', jumps: 'Jump park (kicker → landing lines)', hills: 'Dirt hills & pyramids', obstacles: 'Obstacle field (ledges, bunkers)', mixed: 'Mixed park' };
export function generateMap(kit, { seed = 1, style = 'mixed', size = 400, density = 0.5, name = 'Generated map' } = {}) {
  if (style === 'bmx') { const m = bmxMap(seed, name); m.size = Math.max(400, size); return m; }
  const R = rngFor(seed), pick = (a) => a[Math.floor(R() * a.length)], map = emptyMap(name); map.size = size; map.start = { x: 0, z: -size * 0.42, yaw: 0 };
  const sets = (s) => kit.modules.filter((m) => m.set === s);
  const ramps = kit.modules.filter((m) => m.set === 'Ramp' && m.size[1] >= 2 && m.high), hills = sets('Dirt hill'), pyr = sets('Pyramid'), ledges = sets('Ledge'), bunk = sets('Bunker'), flatRamps = kit.modules.filter((m) => m.set === 'Ramp' && m.size[1] >= 1.5);
  const placed = []; // footprint circles
  const free = (x, z, r) => Math.hypot(x - map.start.x, z - map.start.z) > r + 35 && Math.abs(x) < size / 2 - r && Math.abs(z) < size / 2 - r && placed.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + r + 4);
  const add = (m, x, z, rot, sc = 1, sy = 1) => { const r = 0.5 * Math.hypot(m.size[0], m.size[2]) * sc; if (!free(x, z, r)) return false; map.items.push({ m: m.id, x: +x.toFixed(2), z: +z.toFixed(2), y: 0, rot: ((rot % 360) + 360) % 360, sx: +sc.toFixed(3), sy: +(sc * sy).toFixed(3), sz: +sc.toFixed(3) }); placed.push({ x, z, r }); return true; };
  const area = size * size, target = Math.round(area / 6000 * (0.4 + density * 1.6));
  const rotFacing = (m, dirDeg) => { // rotate so the module's high side points along compass direction dirDeg (0 = +z)
    const h = m.high || [0, 1], a0 = Math.atan2(h[0], h[1]) * 180 / Math.PI; return dirDeg - a0; };
  const lines = () => { // kicker -> gap -> landing hill/pyramid/ramp, all along +z
    const lanes = Math.max(2, Math.round(size / 90));
    for (let l = 0; l < lanes; l++) { const x = (-size / 2 + (l + 0.5) * size / lanes) + (R() - 0.5) * 10; let z = -size / 2 + 60 + R() * 20; const dir = R() < 0.5 ? 0 : 180; if (dir) z = size / 2 - 60 - R() * 20;
      for (let k = 0; k < 3; k++) { const ra = ramps.length ? pick(ramps) : pick(flatRamps), sc = 0.8 + R() * 0.5, run = Math.max(ra.size[0], ra.size[2]) * sc, gap = ra.size[1] * sc * (6 + R() * 3), land = R() < 0.5 && hills.length ? pick(hills) : pyr.length ? pick(pyr) : pick(flatRamps), sgn = dir ? -1 : 1;
        if (!add(ra, x, z, rotFacing(ra, dir), sc)) break; const lz = z + sgn * (run / 2 + gap + 0.5 * Math.max(land.size[0], land.size[2]) * sc); if (!add(land, x + (R() - 0.5) * 6, lz, dir + (land.high ? rotFacing(land, dir + 180) - dir : 0), sc)) break; z = lz + sgn * (0.5 * Math.max(land.size[0], land.size[2]) * sc + 30 + R() * 20); if (Math.abs(z) > size / 2 - 40) break; } }
  };
  const scatter = (pools, n, scMin, scMax, rotStep) => { let tries = 0, got = 0; while (got < n && tries++ < n * 40) { const m = pick(pools), sc = scMin + R() * (scMax - scMin); if (add(m, (R() - 0.5) * size * 0.92, (R() - 0.5) * size * 0.92, Math.floor(R() * 360 / rotStep) * rotStep, sc, 0.85 + R() * 0.4)) got++; } };
  if (style === 'jumps') { lines(); scatter(hills.concat(pyr), Math.round(target * 0.25), 0.6, 1.1, 15); }
  else if (style === 'hills') { scatter(hills.concat(pyr, pyr), target, 0.7, 1.4, 15); }
  else if (style === 'obstacles') { scatter(ledges.concat(bunk, flatRamps), target * 1.5, 0.8, 1.3, 15); }
  else { lines(); scatter(hills.concat(pyr), Math.round(target * 0.35), 0.6, 1.2, 15); scatter(ledges.concat(bunk), Math.round(target * 0.6), 0.8, 1.2, 15); }
  return map;
}
