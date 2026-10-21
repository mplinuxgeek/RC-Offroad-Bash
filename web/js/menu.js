import * as THREE from 'three';
import { loadManifest, manifest } from './assets.js';
import { garage, credits } from './garage.js';
import * as Up from './upgrades.js';
import { KIT_BUILDER, listMaps, BUILTIN, loadKit, buildTerrainMesh, makeModule, applyItem, buildCaps, getMap as kitGetMap, terrainOf } from './kit.js';
import { startWizard, getMap, read as readMap, clearMap, firstPad } from './padmap.js';
import { envTex, LOWQ, POTATO, TRUCK_LOD, LOD_MODE } from './gfx.js';
import { createPerf } from './perf.js';
import { TYRE_ART_LIST } from './rctruck.js';
import { buildTruckVisual, syncTruck } from './truck.js';
import { MonsterTruck, loadTruckSpheres } from './mt_physics.js';
import { TRUCKS, truckId, tkey } from './trucks.js';

// Modern main menu: HTML/CSS UI over a live 3D showcase of the truck (original meshes, original skins).
const q = new URLSearchParams(location.search);
const store = { get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
await loadManifest();
document.getElementById('hud')?.remove(); document.getElementById('pick')?.remove(); document.getElementById('c')?.remove(); document.getElementById('fs')?.remove();
const mapIds = [...Object.keys(BUILTIN), ...(KIT_BUILDER ? listMaps().map((n) => 'user:' + n) : [])]; let mapI = Math.max(0, mapIds.indexOf(store.get('mts_map', 'builtin:bmx')));
const mapTitle = (id) => (BUILTIN[id] ? BUILTIN[id].title : id.slice(5));
const lsOne = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const opt = { quality: ['potato', 'low', 'high'].includes(lsOne('mts_quality')) ? lsOne('mts_quality') : 'auto', lod: LOD_MODE, dbg: lsOne('mts_debug') === '1' ? 1 : 0, damage: +store.get('mts_damage', '3'), stab: +store.get(tkey('mts_stab'), '2'), key_layout: store.get('mts_key_layout', 'arrows') };

const PALETTE_16 = [
  ['#e02424', 'Red'],
  ['#be123c', 'Crimson'],
  ['#ea580c', 'Orange'],
  ['#f59e0b', 'Amber'],
  ['#eab308', 'Yellow'],
  ['#84cc16', 'Lime'],
  ['#16a34a', 'Green'],
  ['#0d9488', 'Teal'],
  ['#06b6d4', 'Cyan'],
  ['#0284c7', 'Sky Blue'],
  ['#2563eb', 'Royal Blue'],
  ['#7c3aed', 'Purple'],
  ['#db2777', 'Pink'],
  ['#f8fafc', 'White'],
  ['#64748b', 'Gunmetal'],
  ['#0f172a', 'Midnight Black']
];

const PALETTE_8 = [
  ['#0f172a', 'Black'],
  ['#64748b', 'Gunmetal'],
  ['#f8fafc', 'Silver / White'],
  ['#e02424', 'Red'],
  ['#f59e0b', 'Gold / Amber'],
  ['#2563eb', 'Blue'],
  ['#16a34a', 'Green'],
  ['#7c3aed', 'Purple']
];

let customBody = store.get(tkey('mts_custom_color_body'), '#e02424');
let customStripe = store.get(tkey('mts_custom_color_stripe'), '#f8fafc');
let customLink = store.get(tkey('mts_custom_color_link'), '#1e293b');
let customSpring = store.get(tkey('mts_custom_color_spring'), '#f59e0b');
let customTyre = store.get(tkey('mts_tyre_art'), 'none');

// ---------- DOM ----------
const css = document.createElement('style'); css.textContent = `
#scene{position:fixed;inset:0;width:100%;height:100%;display:block}
#bgfx{position:fixed;inset:0;background:radial-gradient(ellipse at 70% 45%,#243049 0%,#121827 45%,#080a10 100%);z-index:-1}
#menu{position:fixed;inset:0;display:flex;align-items:flex-start;pointer-events:none;padding:5vh 0 0 5vh;box-sizing:border-box}
.card{pointer-events:auto;max-height:calc(100dvh - 16px);overflow-y:auto;overscroll-behavior:contain;width:min(460px,100%);background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:26px 26px 22px;backdrop-filter:blur(14px);box-shadow:0 20px 60px rgba(0,0,0,.45)}
.brand{font:700 15px var(--hud);letter-spacing:.32em;color:var(--accent);text-transform:uppercase}
h1{margin:2px 0 0;font:700 clamp(44px,7vw,68px)/.9 var(--hud);text-transform:uppercase;letter-spacing:.01em;background:linear-gradient(180deg,#fff 20%,#c9d3e6);-webkit-background-clip:text;background-clip:text;color:transparent}
h1 b{color:var(--accent);-webkit-text-fill-color:var(--accent)}
.sub{margin:6px 0 18px;color:var(--dim);font:500 13px var(--ui);letter-spacing:.04em}
.sel{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:14px;padding:10px}
.sel .name{flex:1;text-align:center;min-width:0}
.sel .name div:first-child{font:700 26px/1.05 var(--hud);text-transform:uppercase;letter-spacing:.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sel .name div:last-child{font:500 12px var(--ui);color:var(--dim);margin-top:3px}
.arrow{width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--text);font:600 18px var(--ui);cursor:pointer;transition:.15s}
.arrow:hover{background:rgba(255,255,255,.14)}
.desc{margin:12px 2px 6px;color:#c8d1e0;font:500 14px/1.4 var(--ui);min-height:2.8em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.chips{display:flex;gap:8px;margin:4px 0 16px;flex-wrap:wrap}
.chip{font:600 12px var(--ui);letter-spacing:.06em;text-transform:uppercase;padding:5px 10px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid var(--line);color:#dbe3f0}
.chip b{color:var(--accent2)}
.btn{display:block;width:100%;border:0;border-radius:14px;padding:15px 18px;font:700 22px var(--hud);letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:transform .12s,background .15s,box-shadow .15s;color:#fff}
.btn:active{transform:scale(.98)}
.go{background:linear-gradient(135deg,#ff9a2e,#ff6a00);box-shadow:0 8px 24px rgba(255,120,0,.35)}
.go:hover{box-shadow:0 10px 30px rgba(255,120,0,.55)}
.alt{margin-top:10px;background:rgba(255,255,255,.09);border:1px solid var(--line)}
.alt:hover{background:rgba(255,255,255,.17)}
.row{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px}
.row .btn{font-size:17px;padding:12px;background:rgba(255,255,255,.06);border:1px solid var(--line);letter-spacing:.1em}
.row .btn:hover{background:rgba(255,255,255,.15)}
.hint{margin-top:14px;color:var(--dim);font:500 12px var(--ui);text-align:center}
.hint kbd{font:600 11px var(--ui);padding:2px 6px;border-radius:5px;border:1px solid var(--line);background:rgba(255,255,255,.06)}
#opts{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,7,12,.6);backdrop-filter:blur(6px);z-index:5}
#opts.on{display:flex}
#opts .card{width:min(520px,92vw);max-height:92vh;overflow:auto}
#opts h2{margin:0 0 14px;font:700 30px var(--hud);letter-spacing:.1em;text-transform:uppercase}
.orow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-top:1px solid var(--line)}
.orow label{font:600 15px var(--ui);color:#e6ecf7}
.seg{display:flex;background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.seg button{background:none;border:0;color:var(--dim);font:600 13px var(--ui);padding:8px 11px;cursor:pointer;letter-spacing:.04em}
.seg button.on{background:var(--accent);color:#fff}
.sw{display:flex;gap:8px}.sw button{width:28px;height:28px;border-radius:50%;border:2px solid transparent;cursor:pointer;outline:1px solid var(--line)}
.sw button.on{border-color:#fff}
.tsel{display:flex;align-items:center;gap:10px;margin:0 0 12px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.04)}.tsel .arrow{width:34px;height:34px;font-size:14px;flex:none}.tn{flex:1;font:600 15px var(--ui);color:#fff;white-space:nowrap}.tn .tl{color:var(--dim);font-size:11px;letter-spacing:.14em;margin-right:6px}.tn b{font-weight:700}
@media (max-width:760px){.tsel{gap:6px}.tsel .tl{display:none}#menu{align-items:flex-end;padding:0 10px 10px}.card{padding:16px 16px 14px;border-radius:16px}h1{font-size:42px}.sub{margin-bottom:10px}.desc{min-height:0;-webkit-line-clamp:2;font-size:13px}.hint{display:none}.btn{padding:12px}.chips{margin-bottom:10px}}
@media (max-height:820px){.sub{margin-bottom:8px}.card{padding:16px 20px 14px}.btn{padding:10px}.tsel{margin-bottom:8px}.chips{margin-bottom:8px}h1{font-size:40px}}
@media (max-height:620px) and (min-width:761px){.desc{-webkit-line-clamp:2;min-height:0}.sub{margin-bottom:8px}.card{padding:16px 20px}}`;
document.head.appendChild(css);
document.body.insertAdjacentHTML('beforeend', `<div id="bgfx"></div><canvas id="scene"></canvas>
<div id="menu">
  <!-- Main Menu View -->
  <div class="card" id="main-view">
    <h1>RC Offroad <b>Bash</b></h1><div class="sub">Custom Physics &amp; FreeCAD Visuals</div>
    <div class="tsel" id="tsel"><button class="arrow" id="tprev" aria-label="Previous truck">◀</button><div class="tn"><span class="tl">TRUCK</span> <b id="tname"></b></div><button class="arrow" id="tnext" aria-label="Next truck">▶</button></div>
    <div class="tsel" id="msel"><button class="arrow" id="mprev" aria-label="Previous map">◀</button><div class="tn"><span class="tl">MAP</span> <b id="mname"></b></div><div class="chips" id="mcount" style="margin:0"></div><button class="arrow" id="mnext" aria-label="Next map">▶</button></div>
    <div class="desc" id="sdesc"></div><div class="chips" id="chips"></div>
    <button class="btn go" id="race">Race</button>
    <button class="btn alt" id="free">Free roam</button>
    <button class="btn alt" id="fstyle">Freestyle · 2:00</button>
    <button class="btn alt" id="gbtn">Garage <span id="cr" class="cr"></span></button>
    <div class="row"><button class="btn" id="medit">Map editor</button><button class="btn" id="options">Options</button></div>
    <div class="tsel" style="margin:12px 0 0"><div class="tn" style="display:flex;align-items:center;justify-content:space-between;width:100%"><span class="tl">TRUCK BODY</span><div style="display:flex;align-items:center;gap:8px"><button class="chip" id="tbody-btn" style="cursor:pointer;user-select:none">Body: On</button><button class="chip" id="tlights-btn" style="cursor:pointer;user-select:none">Lights: Off</button></div></div></div>
    <div class="hint" id="mhint"><kbd>←</kbd> <kbd>→</kbd> map &nbsp; <kbd>P</kbd> paint &nbsp; <kbd>B</kbd> body &nbsp; <kbd>Enter</kbd> race &nbsp; <kbd>F</kbd> free roam &nbsp; <kbd>S</kbd> freestyle &nbsp; <kbd>G</kbd> garage &nbsp; <kbd>C</kbd> controller &nbsp; <kbd>O</kbd> options</div>
  </div>
</div>
<div id="opts"><div class="card"><h2>Options</h2><div id="olist"></div><button class="btn alt" id="opad" style="margin-top:10px">Map controller…</button><button class="btn go" id="oclose" style="margin-top:14px">Done</button></div></div>`);
const $ = (id) => document.getElementById(id);

// ---------- 3D showcase ----------
const canvas = $('scene'), renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOWQ, alpha: true, stencil: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.setPixelRatio(POTATO ? (parseFloat(q.get('rs')) || 0.5) : Math.min(devicePixelRatio || 1, LOWQ ? 1 : 2)); const perf = createPerf(renderer); opt.fps = perf.isOn() ? 1 : 0;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x202838, 1.1)); const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 6, 5); scene.add(key); const rim = new THREE.DirectionalLight(0xff8a1f, 1.6); rim.position.set(-5, 3, -4); scene.add(rim);
await loadTruckSpheres(); const truck = new MonsterTruck(null); truck.place([0, 0, 0], 0);
const vis = await buildTruckVisual({ lod: TRUCK_LOD }); const mir = new THREE.Group(); mir.add(vis.root); scene.add(mir);

