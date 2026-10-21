import * as THREE from 'three';
import { loadKit, terrainOf, buildTerrainMesh, bmxMap, getMap, buildCaps, snapItem, makeModule, applyItem, emptyMap, listMaps, loadMap, saveMap, deleteMap, generateMap, STYLES } from './kit.js';
const $ = (id) => document.getElementById(id), q = new URLSearchParams(location.search);
const canvas = $('c'), renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true; renderer.setPixelRatio(Math.min(2, devicePixelRatio));
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9cc3e6); scene.fog = new THREE.Fog(0x9cc3e6, 500, 2500);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 6000);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556644, 1.6)); const sun = new THREE.DirectionalLight(0xfff2dd, 2.2); sun.position.set(120, 260, 80); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 10, far: 900 }); scene.add(sun);
const kit = await loadKit();
// ---------------- state ----------------
let map = getMap(q.get('kitmap') || '') || emptyMap('My map'); let sel = -1, selStart = false, place = null, snap = 3, hist = [], redoS = [], uniform = true;
const items = new THREE.Group(); scene.add(items); const startObj = new THREE.Group(); scene.add(startObj);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: kit.mats[0].map.clone(), roughness: 1 })); ground.receiveShadow = true; scene.add(ground);
const outer = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4d6b35, roughness: 1 })); outer.position.y = -0.2; scene.add(outer);
let terrMesh = null; const gy = (x, z) => { const T = terrainOf(map); return T ? +T.heightAt(x, z).toFixed(2) : 0; };
let capsObj = null, joinSnap = true, capQ = 0; function refreshCaps() { if (capsObj) scene.remove(capsObj); capsObj = buildCaps(kit, map.items); scene.add(capsObj); capInfo = capsObj.userData; const e = $('capinfo'); if (e) e.textContent = `${capInfo.joined} joined edges, ${capInfo.openCount} open (auto-closed)`; } let capInfo = { openCount: 0, joined: 0 };
let gridHelper = null; const selBox = new THREE.BoxHelper(new THREE.Object3D(), 0xffcc33); selBox.visible = false; scene.add(selBox);
{ const a = new THREE.Mesh(new THREE.ConeGeometry(3, 10, 12), new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0x552200 })); a.rotation.x = Math.PI / 2; a.position.set(0, 3, 5); const b = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0xffffff })); b.position.y = 0.2; startObj.add(a, b); startObj.userData.start = true; }
const snapshot = () => JSON.stringify(map);
function commit() { hist.push(snapshot()); if (hist.length > 120) hist.shift(); redoS = []; dirty = true; }
let dirty = false; hist.push(snapshot());
function restore(s) { map = JSON.parse(s); sel = Math.min(sel, map.items.length - 1); rebuild(); refreshInspector(); }
function undo() { if (hist.length < 2) return; redoS.push(hist.pop()); restore(hist[hist.length - 1]); }
function redo() { if (!redoS.length) return; const s = redoS.pop(); hist.push(s); restore(s); }
// ---------------- scene sync ----------------
function rebuild() {
  while (items.children.length) items.remove(items.children[0]);
  map.items.forEach((it, i) => { if (!kit.geos.has(it.m)) return; const o = makeModule(kit, it.m); o.userData.idx = i; applyItem(o, it); items.add(o); });
  const s = map.size || 400; ground.scale.set(s, 1, s); ground.material.map.repeat.set(s / 8, s / 8); ground.material.map.wrapS = ground.material.map.wrapT = THREE.RepeatWrapping; ground.material.map.needsUpdate = true;
  if (gridHelper) scene.remove(gridHelper); gridHelper = new THREE.GridHelper(s, Math.max(2, Math.round(s / (snap || 10))), 0x000000, 0x000000); gridHelper.material.opacity = 0.18; gridHelper.material.transparent = true; gridHelper.position.y = 0.05; scene.add(gridHelper); gridHelper.visible = !terrMesh;
  if (terrMesh) { scene.remove(terrMesh); terrMesh = null; } terrMesh = buildTerrainMesh(kit, map); if (terrMesh) scene.add(terrMesh); ground.visible = !terrMesh; if (gridHelper) gridHelper.visible = !terrMesh; outer.position.y = terrMesh ? -0.3 : -0.2;
  refreshCaps(); startObj.position.set(map.start.x, gy(map.start.x, map.start.z), map.start.z); startObj.rotation.y = map.start.yaw * Math.PI / 180; updateSel(); $('mapname') && ($('mapname').value = map.name);
}
const objOf = (i) => items.children.find((c) => c.userData.idx === i);
function updateSel() { const o = selStart ? startObj : sel >= 0 ? objOf(sel) : null; if (o) { selBox.setFromObject(o); selBox.visible = true; } else selBox.visible = false; }
// ---------------- camera ----------------
const cam = { tx: 0, tz: -100, dist: 220, yaw: 0.6, pitch: 0.7, top: false };
function placeCamera() { const p = cam.top ? Math.PI / 2 - 0.001 : cam.pitch; camera.position.set(cam.tx + Math.sin(cam.yaw) * Math.cos(p) * cam.dist, Math.sin(p) * cam.dist, cam.tz + Math.cos(cam.yaw) * Math.cos(p) * cam.dist); camera.lookAt(cam.tx, 0, cam.tz); }
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); } addEventListener('resize', resize); resize();
// ---------------- palette ----------------
const sets = ['All', ...new Set(kit.modules.map((m) => m.set))]; let tab = 'All'; const thumbs = new Map();
function makeThumbs() {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(120, 100); const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x666655, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(1, 2, 1); sc.add(dl); sc.background = new THREE.Color(0x8fb4d8);
  const cm = new THREE.PerspectiveCamera(35, 1.2, 0.1, 2000);
  for (const m of kit.modules) { const o = makeModule(kit, m.id, { shadows: false }); sc.add(o); const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).length(); cm.position.set(c.x + s * 0.7, c.y + s * 0.55, c.z + s * 0.9); cm.lookAt(c); r.render(sc, cm); thumbs.set(m.id, r.domElement.toDataURL('image/jpeg', 0.8)); sc.remove(o); }
  r.dispose();
}
makeThumbs();
function drawPalette() {
  $('tabs').innerHTML = sets.map((s) => `<button class="me-btn ${s === tab ? 'on' : ''}" data-t="${s}">${s}</button>`).join('');
  $('cards').innerHTML = kit.modules.filter((m) => tab === 'All' || m.set === tab).map((m) => `<div class="card ${place === m.id ? 'sel' : ''}" data-m="${m.id}"><img src="${thumbs.get(m.id)}" alt="${m.name}">${m.name}<small>${m.size[0].toFixed(0)}×${m.size[2].toFixed(0)}×${m.size[1].toFixed(0)} m</small></div>`).join('');
}
$('tabs').onclick = (e) => { const t = e.target.closest('[data-t]'); if (t) { tab = t.dataset.t; drawPalette(); } };
$('cards').onclick = (e) => { const c = e.target.closest('[data-m]'); if (c) startPlace(c.dataset.m); };
let ghost = null;
function startPlace(id) { cancelPlace(); place = id; ghost = makeModule(kit, id, { shadows: false }); ghost.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.55; } }); ghost.visible = false; scene.add(ghost); ghostRot = 0; ghostScale = 1; drawPalette(); hint(); }
let ghostRot = 0, ghostScale = 1, ghostPose = null;
function cancelPlace() { if (ghost) scene.remove(ghost); ghost = null; place = null; drawPalette(); hint(); }
// ---------------- picking ----------------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function setRay(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function groundPoint(e, y = 0) { setRay(e); plane.constant = -y; const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane, p) ? p : null; }
const sn = (v) => (snap ? Math.round(v / snap) * snap : v);
function pickItem(e) { setRay(e); const hit = ray.intersectObjects([...items.children, startObj], true)[0]; if (!hit) return null; let o = hit.object; while (o && o.userData.idx === undefined && !o.userData.start) o = o.parent; return o ? (o.userData.start ? 'start' : o.userData.idx) : null; }
// ---------------- pointer interaction ----------------
let mode = null, last = { x: 0, y: 0 }, dragOff = new THREE.Vector3(), moved = false;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId); last = { x: e.clientX, y: e.clientY }; moved = false;
  if (e.button === 2) { if (place) { cancelPlace(); return; } mode = 'orbit'; return; }
  if (e.button === 1) { mode = 'pan'; return; }
  if (place) { const p = groundPoint(e); if (p) placeAt(p); return; }
  const hit = pickItem(e);
  if (hit === null) { sel = -1; selStart = false; refreshInspector(); updateSel(); mode = 'pan'; return; }
  if (hit === 'start') { selStart = true; sel = -1; const p = groundPoint(e); dragOff.set(startObj.position.x - p.x, 0, startObj.position.z - p.z); } else { sel = hit; selStart = false; const it = map.items[sel], p = groundPoint(e, it.y || 0); dragOff.set(it.x - p.x, 0, it.z - p.z); }
  mode = 'drag'; refreshInspector(); updateSel();
});
canvas.addEventListener('pointermove', (e) => {
  const dx = e.clientX - last.x, dy = e.clientY - last.y; last = { x: e.clientX, y: e.clientY };
  if (mode === 'orbit') { cam.yaw -= dx * 0.006; cam.pitch = Math.max(0.08, Math.min(1.5, cam.pitch + dy * 0.005)); cam.top = false; $('view').classList.remove('on'); }
  else if (mode === 'pan') { const k = cam.dist * 0.0016, c = Math.cos(cam.yaw), s = Math.sin(cam.yaw); cam.tx += (-dx * c - dy * s * (cam.top ? 1 : 1)) * k * 1; cam.tz += (dx * s - dy * c) * k * 1; }
  else if (mode === 'drag') { moved = true; if (selStart) { const p = groundPoint(e); if (p) { map.start.x = sn(p.x + dragOff.x); map.start.z = sn(p.z + dragOff.z); startObj.position.set(map.start.x, 0, map.start.z); updateSel(); refreshInspector(true); } } else { const it = map.items[sel], p = groundPoint(e, it.y || 0); if (p) { it.x = sn(p.x + dragOff.x); it.z = sn(p.z + dragOff.z); if (terrainOf(map)) it.y = gy(it.x, it.z); if (joinSnap && !e.altKey) { const s2 = snapItem(kit, map.items, sel, it); if (s2) Object.assign(it, s2); } applyItem(objOf(sel), it); refreshCaps(); updateSel(); refreshInspector(true); } } }
  else if (ghost) { const p = groundPoint(e); if (p) { ghost.visible = true; const c = { m: place, x: sn(p.x), z: sn(p.z), y: gy(sn(p.x), sn(p.z)), rot: ghostRot, sx: ghostScale, sy: ghostScale, sz: ghostScale }, s2 = joinSnap && !e.altKey ? snapItem(kit, map.items, -1, c) : null, t = s2 || c; ghostPose = t; applyItem(ghost, t); }}
});
canvas.addEventListener('pointerup', () => { if (mode === 'drag' && moved) commit(); mode = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(15, Math.min(1500, cam.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
function placeAt(p) { map.items.push(ghostPose && ghostPose.m === place ? { ...ghostPose } : { m: place, x: sn(p.x), z: sn(p.z), y: gy(sn(p.x), sn(p.z)), rot: ghostRot, sx: ghostScale, sy: ghostScale, sz: ghostScale }); sel = map.items.length - 1; selStart = false; commit(); rebuild(); refreshInspector(); }
// ---------------- inspector ----------------
function refreshInspector(light) {
  const el = $('insp'); if (light && el.dataset.k === String(selStart ? 's' : sel)) { syncFields(); return; } el.dataset.k = String(selStart ? 's' : sel);
  const mapHtml = `<h4>Map</h4><div class="f">Name<input type="text" id="mapname" value="${map.name.replace(/"/g, '&quot;')}"></div><div class="f">Size<select id="msize">${[200, 300, 400, 600, 800].map((s) => `<option ${s === map.size ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="f">Terrain<select id="mterr"><option value="" ${map.terrain ? '' : 'selected'}>Flat grass</option><option value="bmx" ${map.terrain ? 'selected' : ''}>BMX dirt track</option></select></div>${map.terrain ? `<div class="f">Track seed<input type="number" id="mseed" value="${map.terrain.seed}" step="1"></div>` : ''}<div class="f" style="color:var(--dim)">${map.items.length} pieces</div><div style="font:500 11px var(--ui);color:var(--dim)" id="capinfo"></div><div style="margin-top:10px"><button class="me-btn" id="bdelmap_insp" style="width:100%;color:#ff7777;border-color:rgba(255,80,80,.4)">Delete this map</button></div>`;
  if (selStart) { el.innerHTML = `<h4>Truck start</h4><div class="f">X<input type="number" id="fx" step="1"></div><div class="f">Z<input type="number" id="fz" step="1"></div><div class="f">Heading°<input type="number" id="fr" step="5"></div>` + mapHtml; }
  else if (sel >= 0) { const m = kit.byId.get(map.items[sel].m); el.innerHTML = `<h4>${m.name}</h4><div style="font:500 11px var(--ui);color:var(--dim)">${m.size[0]}×${m.size[2]}×${m.size[1]} m at scale 1</div>
    <div class="f">X<input type="number" id="fx" step="1"></div><div class="f">Z<input type="number" id="fz" step="1"></div><div class="f">Height Y<input type="number" id="fy" step="0.5"></div><div class="f">Rotate°<input type="number" id="fr" step="15"></div>
    <div class="f">Scale X<input type="number" id="fsx" step="0.1" min="0.1"></div><div class="f">Scale Y<input type="number" id="fsy" step="0.1" min="0.1"></div><div class="f">Scale Z<input type="number" id="fsz" step="0.1" min="0.1"></div>
    <div class="f">Lock<label><input type="checkbox" id="fu" ${uniform ? 'checked' : ''}> uniform</label></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button class="me-btn" id="bdup">Duplicate</button><button class="me-btn" id="bdel">Delete</button><button class="me-btn" id="bfront">Drop to ground</button></div>` + mapHtml; }
  else el.innerHTML = `<h4>Nothing selected</h4><div style="font:500 12px var(--ui);color:var(--dim);line-height:1.5">Pick a piece on the left to place it, or click one in the scene to move, rotate and resize it.</div>` + mapHtml;
  syncFields(); { const e = $('capinfo'); if (e) e.textContent = `${capInfo.joined} joined edges, ${capInfo.openCount} open (auto-closed)`; }
}
function syncFields() {
  const set = (id, v) => { const e = $(id); if (e && document.activeElement !== e) e.value = +(+v).toFixed(3); };
  if (selStart) { set('fx', map.start.x); set('fz', map.start.z); set('fr', map.start.yaw); } else if (sel >= 0) { const it = map.items[sel]; set('fx', it.x); set('fz', it.z); set('fy', it.y || 0); set('fr', it.rot || 0); set('fsx', it.sx || 1); set('fsy', it.sy || 1); set('fsz', it.sz || 1); }
}
$('insp').addEventListener('input', (e) => {
  const id = e.target.id, v = parseFloat(e.target.value); if (id === 'mapname') { map.name = e.target.value || 'My map'; dirty = true; return; }
  if (id === 'mterr') { map.terrain = e.target.value ? { kind: 'bmx', seed: map.terrain?.seed || 1 } : undefined; const T = terrainOf(map); if (T) map.start = { ...T.start }; commit(); rebuild(); refreshInspector(); return; } if (id === 'mseed') { map.terrain = { kind: 'bmx', seed: Math.max(1, Math.floor(v) || 1) }; map.start = { ...terrainOf(map).start }; commit(); rebuild(); return; }
  if (id === 'msize') { map.size = parseInt(e.target.value, 10); commit(); rebuild(); return; } if (id === 'fu') { uniform = e.target.checked; return; } if (Number.isNaN(v)) return;
  if (selStart) { if (id === 'fx') map.start.x = v; if (id === 'fz') map.start.z = v; if (id === 'fr') map.start.yaw = v; startObj.position.set(map.start.x, 0, map.start.z); startObj.rotation.y = map.start.yaw * Math.PI / 180; updateSel(); return; }
  if (sel < 0) return; const it = map.items[sel]; const k = { fx: 'x', fz: 'z', fy: 'y', fr: 'rot', fsx: 'sx', fsy: 'sy', fsz: 'sz' }[id]; if (!k) return; it[k] = v;
  if (uniform && id.startsWith('fs')) { it.sx = it.sy = it.sz = v; } applyItem(objOf(sel), it); updateSel(); if (uniform && id.startsWith('fs')) syncFields();
});
$('insp').addEventListener('change', () => commit());
$('insp').addEventListener('click', (e) => {
  if (e.target.id === 'bdup') dupSel();
  else if (e.target.id === 'bdel') delSel();
  else if (e.target.id === 'bfront') { map.items[sel].y = 0; commit(); rebuild(); refreshInspector(); }
  else if (e.target.id === 'bdelmap_insp') doDeleteCurrentMap();
});
function delSel() { if (selStart || sel < 0) return; map.items.splice(sel, 1); sel = -1; commit(); rebuild(); refreshInspector(); }
function dupSel() { if (selStart || sel < 0) return; const it = { ...map.items[sel], x: map.items[sel].x + (snap || 3) * 2, z: map.items[sel].z + (snap || 3) * 2 }; map.items.push(it); sel = map.items.length - 1; commit(); rebuild(); refreshInspector(); }
// ---------------- keys ----------------
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && e.code !== 'Escape') return;
  const ctrl = e.ctrlKey || e.metaKey, step = e.shiftKey ? 90 : e.altKey ? 1 : 15;
  if (e.code === 'Escape') { cancelPlace(); sel = -1; selStart = false; updateSel(); refreshInspector(); }
  else if (ctrl && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); } else if (ctrl && e.code === 'KeyY') { e.preventDefault(); redo(); } else if (ctrl && e.code === 'KeyD') { e.preventDefault(); dupSel(); } else if (ctrl && e.code === 'KeyS') { e.preventDefault(); doSave(); }
  else if (e.code === 'Delete' || e.code === 'Backspace') delSel();
  else if (e.code === 'KeyQ' || e.code === 'KeyE') { const d = e.code === 'KeyQ' ? -step : step; if (ghost) { ghostRot += d; ghost.rotation.y = ghostRot * Math.PI / 180; } else if (selStart) { map.start.yaw += d; startObj.rotation.y = map.start.yaw * Math.PI / 180; commit(); syncFields(); } else if (sel >= 0) { map.items[sel].rot = (((map.items[sel].rot || 0) + d) % 360 + 360) % 360; applyItem(objOf(sel), map.items[sel]); refreshCaps(); commit(); updateSel(); syncFields(); } }
  else if (e.code === 'BracketLeft' || e.code === 'BracketRight') { const f = e.code === 'BracketLeft' ? 0.9 : 1.1; if (ghost) { ghostScale *= f; ghost.scale.setScalar(ghostScale); } else if (sel >= 0) { const it = map.items[sel]; it.sx *= f; it.sy *= f; it.sz *= f; applyItem(objOf(sel), it); commit(); updateSel(); syncFields(); } }
  else if (e.code === 'PageUp' || e.code === 'PageDown') { if (sel >= 0) { map.items[sel].y = (map.items[sel].y || 0) + (e.code === 'PageUp' ? 0.5 : -0.5); applyItem(objOf(sel), map.items[sel]); commit(); updateSel(); syncFields(); } }
  else if (e.code.startsWith('Arrow') && sel >= 0 && !selStart) { e.preventDefault(); const s = snap || 1, it = map.items[sel]; if (e.code === 'ArrowLeft') it.x -= s; if (e.code === 'ArrowRight') it.x += s; if (e.code === 'ArrowUp') it.z -= s; if (e.code === 'ArrowDown') it.z += s; applyItem(objOf(sel), it); commit(); updateSel(); syncFields(); }
  else if (e.code === 'KeyG') { const o = [0, 1, 3, 6]; snap = o[(o.indexOf(snap) + 1) % o.length]; $('snap').value = snap; rebuild(); }
  else if (e.code === 'KeyJ') { joinSnap = !joinSnap; $('jsnap').classList.toggle('on', joinSnap); } else if (e.code === 'KeyT') toggleTop(); else if (e.code === 'KeyF' && sel >= 0) { cam.tx = map.items[sel].x; cam.tz = map.items[sel].z; }
});
function toggleTop() { cam.top = !cam.top; $('view').classList.toggle('on', cam.top); $('view').textContent = cam.top ? 'Perspective' : 'Top view'; }
$('jsnap').classList.add('on'); $('jsnap').onclick = () => { joinSnap = !joinSnap; $('jsnap').classList.toggle('on', joinSnap); }; $('view').onclick = toggleTop; $('snap').onchange = () => { snap = +$('snap').value; rebuild(); }; $('undo').onclick = undo; $('redo').onclick = redo;
// ---------------- file ops ----------------
function refreshOpen() { const l = listMaps(); $('open').innerHTML = `<option value="">Open map…</option>` + l.map((n) => `<option>${n}</option>`).join(''); }
refreshOpen();
function doSave() { if (!saveMap(map)) { alert('Could not save (browser storage blocked or full)'); return false; } dirty = false; refreshOpen(); hint('Saved “' + map.name + '”'); return true; }
function doDeleteCurrentMap() {
  const target = map.name;
  if (!confirm(`Permanently delete map “${target}”?`)) return;
  deleteMap(target);
  refreshOpen();
  hint(`Deleted map “${target}”`);
  map = emptyMap('My map');
  sel = -1;
  selStart = false;
  hist = [snapshot()];
  rebuild();
  refreshInspector();
}
function doDeleteMapDialog() {
  const maps = listMaps();
  if (!maps.length) { alert('No saved custom maps to delete.'); return; }
  const dlg = document.createElement('div');
  dlg.style.cssText = 'position:fixed;inset:0;z-index:20;background:rgba(5,8,14,.7);display:flex;align-items:center;justify-content:center';
  const renderDlg = () => {
    const curMaps = listMaps();
    if (!curMaps.length) { dlg.remove(); refreshOpen(); return; }
    dlg.innerHTML = `<div class="side" style="position:static;width:min(360px,92vw);height:auto">
      <h4 style="margin-top:0">Delete a Map</h4>
      <div style="font:500 12px var(--ui);color:var(--dim);margin-bottom:10px">Choose a saved custom map to permanently remove:</div>
      <div class="f">Map<select id="seldel" style="width:100%">${curMaps.map((n) => `<option value="${n}" ${n === map.name ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="me-btn" id="delok" style="color:#ff6666;border-color:rgba(255,80,80,.4);flex:1">Delete Permanently</button>
        <button class="me-btn" id="delcancel">Cancel</button>
      </div>
    </div>`;
    dlg.querySelector('#delcancel').onclick = () => dlg.remove();
    dlg.querySelector('#delok').onclick = () => {
      const target = dlg.querySelector('#seldel').value;
      if (!target) return;
      if (!confirm(`Permanently delete map “${target}”?`)) return;
      deleteMap(target);
      refreshOpen();
      hint(`Deleted map “${target}”`);
      if (map.name === target) {
        map = emptyMap('My map');
        sel = -1;
        selStart = false;
        hist = [snapshot()];
        rebuild();
        refreshInspector();
      }
      renderDlg();
    };
  };
  renderDlg();
  document.body.appendChild(dlg);
}
$('save').onclick = doSave;
const topDelBtn = $('delmap');
if (topDelBtn) topDelBtn.onclick = doDeleteMapDialog;
$('new').onclick = () => { if (map.items.length && !confirm('Discard the current map?')) return; map = emptyMap('My map'); sel = -1; selStart = false; hist = [snapshot()]; rebuild(); refreshInspector(); };
$('open').onchange = () => { const n = $('open').value; if (!n) return; const m = loadMap(n); if (m) { map = m; sel = -1; selStart = false; hist = [snapshot()]; rebuild(); refreshInspector(); } $('open').value = ''; };
$('exp').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(map, null, 1)], { type: 'application/json' })); a.download = map.name.replace(/[^\w.-]+/g, '_') + '.mtsmap.json'; a.click(); };
$('imp').onclick = () => $('file').click();
$('file').onchange = async () => { const f = $('file').files[0]; if (!f) return; try { const m = JSON.parse(await f.text()); if (!Array.isArray(m.items)) throw 0; map = { ...emptyMap(m.name || 'Imported'), ...m }; sel = -1; hist = [snapshot()]; rebuild(); refreshInspector(); } catch (e) { alert('Not a valid map file'); } $('file').value = ''; };
$('play').onclick = () => { if (doSave()) location.href = 'index.html?' + new URLSearchParams({ map: 'kit', kitmap: map.name, go: '1', free: '1' }); };
$('gen').onclick = () => {
  const dlg = document.createElement('div'); dlg.style.cssText = 'position:fixed;inset:0;z-index:20;background:rgba(5,8,14,.7);display:flex;align-items:center;justify-content:center';
  const renderDlg = () => {
    const maps = listMaps();
    const mapOpts = maps.length ? maps.map((n) => `<option value="${n}">${n}</option>`).join('') : '<option value="" disabled>(No saved maps)</option>';
    dlg.innerHTML = `<div class="side" style="position:static;width:min(400px,92vw);height:auto">
      <h4>Generate a map</h4>
      <div class="f">Style<select id="gs">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="f">Size<select id="gz">${[200, 300, 400, 600, 800].map((s) => `<option ${s === map.size ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="f">Density<input type="range" id="gd" min="0.1" max="1" step="0.05" value="0.5"></div>
      <div class="f">Seed<input type="number" id="gseed" value="${Math.floor(Math.random() * 9999)}"></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="me-btn go" id="gok">Generate</button>
        <button class="me-btn" id="gcancel">Cancel</button>
      </div>
      <div style="margin-top:6px;font:500 11px var(--ui);color:var(--dim)">Replaces the current pieces (undo with Ctrl+Z). Tweak the result afterwards.</div>
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:10px">
        <h4 style="margin:0 0 8px">Saved Maps</h4>
        <div style="display:flex;gap:6px;align-items:center">
          <select id="gdelmap" style="flex:1">${mapOpts}</select>
          <button class="me-btn" id="bdelmap" ${maps.length ? '' : 'disabled'} style="color:#ff6666;border-color:rgba(255,80,80,.4)">Delete</button>
        </div>
      </div>
    </div>`;
    dlg.querySelector('#gcancel').onclick = () => dlg.remove();
    dlg.querySelector('#gok').onclick = () => {
      const g = generateMap(kit, { seed: +dlg.querySelector('#gseed').value || 1, style: dlg.querySelector('#gs').value, size: +dlg.querySelector('#gz').value, density: +dlg.querySelector('#gd').value, name: map.name });
      map = g; sel = -1; selStart = false; cam.tx = 0; cam.tz = 0; cam.dist = g.size * 0.8; commit(); rebuild(); refreshInspector(); dlg.remove(); hint(g.items.length + ' pieces generated');
    };
    const delBtn = dlg.querySelector('#bdelmap');
    if (delBtn) {
      delBtn.onclick = () => {
        const target = dlg.querySelector('#gdelmap').value;
        if (!target) return;
        if (!confirm(`Permanently delete map “${target}”?`)) return;
        deleteMap(target);
        refreshOpen();
        hint(`Deleted map “${target}”`);
        if (map.name === target) {
          map = emptyMap('My map');
          sel = -1;
          selStart = false;
          hist = [snapshot()];
          rebuild();
          refreshInspector();
        }
        renderDlg();
      };
    }
  };
  renderDlg();
  document.body.appendChild(dlg);
};
function hint(msg) { $('hint').textContent = msg || (place ? 'Click to place · Q/E rotate · [ ] scale · right-click / Esc to stop' : 'Click a piece to select · drag to move · Q/E rotate (Shift 90°, Alt 1°) · [ ] scale · PgUp/PgDn raise · J join-snap · Ctrl+D duplicate · Del · Ctrl+Z undo · G snap · T top view · right-drag orbit · wheel zoom'); if (msg) setTimeout(() => hint(), 2500); }
addEventListener('beforeunload', (e) => { if (dirty && map.items.length) { e.preventDefault(); e.returnValue = ''; } });
window.__edit = { get map() { return map; }, cam, kit };
drawPalette(); rebuild(); refreshInspector(); hint();
(function loop() { placeCamera(); renderer.render(scene, camera); requestAnimationFrame(loop); })();