// The reflection is stencil-clipped to the inner part of the disk so it cannot spill past the rim.
// Collected on each call: tyre art decals are rebuilt at runtime and carry fresh materials.
const setMirrorStencil = (on) => { const mirMats = new Set(); vis.root.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => mirMats.add(m)); }); mirMats.forEach((m) => { m.stencilWrite = on; m.stencilFunc = THREE.EqualStencilFunc; m.stencilRef = 1; m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp; }); };
// Black reflective disk under the truck: opaque disk, then the truck drawn upside down through the floor, then a translucent disk dimming the reflection.
const diskScene = new THREE.Scene(), diskU = { uBase: { value: 1 } };
const disk = new THREE.Mesh(new THREE.CircleGeometry(4, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: diskU, transparent: true, depthTest: false, depthWrite: false, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp,
  vertexShader: 'varying vec2 p; void main(){ p = position.xz / 4.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'varying vec2 p; uniform float uBase; void main(){ float r = length(p); if (uBase > 0.5 && r > 0.8) discard; float e = 1.0 - smoothstep(0.6, 1.0, r); gl_FragColor = vec4(0.0, 0.0, 0.0, mix(e * (0.4 + 0.5 * r), e, uBase)); }' }));
disk.position.y = 0.005; diskScene.add(disk);

// Track preview: separate scene drawn first, depth cleared, then the truck scene on top. Camera orbits near the start line so only part of the track shows.
const bgScene = new THREE.Scene(), bgCam = new THREE.PerspectiveCamera(50, 1, 0.5, 900); bgScene.fog = new THREE.FogExp2(0x121827, 0.007);
bgScene.add(new THREE.AmbientLight(0xffffff, 0.9)); const bgSun = new THREE.DirectionalLight(0xffe2b8, 1.1); bgSun.position.set(0.5, 1, 0.3); bgScene.add(bgSun);
let bgWorld = null, bgTok = 0, bgFocus = { x: 0, y: 0, z: 0, yaw: 0 };
const bgPhase = Math.random() * Math.PI * 2, bgPick = Math.random(); // new orbit angle and track spot on each page load
function bgClear() { if (!bgWorld) return; bgWorld.traverse((o) => { if (o.userData.own) { o.geometry.dispose(); o.material.dispose && o.material.dispose(); } }); bgScene.remove(bgWorld); bgWorld = null; }
async function bgLoad(id) {
  const tok = ++bgTok; let map = null; try { map = kitGetMap(id); } catch (e) {} if (!map) { bgClear(); return; }
  const kit = await loadKit(); if (tok !== bgTok) return; bgClear();
  const w = new THREE.Group(), T = terrainOf(map), st = map.start || { x: 0, z: 0, yaw: 0 };
  const gt = kit.tgrass.clone(); gt.needsUpdate = true; gt.repeat.set(1200 / kit.gscale, 1200 / kit.gscale); gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 })); ground.userData.own = true; ground.position.y = -0.06; w.add(ground);
  const tm = buildTerrainMesh(kit, map); if (tm) { tm.traverse((o) => { if (o.isMesh) o.userData.own = true; }); w.add(tm); }
  for (const it of map.items || []) { if (!kit.geos.has(it.m)) continue; const o = makeModule(kit, it.m, { shadows: false }); applyItem(o, it); w.add(o); }
  w.add(buildCaps(kit, map.items || []));
  const its = (map.items || []).filter((it) => kit.geos.has(it.m)), at = its.length ? its[Math.floor(bgPick * its.length)] : st;
  bgFocus = { x: at.x, y: T ? T.heightAt(at.x, at.z) : 0, z: at.z, yaw: st.yaw || 0 }; bgWorld = w; bgScene.add(w);
}
function bgUpdate(t) {
  const f = bgFocus, a = bgPhase + t * 0.04;
  bgCam.position.set(f.x + Math.sin(a) * 45, f.y + 32, f.z + Math.cos(a) * 45); bgCam.lookAt(f.x, f.y + 1, f.z);
}
let showBody = store.get(tkey('mts_show_body'), '1') !== '0';
const updateBodyVis = (on) => {
  showBody = !!on;
  store.set(tkey('mts_show_body'), showBody ? '1' : '0');
  opt.body = showBody ? 1 : 0;
  vis.setBodyVisible(showBody);
  const btn = $('tbody-btn');
  if (btn) btn.textContent = showBody ? 'Body: On' : 'Body: Off';
  if ($('opts').classList.contains('on')) drawOpts();
};
updateBodyVis(showBody);
$('tbody-btn').onclick = () => updateBodyVis(!showBody);
let lightsOn = store.get(tkey('mts_lights'), '0') === '1';
const updateLights = (on) => {
  lightsOn = !!on;
  store.set(tkey('mts_lights'), lightsOn ? '1' : '0');
  opt.lights = lightsOn ? 1 : 0;
  if (vis.setLights) vis.setLights(lightsOn);
  const btn = $('tlights-btn');
  if (btn) btn.textContent = lightsOn ? 'Lights: On' : 'Lights: Off';
  if ($('opts').classList.contains('on')) drawOpts();
};
updateLights(lightsOn);
$('tlights-btn').onclick = () => updateLights(!lightsOn);
if (!vis.setLights) $('tlights-btn').style.display = 'none';
try { const env = envTex(); const rt = new THREE.PMREMGenerator(renderer).fromEquirectangular(env); scene.environment = rt.texture; scene.environmentIntensity = 0.8; } catch (e) {}

function applyBodyColor(hex, name) {
  customBody = hex;
  store.set(tkey('mts_custom_color_body'), hex);
  vis.setBodyColor(hex);
  const curItem = PALETTE_16.find((c) => c[0].toLowerCase() === hex.toLowerCase());
  const label = name || (curItem ? curItem[1] : hex);
  const el = $('body-color-name'); if (el) el.textContent = label;
  document.querySelectorAll('.body-color-btn').forEach((b) => b.classList.toggle('on', b.dataset.hex?.toLowerCase() === hex.toLowerCase()));
}

function applyStripeColor(hex, name) {
  customStripe = hex;
  store.set(tkey('mts_custom_color_stripe'), hex);
  vis.setStripeColor(hex);
  const curItem = PALETTE_16.find((c) => c[0].toLowerCase() === hex.toLowerCase());
  const label = name || (curItem ? curItem[1] : hex);
  const el = $('stripe-color-name'); if (el) el.textContent = label;
  document.querySelectorAll('.stripe-color-btn').forEach((b) => b.classList.toggle('on', b.dataset.hex?.toLowerCase() === hex.toLowerCase()));
}

function applyLinkColor(hex, name) {
  customLink = hex;
  store.set(tkey('mts_custom_color_link'), hex);
  vis.setLinkColor(hex);
  const curItem = PALETTE_8.find((c) => c[0].toLowerCase() === hex.toLowerCase());
  const label = name || (curItem ? curItem[1] : hex);
  const el = $('link-color-name'); if (el) el.textContent = label;
  document.querySelectorAll('.link-color-btn').forEach((b) => b.classList.toggle('on', b.dataset.hex?.toLowerCase() === hex.toLowerCase()));
}

function applyTyreArt(id) {
  customTyre = id;
  store.set(tkey('mts_tyre_art'), id);
  if (vis.setTyreArt) vis.setTyreArt(id);
}

function applySpringColor(hex, name) {
  customSpring = hex;
  store.set(tkey('mts_custom_color_spring'), hex);
  vis.setSpringColor(hex);
  const curItem = PALETTE_8.find((c) => c[0].toLowerCase() === hex.toLowerCase());
  const label = name || (curItem ? curItem[1] : hex);
  const el = $('spring-color-name'); if (el) el.textContent = label;
  document.querySelectorAll('.spring-color-btn').forEach((b) => b.classList.toggle('on', b.dataset.hex?.toLowerCase() === hex.toLowerCase()));
}

function renderColorPickerGrid(container, palette, currentHex, onPick, extraClass = '') {
  if (!container) return;
  container.innerHTML = '';
  palette.forEach(([hex, name]) => {
    const b = document.createElement('button');
    b.style.backgroundColor = hex;
    b.title = name;
    b.dataset.hex = hex;
    if (extraClass) b.classList.add(extraClass);
    if (currentHex && currentHex.toLowerCase() === hex.toLowerCase()) b.classList.add('on');
    b.onclick = () => onPick(hex, name);
    container.appendChild(b);
  });
}

// Initialize custom colors
applyBodyColor(customBody);
applyStripeColor(customStripe);
applyLinkColor(customLink);
applySpringColor(customSpring);
applyTyreArt(customTyre);

const updateTruckUpgrades = () => {
  const st = Up.load();
  if (vis.setShockTier) vis.setShockTier(st.own?.shocks || 0);
  else if (vis.setDualSprings) vis.setDualSprings((st.own?.shocks || 0) >= 1);
};
updateTruckUpgrades();

const paintApi = {
  sections: () => [
    { label: 'Body paint', palette: PALETTE_16, cur: () => customBody, set: applyBodyColor, name: () => (PALETTE_16.find((c) => c[0].toLowerCase() === customBody.toLowerCase()) || [0, customBody])[1] },
    { label: 'Trim, stripes & decals', palette: PALETTE_16, cur: () => customStripe, set: applyStripeColor, name: () => (PALETTE_16.find((c) => c[0].toLowerCase() === customStripe.toLowerCase()) || [0, customStripe])[1] },
    { label: 'Suspension links & crossbars', palette: PALETTE_8, cur: () => customLink, set: applyLinkColor, name: () => (PALETTE_8.find((c) => c[0].toLowerCase() === customLink.toLowerCase()) || [0, customLink])[1] },
    { label: 'Shock springs', palette: PALETTE_8, cur: () => customSpring, set: applySpringColor, name: () => (PALETTE_8.find((c) => c[0].toLowerCase() === customSpring.toLowerCase()) || [0, customSpring])[1] },
    { label: 'Tyre sidewall art', text: true, palette: TYRE_ART_LIST, cur: () => customTyre, set: applyTyreArt, name: () => (TYRE_ART_LIST.find((c) => c[0] === customTyre) || [0, 'No art'])[1] },
  ],
  bodyOn: () => showBody,
  toggleBody: () => updateBodyVis(!showBody),
  hasLights: !!vis.setLights,
  lightsOn: () => lightsOn,
  toggleLights: () => updateLights(!lightsOn),
};
const setPaintMode = (on) => { if (on) garage.open(refreshCr, paintApi, 'paint'); };

{ const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.01; scene.add(m); }
let wide = true;
function resize() { const W = innerWidth, H = innerHeight; renderer.setSize(W, H, false); bgCam.aspect = W / H; bgCam.updateProjectionMatrix(); camera.aspect = W / H; wide = W / H > 1.1; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let yaw = 0.7, pitch = 0, zoom = 1, panX = 0, panY = 0, auto = true, autoT = 0;
const ptrs = new Map(), clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
let pinch = 0;
canvas.style.touchAction = 'none';
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey });
  auto = false; clearTimeout(autoT); if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch = Math.hypot(p.x - q.x, p.y - q.y); }
});
const endPtr = (e) => { if (ptrs.delete(e.pointerId) && !ptrs.size) { clearTimeout(autoT); autoT = setTimeout(() => (auto = true), 2500); } };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) zoom = clamp(zoom * pinch / d, 0.35, 1.8); pinch = d;
  } else if (p.pan) { panX += dx * 0.012 * zoom; panY -= dy * 0.012 * zoom; panX = clamp(panX, -6, 6); panY = clamp(panY, -3, 3); }
  else { yaw += dx * 0.01; pitch = clamp(pitch + dy * 0.005, -0.15, 0.9); }
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = clamp(zoom * Math.exp(e.deltaY * 0.001), 0.35, 1.8); }, { passive: false });
let last = performance.now(), tt = 0;
(function loop(now) {
  perf.begin(now);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; tt += dt; if (auto) { yaw += dt * 0.35; const e = Math.min(1, dt * 4); zoom += (1 - zoom) * e; pitch -= pitch * e; panX -= panX * e; panY -= panY * e; }
  truck.q.set(0, 0, 0, 1); truck.p.set(0, 0, 0); truck.v.set(Math.sin(tt * 1.3) * 0.2, 0, 0); truck.w.set(0, 0, 0);
  for (const w of truck.wheels) { w.contact = true; w.comp = truck.sag0; } // resting on the ground at static sag, so the axles are not drawn drooped as if airborne
  syncTruck(vis, truck, dt); vis.root.position.set(0, 0.02, 0); vis.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  { const k = Math.min(zoom, 1), tx = (wide ? -3.2 : 0) * k + panX, ty = 0.4 + ((wide ? 0.9 : -0.4) - 0.4) * k + panY, ox = 0, oy = (wide ? 3.4 : 3.8) - (wide ? 0.9 : -0.4), oz = wide ? 11.5 : 15.5;
    const r = Math.hypot(oy, oz) * zoom, a = Math.atan2(oy, oz) + pitch;
    camera.position.set(panX + ox, ty + Math.sin(a) * r, Math.cos(a) * r); camera.lookAt(tx, ty, 0); }
  renderer.autoClear = false; renderer.clear(); if (bgWorld) { bgUpdate(tt); renderer.render(bgScene, bgCam); renderer.clearDepth(); } diskU.uBase.value = 1; disk.material.stencilWrite = true; renderer.render(diskScene, camera); disk.material.stencilWrite = false; renderer.clearDepth();
  setMirrorStencil(true); mir.scale.y = -1; renderer.render(scene, camera); mir.scale.y = 1; setMirrorStencil(false); renderer.clearDepth();
  diskU.uBase.value = 0; renderer.render(diskScene, camera); renderer.clearDepth();
  renderer.render(scene, camera); perf.end(); requestAnimationFrame(loop);
})(last);

const step = (d) => pickMap(mapI + d);

function pickMap(i) {
  mapI = (i + mapIds.length) % mapIds.length; const id = mapIds[mapI]; store.set('mts_map', id); bgLoad(id).catch(() => {});
  $('mname').textContent = mapTitle(id); $('mcount').innerHTML = `<span class="chip">${mapI + 1} / ${mapIds.length}</span>`;
  $('sdesc').textContent = BUILTIN[id] ? BUILTIN[id].desc : 'Your own map from the map editor. Free roam.'; $('chips').innerHTML = '<span class="chip">Free roam</span>';
}
// Truck choice is read at load (physics, rig, spheres), so switching saves it and reloads.
{ const ti = Math.max(0, TRUCKS.findIndex((t) => t[0] === truckId())); $('tname').textContent = TRUCKS[ti][1];
  const pickTruck = (d) => { const id = TRUCKS[(ti + d + TRUCKS.length) % TRUCKS.length][0]; try { localStorage.setItem('mts_truck', id); } catch (e) {} const u = new URL(location.href); u.searchParams.delete('truck'); location.href = u.toString(); };
  $('tprev').onclick = () => pickTruck(-1); $('tnext').onclick = () => pickTruck(1); }
$('mprev').onclick = () => pickMap(mapI - 1); $('mnext').onclick = () => pickMap(mapI + 1);
const goMap = (e, mode = 'race') => {
  const id = mapIds[mapI];
  const p = new URLSearchParams({ map: 'kit', kitmap: id.startsWith('user:') ? id.slice(5) : id, go: '1' });
  if (customBody) p.set('body_color', customBody);
  if (customStripe) p.set('stripe_color', customStripe);
  if (customLink) p.set('link_color', customLink);
  if (customSpring) p.set('spring_color', customSpring);
  if (customTyre) p.set('tyre_art', customTyre);
  if (mode) p.set('mode', mode);
  if (mode === 'free') p.set('free', '1');
  location.search = p.toString();
  return true;
};
$('race').onclick = (e) => goMap(e, 'race'); $('free').onclick = (e) => goMap(e, 'free'); $('fstyle').onclick = (e) => goMap(e, 'freestyle'); $('medit').onclick = () => { location.href = 'mapedit.html'; };

// Quality and truck detail are fixed at startup: save the choice, drop a conflicting ?q= parameter and reload with the options card reopened.
function gfxChange(key, v, clear = []) {
  try { if (v === 'auto') localStorage.removeItem(key); else localStorage.setItem(key, v); clear.forEach((k) => localStorage.removeItem(k)); sessionStorage.setItem('mts_reopen_opts', String(orow)); } catch (e) {}
  if (key === 'mts_quality' && q.has('q')) { q.delete('q'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '')); }
  location.reload();
}
const OPTS = [
  { label: 'Truck body', key: 'body', items: [['On', 1], ['Off', 0]], save: (v) => updateBodyVis(v === 1) },
  ...(vis.setLights ? [{ label: 'Truck lights', key: 'lights', items: [['On', 1], ['Off', 0]], save: (v) => updateLights(v === 1) }] : []),
  { label: 'Quality', key: 'quality', items: [['Auto', 'auto'], ['Potato', 'potato'], ['Low', 'low'], ['High', 'high']], save: (v) => gfxChange('mts_quality', v) },
  { label: 'Truck detail', key: 'lod', items: [['Auto', 'auto'], ['High', 'high'], ['Medium', 'medium'], ['Low', 'low']], save: (v) => { gfxChange('mts_lod', v, ['mts_lod_auto']); } },
  { label: 'FPS counter', key: 'fps', items: [['On', 1], ['Off', 0]], save: (v) => perf.set(v === 1) },
  { label: 'Debug log', key: 'dbg', items: [['On', 1], ['Off', 0]], save: (v) => store.set('mts_debug', v) },
  { label: 'Keyboard layout', key: 'key_layout', items: [['Arrows', 'arrows'], ['WASD', 'wasd']], save: (v) => { store.set('mts_key_layout', v); updateHints(); } },
  { label: 'Damage', key: 'damage', items: [['Fragile', 0], ['Normal', 1], ['Tough', 3], ['Off', 2]], save: (v) => store.set('mts_damage', v) },
  { label: 'Stability', key: 'stab', items: [['Max', 0], ['High', 1], ['Normal', 2], ['Low', 3], ['Min', 4]], save: (v) => store.set(tkey('mts_stab'), v) },
];
function drawOpts() {
  const L = $('olist'); L.innerHTML = '';
  for (const o of OPTS) {
    const row = document.createElement('div');
    row.className = 'orow';
    row.innerHTML = `<label>${o.label}</label>`;
    const box = document.createElement('div');
    box.className = 'seg';
    o.items.forEach(([t, v]) => {
      const b = document.createElement('button');
      b.textContent = t;
      if (opt[o.key] === v) b.className = 'on';
      b.onclick = () => { opt[o.key] = v; o.save(v); drawOpts(); };
      box.appendChild(b);
    });
    row.appendChild(box);
    L.appendChild(row);
  }
  // Reset data option (scores, times, and upgrades)
  const rRow = document.createElement('div');
  rRow.className = 'orow';
  rRow.style.cssText = 'border-top:1px solid var(--line);margin-top:8px;padding-top:12px;align-items:center';
  rRow.innerHTML = `<label style="color:#ff7777">Reset data<div style="font:500 11px var(--ui);color:var(--dim)">Clears best times, stunt scores & upgrades</div></label><button class="btn" id="oreset" style="width:auto;font-size:13px;padding:7px 14px;background:rgba(255,60,60,.12);border:1px solid rgba(255,80,80,.4);color:#ff7777;letter-spacing:.08em">Reset</button>`;
  rRow.querySelector('#oreset').onclick = () => {
    if (!confirm('Reset all scores, best times, and garage upgrades? This cannot be undone.')) return;
    try {
      Up.resetAll();
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('mts_race_best_') || k.startsWith('mts_race_splits_') || k === 'mts_fs_best')) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    refreshCr();
    toast('Data reset: times, scores & upgrades cleared');
  };
  L.appendChild(rRow);
}
const toggleOpts = (on = !$('opts').classList.contains('on')) => { $('opts').classList.toggle('on', on); if (on) { orow = 0; drawOpts(); } if (typeof showFocus === 'function') setTimeout(showFocus, 0); };
const refreshCr = () => {
  const lo = Up.loanOwed();
  $('cr').textContent = credits().toLocaleString('en-US') + ' cr' + (lo ? ` (loan ${lo.toLocaleString('en-US')})` : '');
  updateTruckUpgrades();
}; refreshCr();
addEventListener('keydown', (e) => { const r = Up.cheatKey(e); if (!r) return; if (r.consumed) { e.stopImmediatePropagation(); e.preventDefault(); } if (r.msg) { refreshCr(); toast(r.msg); } }, true);
function toast(t) { let d = document.getElementById('cheatToast'); if (!d) { d = document.createElement('div'); d.id = 'cheatToast'; d.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);padding:10px 18px;border-radius:10px;background:rgba(20,26,38,.92);border:1px solid #ff8a1f;color:#fff;font:600 15px Barlow,sans-serif;z-index:60'; document.body.appendChild(d); } d.textContent = t; d.style.display = 'block'; clearTimeout(d._t); d._t = setTimeout(() => (d.style.display = 'none'), 3500); }
$('gbtn').onclick = () => garage.open(refreshCr, paintApi);
$('options').onclick = () => toggleOpts(true);
$('opad').onclick = () => openWizard();
$('oclose').onclick = () => toggleOpts(false);
$('opts').addEventListener('pointerdown', (e) => { if (e.target === $('opts')) toggleOpts(false); });
function updateHints() {
  const isWasd = (store.get('mts_key_layout', 'arrows') === 'wasd');
  const dirKeys = isWasd ? '<kbd>A</kbd> <kbd>D</kbd>' : '<kbd>←</kbd> <kbd>→</kbd>';
  const mh = $('mhint');
  if (mh) mh.innerHTML = `${dirKeys} map &nbsp; <kbd>P</kbd> paint &nbsp; <kbd>B</kbd> body &nbsp; <kbd>Enter</kbd> race &nbsp; <kbd>F</kbd> free roam &nbsp; <kbd>S</kbd> freestyle &nbsp; <kbd>G</kbd> garage &nbsp; <kbd>C</kbd> controller &nbsp; <kbd>O</kbd> options`;
}
updateHints();

addEventListener('keydown', (e) => {
  if (wizOpen) return;
  if (garage.isOpen()) { if (e.code === 'Escape') garage.close(); return; }
  if (e.code === 'Escape') {
    toggleOpts(false);
    return;
  }
  if ($('opts').classList.contains('on')) return;
  const isWasd = (store.get('mts_key_layout', 'arrows') === 'wasd');
  const nextKey = e.code === 'ArrowRight' || e.code === 'ArrowDown' || (isWasd && (e.code === 'KeyD' || e.code === 'KeyS'));
  const prevKey = e.code === 'ArrowLeft' || e.code === 'ArrowUp' || (isWasd && (e.code === 'KeyA' || e.code === 'KeyW'));
  if (nextKey) step(1);
  else if (prevKey) step(-1);
  else if (e.code === 'KeyP') setPaintMode(true);
  else if (e.code === 'KeyB') updateBodyVis(!showBody);
  else if (e.code === 'Enter') $('race').click();
  else if (!isWasd && e.code === 'KeyF') $('free').click();
  else if (!isWasd && e.code === 'KeyS') $('fstyle').click();
  else if (e.code === 'KeyM') pickMap(mapI + 1);
  else if (e.code === 'KeyO') toggleOpts(true);
  else if (e.code === 'KeyG') garage.open(refreshCr, paintApi);
  else if (e.code === 'KeyC') openWizard();
});

// ---------- gamepad navigation ----------
const MAIN = ['race', 'free', 'fstyle', 'gbtn', ...(KIT_BUILDER ? ['medit'] : []), 'options']; if (!KIT_BUILDER) $('medit').style.display = 'none'; let fi = 0, orow = 0, padPrev = {}, padRep = {};
const optsOpen = () => $('opts').classList.contains('on');
function showFocus() {
  document.querySelectorAll('.padfocus').forEach((e) => e.classList.remove('padfocus'));
  if (!padActive) return;
  if (optsOpen()) {
    const rows = $('olist').querySelectorAll('.orow');
    if (orow < rows.length) rows[orow]?.classList.add('padfocus');
    else if (orow === rows.length) $('opad').classList.add('padfocus');
    else $('oclose').classList.add('padfocus');
  } else {
    $(MAIN[fi]).classList.add('padfocus');
  }
}
let padActive = false, wizOpen = false;
function openWizard() { if (wizOpen) return; wizOpen = true; toggleOpts(false); setPaintMode(false); startWizard(() => { wizOpen = false; padPrev = {}; }); }
function padMove(dx, dy) {
  padActive = true;
  if (optsOpen()) {
    const rows = [...$('olist').querySelectorAll('.orow')];
    const totalRows = rows.length + 2; // rows + opad + oclose
    orow = Math.max(0, Math.min(totalRows - 1, orow + dy));
    if (dx && rows[orow]) {
      const bs = [...rows[orow].querySelectorAll('button')], cur = Math.max(0, bs.findIndex((b) => b.classList.contains('on')));
      bs[Math.max(0, Math.min(bs.length - 1, cur + dx))].click();
    }
  } else {
    if (dx) step(dx);
    fi = (fi + dy + MAIN.length) % MAIN.length;
  }
  showFocus();
}
function padPoll() {
  const p = [...(navigator.getGamepads?.() || [])].find((g) => g && g.connected);
  if (p) {
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0, b = (i) => !!(p.buttons[i] && p.buttons[i].pressed), now = performance.now(), map = getMap(p.id);
    let st;
    if (map && !wizOpen) {
      const L = readMap(p, map), h = (k) => (L[k] || 0) > 0.55;
      const steerL = (L['steer_l'] || 0) > 0.55;
      const steerR = (L['steer_r'] || 0) > 0.55;
      let upAct = h('up'), downAct = h('down');

      const steerBinding = map['steer_l'] || map['steer_r'];
      if (steerBinding && steerBinding.t === 'a') {
        const steerAxisIdx = steerBinding.i;
        const yAxisIdx = steerAxisIdx % 2 === 0 ? steerAxisIdx + 1 : steerAxisIdx;
        const stickY = p.axes[yAxisIdx];
        if (stickY != null) {
          if (stickY < -0.55) upAct = true;
          else if (stickY > 0.55) downAct = true;
        }
      }

      if (b(12)) upAct = true;
      if (b(13)) downAct = true;

      const absSteer = Math.max(L['steer_l'] || 0, L['steer_r'] || 0);
      const isVertical = upAct || downAct;
      const isHorizontal = (steerL || steerR || b(14) || b(15)) && (!isVertical || absSteer > 0.75);

      st = {
        l: isHorizontal && (steerL || b(14)),
        r: isHorizontal && (steerR || b(15)),
        u: upAct,
        d: downAct,
        a: h('accept') || b(0),
        b: h('back') || b(1),
        s: h('menu') || b(9) || b(11),
        lb: h('lb') || b(4),
        rb: h('rb') || b(5),
        y: h('alt1') || b(3),
        x: h('alt2') || b(2)
      };
    } else {
      const horiz = Math.abs(ax) > 0.55 && Math.abs(ax) >= Math.abs(ay) * 0.9;
      const vert = Math.abs(ay) > 0.55 && Math.abs(ay) >= Math.abs(ax) * 0.9;
      st = wizOpen ? {} : {
        l: b(14) || (horiz && ax < -0.55),
        r: b(15) || (horiz && ax > 0.55),
        u: b(12) || (vert && ay < -0.55),
        d: b(13) || (vert && ay > 0.55),
        a: b(0),
        b: b(1),
        s: b(9) || b(11),
        lb: b(4),
        rb: b(5),
        y: b(3),
        x: b(2)
      };
    }
    for (const k in st) {
      const edge = st[k] && !padPrev[k], rep = 'lrud'.includes(k) && st[k] && padPrev[k] && now - (padRep[k] || 0) > 220;
      if (garage.isOpen()) {
        if (st[k] && (edge || rep) && 'lrudab'.includes(k)) {
          padRep[k] = now;
          garage.pad(k);
        } else if (st[k] && edge && (k === 'y' || k === 'x')) {
          garage.pad(k);
        }
        continue;
      }
      if (st[k] && (edge || rep)) {
        padRep[k] = now - (edge ? 0 : 0) + (edge ? 200 : 0);
        if (k === 'l') padMove(-1, 0); else if (k === 'r') padMove(1, 0); else if (k === 'u') padMove(0, -1); else if (k === 'd') padMove(0, 1);
        else if (k === 'a') {
          padActive = true;
          if (optsOpen()) {
            const rows = $('olist').querySelectorAll('.orow');
            if (orow === rows.length) openWizard();
            else if (orow > rows.length) toggleOpts(false);
          } else {
            $(MAIN[fi]).click();
          }
          showFocus();
        }
        else if (k === 'b') {
          if (optsOpen()) toggleOpts(false);
          showFocus();
        }
        else if (k === 's' && !optsOpen()) goMap();
        else if (k === 'y' && !optsOpen()) setPaintMode(true);
      }
    }
    padPrev = st;
  }
  requestAnimationFrame(padPoll);
}
padPoll();
try { await document.fonts.load('700 20px "Barlow Condensed"'); } catch (e) {}
pickMap(mapI);
// back from a quality or truck detail change: reopen the options card on the same row
try { const ro = sessionStorage.getItem('mts_reopen_opts'); if (ro !== null) { sessionStorage.removeItem('mts_reopen_opts'); toggleOpts(true); orow = +ro || 0; showFocus(); } } catch (e) {}
