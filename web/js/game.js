import * as THREE from 'three';
import { loadManifest, makeMesh, geometry, texture } from './assets.js';
import { buildSky } from './world.js';
import { buildKitWorld, buildCollision, loadKit, getMap, terrainOf } from './kit.js';
import { buildTruckVisual, syncTruck } from './truck.js';
import { Damage } from './damage.js';
import { Particles } from './particles.js';
import { TriGrid, DT, CylinderCollider } from './physics.js';
import { Hud } from './hud.js';
import { MonsterTruck, loadTruckSpheres } from './mt_physics.js';
import { Freestyle } from './freestyle.js';
import { setupGfx, LOWQ, POTATO, TRUCK_LOD, LOD_MODE, LOD_LEVELS } from './gfx.js';
import { Post } from './post.js';
import * as Up from './upgrades.js';
import { tkey } from './trucks.js';
import { setShockStyle } from './cab.js';
import { Input } from './input.js';
import { createPerf } from './perf.js';

const q = new URLSearchParams(location.search);
const DBG = () => q.has('debug') || (() => { try { return localStorage.getItem('mts_debug') === '1'; } catch (e) { return false; } })(); // debug log: ?debug or the pause menu switch
const canvas = document.getElementById('c'), hud = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOWQ, alpha: !LOWQ, powerPreference: 'high-performance' });
const scene = new THREE.Scene(); scene.fog = q.get('gfx') === 'classic' ? new THREE.Fog(0xb9c9d6, 400, 1800) : new THREE.FogExp2(0xbdd0e3, 0.00062);
// Low and Potato quality cut the view off at FAR m and fade to fog colour before it, so the huge grass plane and distant scenery are not drawn
const FAR = POTATO ? 700 : LOWQ ? 1400 : 8000;
if (LOWQ) scene.fog = new THREE.Fog(scene.fog.color, FAR * 0.3, FAR * 0.95);
const camera = new THREE.PerspectiveCamera(65, 1, 0.2, FAR);
scene.add(new THREE.AmbientLight(0xffffff, 2.0)); const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(0.4, 1, 0.3); scene.add(sun);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', () => { resize(); hudo && hudo.resize(); }); resize();
let hudo = null;

await loadManifest();
hudo = new Hud(renderer); await hudo.init();
const KIT = true, kitMap = getMap(q.get('kitmap') || 'builtin:bmx') || getMap('builtin:bmx');
const { sky, world } = await buildKitWorld(scene, buildSky, kitMap);
if (FAR < 1000) { sky.scale.setScalar(FAR * 0.9); } // keep the sky dome inside the shortened far plane
// collision grid from terrain + object meshes
const grid = buildCollision(await loadKit(), kitMap, new TriGrid(4)); grid.smooth = q.get('smooth') === '1'; // smooth contact normals: off by default (they bias launch acceleration vs original replays)
const dbgLines = []; function dbg(m) { dbgLines.push(m); let d = document.getElementById('errbox'); if (!d) { d = document.createElement('pre'); d.id = 'errbox'; Object.assign(d.style, { position: 'fixed', left: 0, bottom: 0, right: 0, margin: 0, padding: '6px', background: 'rgba(120,0,0,0.85)', color: '#fff', font: '11px monospace', zIndex: 99, whiteSpace: 'pre-wrap', maxHeight: '60vh', overflow: 'auto' }); document.body.appendChild(d); } d.textContent = dbgLines.slice(-14).join('\n'); }
addEventListener('error', (e) => dbg('ERR ' + (e.message || 'error') + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
addEventListener('unhandledrejection', (e) => dbg('REJ ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
for (const k of ['error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { o(...a); dbg(k.toUpperCase() + ' ' + a.map((x) => String(x && x.message || x)).join(' ').slice(0, 300)); }; }
renderer.debug.onShaderError = (gl, prog, vs, fs) => dbg('SHADER ' + (gl.getProgramInfoLog(prog) || '') + ' ' + (gl.getShaderInfoLog(fs) || '').slice(0, 300) + (gl.getShaderInfoLog(vs) || '').slice(0, 300));
const glInfo = () => { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); dbg(`GL ${gl.getParameter(gl.VERSION)} | ${ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?'} | maxTex ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} | dpr ${devicePixelRatio} | ${innerWidth}x${innerHeight} | LOWQ ${LOWQ}`); }
if (DBG()) glInfo();
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); dbg('WEBGL CONTEXT LOST'); setTimeout(() => location.reload(), 3000); });
let dbgN = 0; const ipPrev = { p: new THREE.Vector3(), q: new THREE.Quaternion() }, ipReal = { p: new THREE.Vector3(), q: new THREE.Quaternion() }; let ipHave = false, ipOn = false; const interp = () => { if (!ipHave || replay || state === 'countdown' || state === 'false' || dropWait > 0 || q.get('interp') === '0') return; const a = Math.min(1, Math.max(0, acc / DT)); ipReal.p.copy(truck.p); ipReal.q.copy(truck.q); truck.p.lerpVectors(ipPrev.p, ipReal.p, a); truck.q.slerpQuaternions(ipPrev.q, ipReal.q, a); ipOn = true; }, unInterp = () => { if (ipOn) { truck.p.copy(ipReal.p); truck.q.copy(ipReal.q); ipOn = false; } };
let dropWait = 0; const dropPose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
let truck; { await loadTruckSpheres(); truck = new MonsterTruck(grid); if (LOWQ) truck.substeps = 2; if (q.get('wheel') === '1') { truck.wm.on = true; truck.wm.inertia = 0.7; truck.boost = false; } if (q.get('ver') === '12') truck.setVersion(12); }
const opt = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const UP = Up.stats(Up.load()); // upgrades (garage)
const DMG_T = [30, 60, 1000, 100][+opt('mts_damage', '3')] * (UP.dmg || 1) || 100; // fragile / normal / off / tough (default; original stock was 40)
if (truck.antiRoll !== undefined) truck.antiRoll = [1.0, 0.9, 0.8, 0.7, 0.6][+opt(tkey('mts_stab'), '2')] ?? 0.8;
const vis = await buildTruckVisual({ lod: TRUCK_LOD }); scene.add(vis.root);
if (opt(tkey('mts_show_body'), '1') === '0') vis.setBodyVisible(false);
if (vis.setLights) vis.setLights(opt(tkey('mts_lights'), '0') === '1');
function toggleLights() {
  if (!vis.setLights) return;
  const next = !vis.isLightsOn();
  vis.setLights(next);
  try { localStorage.setItem(tkey('mts_lights'), next ? '1' : '0'); } catch (e) {}
}
const SUN_DEF = new THREE.Vector3(0.4, 1, 0.3).normalize(); const modern = q.get('gfx') !== 'classic'; let gfx = null; if (modern) gfx = await setupGfx({ renderer, scene, sun, world: world, vis }); if (gfx && sky.userData.light) sun.intensity *= sky.userData.light; // dim the shadow light under skies with a hidden sun // classic = original look
const post = modern && !LOWQ && q.get('post') !== '0' ? new Post(renderer, { bloom: 0.32, exposure: 1.08 }) : null; if (post) sky.traverse((o) => { if (o.material && o.material.color) o.material.color.setScalar(1.28); });
const perf = createPerf(renderer);
// Diagnostic for weak GPUs: hide parts of the scene to see what slows it (?hide=truck,terrain,..., or the pause menu button).
const HIDE_PARTS = ['truck', 'terrain', 'ground', 'props', 'sky', 'hud', 'physics'], HIDE_MODES = ['none', ...HIDE_PARTS, 'all'];
const hideTerrain = [], hideGround = [], hideProps = [];
for (const c of world.children) (c.name === 'sceneryc' ? hideGround : c.name === 'bmxterrain' ? hideTerrain : hideProps).push(c);
const hideSet = (q.get('hide') || '').split(',');
let hideMode = hideSet.includes('all') ? 'all' : HIDE_PARTS.filter((p) => hideSet.includes(p)).pop() || 'none';
const hidden = (p) => hideMode === 'all' || hideMode === p;
function applyHide() { vis.root.visible = !hidden('truck'); hideTerrain.forEach((o) => { o.visible = !hidden('terrain'); }); hideGround.forEach((o) => { o.visible = !hidden('ground'); }); hideProps.forEach((o) => { o.visible = !hidden('props'); }); sky.visible = !hidden('sky'); hudo.text.style.display = hidden('hud') ? 'none' : ''; }
applyHide();
const draw3d = () => { perf.gpuBegin(); if (post) post.render(scene, camera); else renderer.render(scene, camera); perf.gpuEnd(); };
const customBodyColor = q.get('body_color') || opt(tkey('mts_custom_color_body'), '#e02424');
vis.setBodyColor(customBodyColor);
const customStripeColor = q.get('stripe_color') || opt(tkey('mts_custom_color_stripe'), '#f8fafc');
vis.setStripeColor(customStripeColor);
const customLinkColor = q.get('link_color') || opt(tkey('mts_custom_color_link'), '#1e293b');
vis.setLinkColor(customLinkColor);
const customSpringColor = q.get('spring_color') || opt(tkey('mts_custom_color_spring'), '#f59e0b');
vis.setSpringColor(customSpringColor);
if (vis.setTyreArt) vis.setTyreArt(q.get('tyre_art') || opt(tkey('mts_tyre_art'), 'none'));
if (vis.setShockTier) vis.setShockTier(Up.load().own?.shocks || 0);
else if (vis.setDualSprings) vis.setDualSprings((Up.load().own?.shocks || 0) >= 1);

let dmg = null; // created after audio helpers
// ---- mode & race / stunt setup ----
const rawMode = q.get('mode') || (q.get('free') === '1' ? 'free' : 'race');
const isFreestyle = rawMode === 'freestyle';
const isRace = rawMode === 'race';
const isFree = rawMode === 'free';
const free = isFree; // true only in Free Roam

let creditBal = Up.load().credits;
let finish = null;
function goToMenu() { try { FS?.destroy?.(); } catch (e) {} location.href = 'index.html'; }

// ---- Pause Menu & Tuning ----
let paused = false, pauseBtnIdx = 0, pauseMode = 'menu', pauseTuneIdx = 0;
let pauseRoot = null;
let currentTuning = Up.loadTuning();
function activeTuneDefs() {
  const st = Up.load();
  return Up.TUNING_DEFS.filter((d) => d.branch === 'all' || d.branch === st.route);
}
function applyTuningLive() {
  currentTuning = Up.loadTuning();
  const st = Up.load();
  const upStats = Up.stats(st, truck.P, currentTuning);
  Object.assign(UP, upStats);
  Up.apply(upStats, { truck, cab: vis.cab, vis, setShocks: (sh) => setShockStyle(vis.linkage, sh) });
}
function updatePauseBodyButton() {
  const btn = pauseRoot?.querySelector('#pm-body');
  if (!btn) return;
  const isVis = vis.isBodyVisible ? vis.isBodyVisible() : true;
  btn.innerHTML = `${isVis ? 'Remove Body' : 'Restore Body'} <kbd>B</kbd>`;
}
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
function updatePauseOptionButtons() {
  const b = pauseRoot?.querySelector('#pm-hide'); if (b) b.textContent = `Hide (test): ${hideMode === 'none' ? 'Off' : hideMode}`;
}
function cyclePauseHide() { hideMode = HIDE_MODES[(HIDE_MODES.indexOf(hideMode) + 1) % HIDE_MODES.length]; applyHide(); updatePauseOptionButtons(); }
function togglePauseBody() {
  const cur = vis.isBodyVisible ? vis.isBodyVisible() : true;
  const next = !cur;
  if (vis.setBodyVisible) vis.setBodyVisible(next);
  try { localStorage.setItem(tkey('mts_show_body'), next ? '1' : '0'); } catch (e) {}
  updatePauseBodyButton();
}
function renderPauseMenu() {
  if (!pauseRoot) return;
  const tuneDefs = activeTuneDefs();
  if (pauseMode === 'menu') {
    pauseRoot.innerHTML = `
      <div class="pause-card">
        <h2>Paused</h2>
        <div class="pause-btns">
          <button type="button" class="pause-btn go" id="pm-resume">Resume <kbd>Start / Back</kbd></button>
          <button type="button" class="pause-btn" id="pm-tune">Tuning &amp; Setup <kbd>T</kbd></button>
          <button type="button" class="pause-btn" id="pm-body">Remove Body <kbd>B</kbd></button>
          <button type="button" class="pause-btn" id="pm-hide"></button>
          <button type="button" class="pause-btn" id="pm-restart">Restart <kbd>X</kbd></button>
          <button type="button" class="pause-btn" id="pm-menu">Main Menu <kbd>Y</kbd></button>
        </div>
      </div>`;
    pauseRoot.querySelector('#pm-resume').onclick = () => setPaused(false);
    pauseRoot.querySelector('#pm-tune').onclick = () => { pauseMode = 'tuning'; pauseTuneIdx = 0; renderPauseMenu(); };
    pauseRoot.querySelector('#pm-body').onclick = () => togglePauseBody();
    pauseRoot.querySelector('#pm-hide').onclick = () => cyclePauseHide();
    updatePauseOptionButtons();
    pauseRoot.querySelector('#pm-restart').onclick = () => { setPaused(false); finish = null; resetTruck(); };
    pauseRoot.querySelector('#pm-menu').onclick = () => { setPaused(false); goToMenu(); };
    updatePauseBodyButton();
  } else {
    currentTuning = Up.loadTuning();
    const tuneCards = tuneDefs.map((d, i) => {
      const val = currentTuning[d.id] ?? d.def;
      const pips = Array.from({ length: d.max - d.min + 1 }, (_, idx) => `<span class="tune-pip ${idx === (val - d.min) ? 'on' : ''}"></span>`).join('');
      const tag = d.branch === 'nitro' ? 'NITRO' : d.branch === 'electric' ? 'BRUSHLESS' : 'ALL BUILDS';
      return `<div class="tune-card ${i === pauseTuneIdx ? 'padfocus' : ''}" data-pti="${i}">
        <div class="tune-head"><span class="tune-title">${d.name}</span><em class="tune-tag ${d.branch}">${tag}</em></div>
        <div class="tune-ctrl">
          <button class="tune-step-btn" data-ptdec="${d.id}" ${val <= d.min ? 'disabled' : ''}>◀</button>
          <div class="tune-val-box">
            <span class="tune-val-label">${d.opts[val - d.min] || val}</span>
            <div class="tune-pips">${pips}</div>
          </div>
          <button class="tune-step-btn" data-ptinc="${d.id}" ${val >= d.max ? 'disabled' : ''}>▶</button>
        </div>
      </div>`;
    }).join('');
    pauseRoot.innerHTML = `
      <div class="pause-card pause-tune">
        <div class="pause-tune-top">
          <h2>Tuning Setup</h2>
        </div>
        <div class="pause-tune-desc">Adjust slipper clutch, shock damping, spring preload, power curves, brake feel and wheelie bar angle live. Changes take effect on OK or revert on Cancel.</div>
        <div class="tune-grid">${tuneCards}</div>
        <div class="tune-actions">
          <button class="btn btn-cancel ${pauseTuneIdx === 'cancel' ? 'padfocus' : ''}" id="pm-tune-cancel">Cancel <kbd>Esc</kbd></button>
          <button class="btn btn-reset ${pauseTuneIdx === 'reset' ? 'padfocus' : ''}" id="pm-tune-reset">Reset to Default</button>
          <button class="btn btn-ok ${pauseTuneIdx === 'ok' ? 'padfocus' : ''}" id="pm-tune-ok">OK <kbd>Enter</kbd></button>
        </div>
      </div>`;
    pauseRoot.querySelector('#pm-tune-cancel').onclick = cancelPauseTune;
    pauseRoot.querySelector('#pm-tune-reset').onclick = resetPauseTune;
    pauseRoot.querySelector('#pm-tune-ok').onclick = confirmPauseTune;
    pauseRoot.querySelectorAll('.tune-step-btn[data-ptdec]').forEach((b) => (b.onclick = () => adjustPauseTune(b.dataset.ptdec, -1)));
    pauseRoot.querySelectorAll('.tune-step-btn[data-ptinc]').forEach((b) => (b.onclick = () => adjustPauseTune(b.dataset.ptinc, 1)));
    pauseRoot.querySelectorAll('.tune-card').forEach((cd) => cd.addEventListener('pointerdown', () => { pauseTuneIdx = +cd.dataset.pti; updatePauseFocus(); }));
  }
  updatePauseFocus();
}
let initialTuningBackup = null;
function openPauseTune() {
  pauseMode = 'tuning';
  pauseTuneIdx = 0;
  initialTuningBackup = { ...Up.loadTuning() };
  renderPauseMenu();
}
function cancelPauseTune() {
  if (initialTuningBackup) {
    Up.saveTuning(initialTuningBackup);
    applyTuningLive();
  }
  pauseMode = 'menu';
  pauseBtnIdx = 1;
  renderPauseMenu();
}
function confirmPauseTune() {
  initialTuningBackup = null;
  pauseMode = 'menu';
  pauseBtnIdx = 1;
  renderPauseMenu();
}
function resetPauseTune() {
  Up.resetTuning();
  applyTuningLive();
  renderPauseMenu();
}
function adjustPauseTune(id, delta) {
  const d = Up.TUNING_DEFS.find((x) => x.id === id);
  if (!d) return;
  currentTuning = Up.loadTuning();
  const cur = currentTuning[id] ?? d.def;
  const next = Math.max(d.min, Math.min(d.max, cur + delta));
  if (next !== cur) {
    currentTuning[id] = next;
    Up.saveTuning(currentTuning);
    applyTuningLive();
    renderPauseMenu();
  }
}
function ensurePauseMenu() {
  if (pauseRoot) return;
  pauseRoot = document.createElement('div');
  pauseRoot.id = 'pause-menu';
  document.body.appendChild(pauseRoot);
  renderPauseMenu();
}
function updatePauseFocus() {
  if (!pauseRoot) return;
  if (pauseMode === 'menu') {
    const btns = pauseRoot.querySelectorAll('.pause-btn');
    btns.forEach((b, idx) => b.classList.toggle('padfocus', idx === pauseBtnIdx));
  } else {
    const cards = pauseRoot.querySelectorAll('.tune-card');
    cards.forEach((c, idx) => c.classList.toggle('padfocus', idx === pauseTuneIdx));
    pauseRoot.querySelector('#pm-tune-cancel')?.classList.toggle('padfocus', pauseTuneIdx === 'cancel');
    pauseRoot.querySelector('#pm-tune-reset')?.classList.toggle('padfocus', pauseTuneIdx === 'reset');
    pauseRoot.querySelector('#pm-tune-ok')?.classList.toggle('padfocus', pauseTuneIdx === 'ok');
    if (typeof pauseTuneIdx === 'number' && pauseTuneIdx >= 0 && cards[pauseTuneIdx]) {
      cards[pauseTuneIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}
function setPaused(on) {
  if (paused === on) return;
  ensurePauseMenu();
  paused = on;
  pauseMode = 'menu';
  pauseBtnIdx = 0;
  pauseTuneIdx = 0;
  renderPauseMenu();
  pauseRoot.classList.toggle('on', paused);
  if (paused) {
    if (typeof masterGain !== 'undefined') masterGain.gain.value = 0;
    if (audioOn && AC.state === 'running') AC.suspend().catch(() => {});
  } else {
    if (typeof masterGain !== 'undefined') masterGain.gain.value = 1;
    if (audioOn && AC.state === 'suspended') AC.resume().catch(() => {});
  }
}
function pausePad(k) {
  if (!paused) return;
  if (pauseMode === 'menu') {
    const numBtns = 6; // Resume, Tuning, Remove Body, Hide, Restart, Main Menu
    if (k === 'u') {
      pauseBtnIdx = (pauseBtnIdx - 1 + numBtns) % numBtns;
      updatePauseFocus();
    } else if (k === 'd') {
      pauseBtnIdx = (pauseBtnIdx + 1) % numBtns;
      updatePauseFocus();
    } else if (k === 'a') {
      if (pauseBtnIdx === 0) setPaused(false);
      else if (pauseBtnIdx === 1) openPauseTune();
      else if (pauseBtnIdx === 2) togglePauseBody();
      else if (pauseBtnIdx === 3) cyclePauseHide();
      else if (pauseBtnIdx === 4) { setPaused(false); finish = null; resetTruck(); }
      else if (pauseBtnIdx === 5) { setPaused(false); goToMenu(); }
    } else if (k === 'b' || k === 'menu') {
      setPaused(false);
    } else if (k === 'x') {
      setPaused(false); finish = null; resetTruck();
    } else if (k === 'y') {
      setPaused(false); goToMenu();
    }
  } else {
    // Tuning sub-menu
    const tuneDefs = activeTuneDefs();
    const total = tuneDefs.length;
    const actionBtns = ['cancel', 'reset', 'ok'];
    const isAction = typeof pauseTuneIdx === 'string' && actionBtns.includes(pauseTuneIdx);

    if (isAction) {
      const idx = actionBtns.indexOf(pauseTuneIdx);
      if (k === 'l') {
        pauseTuneIdx = actionBtns[Math.max(0, idx - 1)];
        updatePauseFocus();
      } else if (k === 'r') {
        pauseTuneIdx = actionBtns[Math.min(actionBtns.length - 1, idx + 1)];
        updatePauseFocus();
      } else if (k === 'u') {
        pauseTuneIdx = total - 1;
        updatePauseFocus();
      } else if (k === 'a') {
        if (pauseTuneIdx === 'cancel') cancelPauseTune();
        else if (pauseTuneIdx === 'reset') resetPauseTune();
        else if (pauseTuneIdx === 'ok') confirmPauseTune();
      } else if (k === 'b' || k === 'menu') {
        cancelPauseTune();
      }
    } else {
      if (typeof pauseTuneIdx !== 'number' || pauseTuneIdx < 0) pauseTuneIdx = 0;
      if (k === 'u') {
        if (pauseTuneIdx > 0) { pauseTuneIdx--; updatePauseFocus(); }
      } else if (k === 'd') {
        if (pauseTuneIdx < total - 1) {
          pauseTuneIdx++;
          updatePauseFocus();
        } else {
          pauseTuneIdx = 'ok';
          updatePauseFocus();
        }
      } else if (k === 'l') {
        const d = tuneDefs[pauseTuneIdx];
        if (d) adjustPauseTune(d.id, -1);
      } else if (k === 'r') {
        const d = tuneDefs[pauseTuneIdx];
        if (d) adjustPauseTune(d.id, 1);
      } else if (k === 'a') {
        const d = tuneDefs[pauseTuneIdx];
        if (d) adjustPauseTune(d.id, 1);
      } else if (k === 'x') {
        const d = tuneDefs[pauseTuneIdx];
        if (d) adjustPauseTune(d.id, -1);
      } else if (k === 'b' || k === 'menu') {
        cancelPauseTune();
      }
    }
  }
}

let raceStuntScore = 0;
const raceBestKey = tkey('mts_race_best_' + (kitMap.name || 'bmx'));
const raceBestSplitsKey = tkey('mts_race_splits_' + (kitMap.name || 'bmx'));
let raceBestTime = 0;
let raceBestSplits = [];
try {
  raceBestTime = +localStorage.getItem(raceBestKey) || 0;
  raceBestSplits = JSON.parse(localStorage.getItem(raceBestSplitsKey) || '[]');
} catch (e) {}

let currentRunSplits = [];
let liveSplit = null; // { gate, time, delta, timer }

const FS = isFreestyle ? new Freestyle((n) => { creditBal = Up.addCredits(n); return creditBal; }, { onRestart: () => { finish = null; resetTruck(); }, onMenu: () => goToMenu() })
  : (isFree ? new Freestyle(null, { calloutsOnly: true })
  : new Freestyle(null, { calloutsOnly: true, onStunt: (cat, label, pts) => {
      const bonus = Math.round(pts * 0.5); // bonus points in race mode
      raceStuntScore += bonus;
      score += bonus;
      msg = `STUNT +${bonus} PTS`;
    } }));

// Build timing gates along the track path for Race mode
const stunt = { checkpoints: [], starts: [] };
const cpMeshes = [];
const timingGatesGroup = new THREE.Group();
scene.add(timingGatesGroup);

// Generate checkered flag texture for the start/finish gate (seamless square checkers)
function makeCheckeredTexture() {
  const cvs = document.createElement('canvas');
  cvs.width = 128; cvs.height = 128;
  const ctx = cvs.getContext('2d');
  const size = 64;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, size, size);
  ctx.fillRect(size, size, size, size);
  const tex = new THREE.CanvasTexture(cvs);
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const checkeredTex = makeCheckeredTexture();

if (kitMap.path && kitMap.path.length) {
  const P = kitMap.path, N = P.length, T = kitMap.tangents, sIdx = kitMap.startIdx || 0;
  const numGates = Math.min(10, Math.max(5, Math.floor(N / 45)));
  const step = Math.floor(N / numGates);
  const hs = (x, z) => terrainOf(kitMap)?.heightAt(x, z) || 0;

  for (let k = 0; k < numGates; k++) {
    const idx = (sIdx + (k + 1) * step) % N;
    const pt = P[idx], tg = T ? T[idx] : [0, 1], yaw = Math.atan2(tg[0], tg[1]);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const gy = hs(pt[0], pt[1]);
    const isFinal = k === numGates - 1;

    // Measure exact track width by checking berm/boundary height at lateral offsets
    const rightVec = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let halfTrack = 13.0;
    // Check heights to find edges of the track surface (allowing for scaled up track width)
    for (let d = 7; d <= 22; d += 0.5) {
      const p1 = [pt[0] + rightVec.x * d, pt[1] + rightVec.z * d];
      const p2 = [pt[0] - rightVec.x * d, pt[1] - rightVec.z * d];
      const h1 = hs(p1[0], p1[1]), h2 = hs(p2[0], p2[1]);
      if (Math.abs(h1 - gy) > 1.8 || Math.abs(h2 - gy) > 1.8 || d >= 18.0) {
        halfTrack = Math.max(10.5, Math.min(19.0, d));
        break;
      }
    }
    const gateWidth = halfTrack * 2;
    const pos = [pt[0], gy + 2.5, pt[1]];
    stunt.checkpoints.push({ pos, quat: quat.toArray(), width: gateWidth + 2, height: 12 });

    // 3D timing gate mesh group
    const gateObj = new THREE.Group();
    gateObj.position.set(pt[0], 0, pt[1]);
    gateObj.quaternion.copy(quat);

    // Exact ground heights at each post position so posts are firmly planted in the terrain (no hovering)
    const posL = [pt[0] - rightVec.x * halfTrack, pt[1] - rightVec.z * halfTrack];
    const posR = [pt[0] + rightVec.x * halfTrack, pt[1] + rightVec.z * halfTrack];
    const yL = hs(posL[0], posL[1]);
    const yR = hs(posR[0], posR[1]);

    const neonCol = isFinal ? 0xff4422 : (k === 0 ? 0x22ee66 : 0xff9900);
    const postCol = isFinal ? 0xeeffff : 0x222630;
    const pMat = new THREE.MeshStandardMaterial({ color: postCol, roughness: 0.45, metalness: 0.6 });
    const capMat = new THREE.MeshStandardMaterial({ color: neonCol, emissive: neonCol, emissiveIntensity: isFinal ? 0.3 : 0.85 });

    // Rounded vertical posts (cylinders with hemispherical caps)
    const postH = 7.0;
    const postR = 0.42;
    const postGeo = new THREE.CylinderGeometry(postR, postR, postH, 20);
    const capGeo = new THREE.SphereGeometry(postR, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);

    // Left post
    const pL = new THREE.Group();
    pL.position.set(-halfTrack, yL, 0);
    const colL = new THREE.Mesh(postGeo, pMat); colL.position.set(0, postH * 0.5, 0); colL.castShadow = true;
    const capL = new THREE.Mesh(capGeo, capMat); capL.position.set(0, postH, 0);
    pL.add(colL, capL);

    // Right post
    const pR = new THREE.Group();
    pR.position.set(halfTrack, yR, 0);
    const colR = new THREE.Mesh(postGeo, pMat); colR.position.set(0, postH * 0.5, 0); colR.castShadow = true;
    const capR = new THREE.Mesh(capGeo, capMat); capR.position.set(0, postH, 0);
    pR.add(colR, capR);

    // Add physical collision to timing gate posts ONLY in Race mode (when gates are visible)
    if (isRace) {
      grid.addCollider(new CylinderCollider(posL[0], yL, posL[1], postR, postH, `gate_${k}_post_L`));
      grid.addCollider(new CylinderCollider(posR[0], yR, posR[1], postR, postH, `gate_${k}_post_R`));
    }

    // Diagonal banner / veil quad that connects directly between the posts:
    // Left bottom (-halfTrack, yL, 0) to Left top (-halfTrack, yL + postH, 0)
    // Right bottom (halfTrack, yR, 0) to Right top (halfTrack, yR + postH, 0)
    const span = Math.hypot(gateWidth, yR - yL);
    const checkerSquareSize = 1.0; // 1 metre per checker square for crisp, perfectly square checks
    const uMax = span / (checkerSquareSize * 2);
    const vMax = postH / (checkerSquareSize * 2);
    const veilGeo = new THREE.BufferGeometry();
    const vPos = new Float32Array([
      -halfTrack, yL + postH, 0, // 0: Top-left
       halfTrack, yR + postH, 0, // 1: Top-right
      -halfTrack, yL,         0, // 2: Bottom-left
       halfTrack, yR,         0  // 3: Bottom-right
    ]);
    const vNorm = new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]);
    const vUvs = new Float32Array([
      0, vMax,
      uMax, vMax,
      0, 0,
      uMax, 0
    ]);
    const vIdx = new Uint16Array([
      0, 2, 1,
      1, 2, 3
    ]);
    veilGeo.setAttribute('position', new THREE.BufferAttribute(vPos, 3));
    veilGeo.setAttribute('normal', new THREE.BufferAttribute(vNorm, 3));
    veilGeo.setAttribute('uv', new THREE.BufferAttribute(vUvs, 2));
    veilGeo.setIndex(new THREE.BufferAttribute(vIdx, 1));

    let veilMat;
    if (isFinal) {
      veilMat = new THREE.MeshBasicMaterial({
        map: checkeredTex,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide
      });
    } else {
      veilMat = new THREE.MeshBasicMaterial({
        color: neonCol,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide
      });
    }

    const veil = new THREE.Mesh(veilGeo, veilMat);

    // Glowing boundary edge bars / lines connecting the top of the posts and the bottom of the posts
    // so the gate slopes diagonally with banked corners
    const barMat = new THREE.MeshStandardMaterial({
      color: neonCol,
      emissive: neonCol,
      emissiveIntensity: 0.7,
      roughness: 0.3
    });
    const makeEdgeBar = (p1, p2, radius = 0.08) => {
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const barG = new THREE.CylinderGeometry(radius, radius, len, 12);
      const m = new THREE.Mesh(barG, barMat);
      m.position.copy(mid);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      return m;
    };
    const topBar = makeEdgeBar(new THREE.Vector3(-halfTrack, yL + postH, 0), new THREE.Vector3(halfTrack, yR + postH, 0), 0.12);
    const bottomBar = makeEdgeBar(new THREE.Vector3(-halfTrack, yL + 0.1, 0), new THREE.Vector3(halfTrack, yR + 0.1, 0), 0.08);

    gateObj.add(pL, pR, veil, topBar, bottomBar);
    gateObj.userData = { veil, isFinal, neonCol };
    timingGatesGroup.add(gateObj);
    cpMeshes.push(gateObj);
  }
} else {
  stunt.checkpoints.push({ pos: [kitMap.start.x, (terrainOf(kitMap)?.heightAt(kitMap.start.x, kitMap.start.z) || 0) + 2, kitMap.start.z], quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), kitMap.start.yaw * Math.PI / 180).toArray(), width: 18, height: 9 });
}

// In Free Roam or Freestyle, timing gates are hidden
if (!isRace) timingGatesGroup.visible = false;

// Fuel / Battery runtime system:
// Baseline full tank run time is 12 minutes (720 seconds) of driving.
// Nitro: combustion engine fuel tank.
// Brushless: battery capacity percentage.
const FUEL_CAPACITY = 720; // 12 minutes in seconds
let fuelRemaining = FUEL_CAPACITY;
let fuelEmpty = false;

let startIdx = 0;
function resetTruck() {
  truck.snapT = 0;
  if (FS) FS.reset();
  if (isRace) {
    timingGatesGroup.visible = true;
    cpMeshes.forEach((m) => { m.visible = true; if (m.userData.veil) m.userData.veil.visible = true; });
  } else {
    timingGatesGroup.visible = false;
  }
  raceStuntScore = 0;
  const c0 = stunt.checkpoints[0] || { pos: [kitMap.start.x, (terrainOf(kitMap)?.heightAt(kitMap.start.x, kitMap.start.z) || 0) + 2, kitMap.start.z], quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), kitMap.start.yaw * Math.PI / 180).toArray() };
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...c0.quat)), yaw = Math.atan2(f.x, f.z) * 180 / Math.PI;
  const alt = startIdx % (stunt.starts.length + 1), pos = alt === 0 ? c0.pos : stunt.starts[alt - 1].pos;
  if (alt === 0 && truck.rigid) { truck.place([c0.pos[0], c0.pos[1], c0.pos[2]], 0); truck.setPose([...c0.pos, ...c0.quat]); }
  else truck.place([pos[0], pos[1], pos[2]], yaw);
  if (truck.sp) { truck.setMask?.(0); truck.sp.forEach((s) => (s.dead = false)); }
  dmg?.reset(); fx?.clearMarks?.(); vis.cab?.reset(); rec = []; breakdown = []; runTime = 0; passed = 0;
  currentRunSplits = []; liveSplit = null;
  fuelRemaining = FUEL_CAPACITY; fuelEmpty = false;
  state = q.get('replay') ? 'ready' : (isRace ? 'countdown' : 'running');
  cd = 0; lightIdx = 0; msg = ''; score = 0; lastBreak = ''; prevP.copy(truck.comWorld()); log.length = 0;
}
const prevP = new THREE.Vector3(), log = []; let rec = [], breakdown = [];
let cd = 0, lightIdx = 0, runTime = 0, passed = 0, state = 'ready', msg = '', score = 0, hiScore = Math.round(raceBestTime > 0 ? (10000 / raceBestTime) : 0), lastBreak = '';
const fx = new Particles(scene); dmg = new Damage(vis, scene, grid, play, DMG_T, fx); if (truck.rigid && !q.get('replay')) { Up.apply(UP, { truck, cab: vis.cab, vis, setShocks: (sh) => setShockStyle(vis.linkage, sh) }); truck.gear = 1; } resetTruck();

// ---- input ----
addEventListener('keydown', (e) => { const r = Up.cheatKey(e); if (!r) return; if (r.consumed) { e.stopImmediatePropagation(); e.preventDefault(); } if (r.msg) { creditBal = Up.load().credits; msg = r.msg; if (r.reload) setTimeout(() => location.reload(), 1200); } }, true);
const keys = new Set(); addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (paused) {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { pausePad('u'); e.preventDefault(); return; }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { pausePad('d'); e.preventDefault(); return; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { pausePad('l'); e.preventDefault(); return; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { pausePad('r'); e.preventDefault(); return; }
    if (e.code === 'KeyT') {
      if (pauseMode === 'menu') { pauseMode = 'tuning'; pauseTuneIdx = 0; renderPauseMenu(); }
      else { pauseMode = 'menu'; pauseBtnIdx = 1; renderPauseMenu(); }
      e.preventDefault(); return;
    }
    if (e.code === 'KeyB') { togglePauseBody(); e.preventDefault(); return; }
    if (e.code === 'Enter' || e.code === 'Space') { pausePad('a'); e.preventDefault(); return; }
    if (e.code === 'Escape') { pausePad('b'); e.preventDefault(); return; }
  }
  if (FS && FS.over) {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { FS.pad('l'); e.preventDefault(); return; }
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { FS.pad('r'); e.preventDefault(); return; }
    if (e.code === 'Enter' || e.code === 'KeyR') { e.preventDefault(); FS.triggerRestart(); return; }
    if (e.code === 'Escape') { e.preventDefault(); FS.triggerMenu(); return; }
  }
  if (state === 'done') {
    if (e.code === 'Enter' || e.code === 'KeyR') { e.preventDefault(); finish = null; resetTruck(); return; }
    if (e.code === 'Escape') { e.preventDefault(); goToMenu(); return; }
  }
  if (e.code === 'Escape') {
    if (!paused && state !== 'done' && !(FS && FS.over)) {
      setPaused(true);
      e.preventDefault();
      return;
    }
  }
  if (e.code === 'KeyL') toggleLights();
  if (e.code === 'KeyB') { camMode = (camMode + 1) % CAMS.length; camInit = false; }
  if (e.code === 'KeyN') { startIdx++; resetTruck(); }
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
const key = (...c) => c.some((k) => keys.has(k));
const replay = null, preview = false, ghost = null; let pvT = 0;
// ---- audio ----
const AC = new (window.AudioContext || window.webkitAudioContext)(); const bufs = {};
const masterGain = AC.createGain(); masterGain.gain.value = 1; masterGain.connect(AC.destination);
async function snd(n) { if (!bufs[n]) bufs[n] = (async () => { for (let i = 0; i < 3; i++) { try { const r = await fetch(`./assets/snd/${n}.wav`); if (r.ok) return await AC.decodeAudioData(await r.arrayBuffer()); } catch (e) {} await new Promise((r) => setTimeout(r, 400 * (i + 1))); } bufs[n] = null; throw new Error('sound unavailable: ' + n); })(); return bufs[n]; }
function play(n, vol = 1, loop = false, rate = 1) { if (paused) return; if (AC.state === 'suspended') AC.resume().catch(() => {}); snd(n).catch(() => null).then((b) => { if (!b || paused) return; const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = b; s.loop = loop; s.playbackRate.value = rate; g.gain.value = vol; s.connect(g).connect(masterGain); s.start(); s._g = g; }); }
let engineSrc = null, engineGain = null, skidGain = null, evOsc = null, evGain = null, audioOn = false, rpm = 0.2;
let audioBusy = false;
async function startAudio() { if (audioBusy) return; audioBusy = true; try { await startAudio2(); } catch (e) { /* sound is optional: retry on next input */ } audioBusy = false; }
async function startAudio2() {
  if (audioOn) return;
  const [sb, eb] = await Promise.all([snd('tyre_skid_loop'), UP.whine ? null : snd('engine_nitro_loop')]); // fetch and decode before the gesture, so the first key or click starts sound at once
  if (AC.state === 'suspended' && !paused) await AC.resume(); if (audioOn) return;
  if (UP.whine) { // brushless: synthesized motor/ESC whine (silent off-throttle)
    const flt = AC.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 5200; flt.Q.value = 0.7; evGain = AC.createGain(); evGain.gain.value = 0; flt.connect(evGain).connect(masterGain);
    evOsc = [['sawtooth', 0.09], ['triangle', 0.1], ['sine', 0.06], ['square', 0.018]].map(([type, v]) => { const o = AC.createOscillator(), og = AC.createGain(); o.type = type; o.frequency.value = 300; og.gain.value = v; o.connect(og).connect(flt); o.start(); return o; });
  } else { // nitro: engine loop whose pitch follows a modelled rpm (drops on each gearshift)
    engineSrc = AC.createBufferSource(); engineSrc.buffer = eb; engineSrc.loop = true; engineGain = AC.createGain(); engineGain.gain.value = 0.3; engineSrc.connect(engineGain).connect(masterGain); engineSrc.start();
  }
  const sk = AC.createBufferSource(); sk.buffer = sb; sk.loop = true; skidGain = AC.createGain(); skidGain.gain.value = 0; sk.connect(skidGain).connect(masterGain); sk.start();
  audioOn = true;
  if (paused) masterGain.gain.value = 0;
}
snd('tyre_skid_loop').catch(() => {}); snd('engine_nitro_loop').catch(() => {}); // warm the cache; decoding works on a suspended context
addEventListener('keydown', (e) => { if (!paused) startAudio(); });
addEventListener('pointerdown', () => { if (!paused) startAudio(); });
window.addEventListener('focus', () => { if (!paused && AC.state === 'suspended') AC.resume().catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (!paused && document.visibilityState === 'visible' && AC.state === 'suspended') AC.resume().catch(() => {}); });
window.__game = {fs: FS, get audio() { return { on: audioOn, rpm, ev: evGain && evGain.gain.value, pr: engineSrc && engineSrc.playbackRate.value, f: evOsc && evOsc[0].frequency.value, ac: AC.state }; }, vis, get state() { return state; }, get hudo() { return hudo; }, setFinish(f) { finish = f; state = 'done'; }, dmg,  truck, keys, stunt, grid, scene, camera };

// ---- loop ----
// free-look: drag (mouse or touch) on the 3D view to orbit the camera around the truck; wheel / pinch zooms; recentres a few seconds after release
const orbit = { yaw: 0, pitch: 0, zoom: 1, last: 0, drag: false }, ptrs = new Map(); let pinch0 = 0, zoom0 = 1;
canvas.style.touchAction = 'none'; for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => { if (e.button > 0 && e.pointerType === 'mouse') return; canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); orbit.drag = true; orbit.last = performance.now(); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = orbit.zoom; } });
canvas.addEventListener('pointermove', (e) => { const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; orbit.last = performance.now();
  if (ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; if (pinch0 > 0) orbit.zoom = Math.max(0.4, Math.min(2.5, zoom0 * pinch0 / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)))); }
  else { orbit.yaw -= dx * 0.008; orbit.pitch = Math.max(-0.35, Math.min(1.2, orbit.pitch + dy * 0.006)); } });
const endPtr = (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) orbit.drag = false; orbit.last = performance.now(); };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); orbit.zoom = Math.max(0.4, Math.min(2.5, orbit.zoom * Math.exp(e.deltaY * 0.001))); orbit.last = performance.now(); }, { passive: false });
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(); const camHead = new THREE.Vector3(0, 0, 1); let camTumble = false; let camInit = false, acc = 0, last = performance.now();
const inp = new Input(keys); let camMode = 0; const CAMS = ['CHASE', 'FAR', 'HOOD', 'SIDE', 'TOP', 'SUSP_F', 'SUSP_R'];
let resetHoldActive = false, resetHoldTime = 0;
function getRespawnPose() {
  if (passed > 0 && stunt.checkpoints.length) {
    const ci = Math.min(passed - 1, stunt.checkpoints.length - 1);
    const c = stunt.checkpoints[ci];
    if (c) {
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...c.quat)); f.y = 0; f.normalize();
      const yaw = Math.atan2(f.x, f.z) * 180 / Math.PI;
      const hit = grid.ray(new THREE.Vector3(c.pos[0], c.pos[1] + 3, c.pos[2]), new THREE.Vector3(0, -1, 0), 40);
      const gy = hit ? c.pos[1] + 3 - hit.t : c.pos[1];
      return { pos: [c.pos[0], gy + 1.0, c.pos[2]], yaw, quat: c.quat };
    }
  }
  const c0 = stunt.checkpoints[0];
  if (c0) {
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...c0.quat)); f.y = 0; f.normalize();
    const yaw = Math.atan2(f.x, f.z) * 180 / Math.PI;
    const hit = grid.ray(new THREE.Vector3(c0.pos[0], c0.pos[1] + 3, c0.pos[2]), new THREE.Vector3(0, -1, 0), 40);
    const gy = hit ? c0.pos[1] + 3 - hit.t : c0.pos[1];
    return { pos: [c0.pos[0], gy + 1.0, c0.pos[2]], yaw, quat: c0.quat };
  }
  const sy = (terrainOf(kitMap)?.heightAt(kitMap.start.x, kitMap.start.z) || 0) + 1.0;
  return { pos: [kitMap.start.x, sy, kitMap.start.z], yaw: kitMap.start.yaw || 0, quat: null };
}
function rightSideTruck() {
  acc = 0;
  const cw = truck.comWorld();
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(truck.q);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
  else fwd.normalize();
  const yaw = Math.atan2(fwd.x, fwd.z) * 180 / Math.PI;

  // Find terrain/obstacle ground level directly underneath current position
  const rayStart = new THREE.Vector3(cw.x, cw.y + 4.0, cw.z);
  const hit = grid.ray(rayStart, new THREE.Vector3(0, -1, 0), 40);
  const terY = terrainOf(kitMap)?.heightAt(cw.x, cw.z) || 0;
  const gy = hit ? Math.max(terY, cw.y + 4.0 - hit.t) : Math.max(terY, cw.y);

  // Place truck right-side up slightly above ground with zero linear & angular momentum
  const placeY = Math.max(gy + 0.65, cw.y + 0.35);
  truck.place([cw.x, placeY, cw.z], yaw);
  truck.v.set(0, 0, 0); truck.w.set(0, 0, 0);
  truck.input.throttle = 0; truck.input.brake = 0;
  ipPrev.p.copy(truck.p); ipPrev.q.copy(truck.q);
  ipReal.p.copy(truck.p); ipReal.q.copy(truck.q);
  ipHave = false; ipOn = false;
  dropWait = 0;
  if (truck.sp) { truck.setMask?.(0); truck.sp.forEach((s) => (s.dead = false)); }
  dmg?.reset(true); fx?.clearMarks?.(); vis.cab?.reset(); prevP.copy(truck.comWorld());
  camInit = false;
  msg = 'RIGHTED TRUCK';
  play('checkpoint_pass', 0.6);
}
function respawn(isOutOfBounds = false) {
  if (DBG()) dbg('respawn outOfBounds=' + isOutOfBounds);
  acc = 0;
  const p = getRespawnPose();
  const dropHeight = isOutOfBounds ? 4.5 : 0;
  const spawnPos = [p.pos[0], p.pos[1] + dropHeight, p.pos[2]];
  truck.v.set(0, 0, 0); truck.w.set(0, 0, 0);
  if (p.quat) {
    truck.place(spawnPos, 0);
    truck.setPose([...spawnPos, ...p.quat]);
  } else {
    truck.place(spawnPos, p.yaw);
  }
  truck.v.set(0, 0, 0); truck.w.set(0, 0, 0);
  truck.input.throttle = 0; truck.input.brake = 0;
  ipPrev.p.copy(truck.p); ipPrev.q.copy(truck.q);
  ipReal.p.copy(truck.p); ipReal.q.copy(truck.q);
  ipHave = false; ipOn = false;
  if (isOutOfBounds) {
    dropWait = 2.0;
    dropPose.p.copy(truck.p);
    dropPose.q.copy(truck.q);
  } else {
    dropWait = 0;
  }
  if (truck.sp) { truck.setMask?.(0); truck.sp.forEach((s) => (s.dead = false)); }
  dmg?.reset(true); fx?.clearMarks?.(); vis.cab?.reset(); prevP.copy(truck.comWorld());
  camInit = false;
  msg = isOutOfBounds ? 'OFF TRACK - RESET' : (passed > 0 ? 'CHECKPOINT RESPAWN' : 'START RESPAWN');
}
const mapBounds = (() => {
  const ter = terrainOf(kitMap);
  if (ter && ter.bb) {
    const margin = 100;
    return { x0: ter.bb.x0 - margin, x1: ter.bb.x1 + margin, z0: ter.bb.z0 - margin, z1: ter.bb.z1 + margin };
  }
  const half = Math.max(kitMap.size || 400, 200) / 2 + 150;
  return { x0: -half, x1: half, z0: -half, z1: half };
})();
function checkOutOfBounds() {
  if (state !== 'running') return false;
  const cw = truck.comWorld();
  if (cw.y < -3.0 || cw.x < mapBounds.x0 || cw.x > mapBounds.x1 || cw.z < mapBounds.z0 || cw.z > mapBounds.z1) {
    respawn(true);
    return true;
  }
  return false;
}
function updateInput(now = performance.now(), last0 = now) {
  if (window.__padInfo && DBG() && window.__padInfo !== window.__padShown) { window.__padShown = window.__padInfo; dbg(window.__padInfo); }
  const s = inp.poll();
  if (!paused && (!audioOn || AC.state === 'suspended') && (s.throttle > 0.05 || s.brake > 0.05 || Math.abs(s.steer) > 0.1 || s.camPressed || s.resetPressed || s.acceptPressed || s.menuPressed)) {
    startAudio();
  }
  if (paused) {
    if (s.upPressed) pausePad('u');
    else if (s.downPressed) pausePad('d');
    else if (s.leftPressed) pausePad('l');
    else if (s.rightPressed) pausePad('r');
    if (s.acceptPressed) pausePad('a');
    if (s.backPressed) pausePad('b');
    if (s.menuPressed) pausePad('menu');
    return;
  }
  const isRoundOver = state === 'done' || (FS && FS.over);
  if (isRoundOver) {
    truck.input.throttle = 0;
    truck.input.steer = 0;
    truck.input.hand = 0;
    truck.input.soft = false;
    // Apply light brakes so it rolls smoothly to a stop
    truck.input.brake = Math.abs(truck.forwardSpeed()) > 0.15 ? 0.22 : 0;
  } else if (fuelEmpty) {
    truck.input.throttle = 0;
    truck.input.brake = s.brake;
    truck.input.steer = s.steer;
    truck.input.hand = truck.ver === 12 && key('Space') ? 1 : 0;
    truck.input.soft = false;
  } else {
    truck.input.throttle = s.throttle;
    truck.input.brake = s.brake;
    truck.input.steer = s.steer;
    truck.input.hand = truck.ver === 12 && key('Space') ? 1 : 0;
    truck.input.soft = s.soft;
  }
  if (FS && FS.over) {
    if (s.leftPressed || s.upPressed) FS.pad('l');
    else if (s.rightPressed || s.downPressed) FS.pad('r');
    if (s.acceptPressed || s.resetPressed) {
      if (FS.endBtnIdx === 1) FS.triggerMenu();
      else FS.triggerRestart();
      return;
    }
    if (s.menuPressed || s.backPressed) { FS.triggerMenu(); return; }
  }
  if (state === 'done') {
    if (s.acceptPressed || s.resetPressed) { finish = null; resetTruck(); return; }
    if (s.menuPressed || s.backPressed) { goToMenu(); return; }
  }
  if (s.menuPressed) {
    if (state !== 'done' && !(FS && FS.over)) {
      setPaused(true);
      return;
    }
    goToMenu();
    return;
  }
  if (s.lightsPressed) toggleLights();
  if (s.camPressed) { camMode = (camMode + 1) % CAMS.length; camInit = false; }

  // Restart / Reset input handling:
  // Short tap: right-side the truck on release
  // Long hold (>= 1.0s): full race restart (resetTruck)
  if (s.resetPressed) {
    resetHoldActive = true;
    resetHoldTime = 0;
  }
  if (resetHoldActive) {
    if (s.resetDown) {
      resetHoldTime += Math.min(0.05, (now - last0) / 1000);
      if (resetHoldTime >= 1.0) {
        resetHoldActive = false;
        resetHoldTime = 0;
        if (DBG()) dbg('long hold restart race');
        finish = null;
        resetTruck();
        msg = 'RACE RESTARTED';
      }
    } else {
      // Released before 1.0s -> Right-side the truck
      resetHoldActive = false;
      const holdDuration = resetHoldTime;
      resetHoldTime = 0;
      if (holdDuration < 1.0) {
        if (DBG()) dbg('short press right-side truck');
        rightSideTruck();
      }
    }
  }
}
// surface under a wheel: original arena = dust everywhere (unchanged); our maps: tarmac banks / dirt track / grass
const TER = KIT ? terrainOf(kitMap) : null, surfAt = (x, z) => { if (!KIT) return 'dirt'; if (!TER) return 'grass'; const r = TER.sample(x, z); return r.asph > 0.45 ? 'tarmac' : r.dirt > 0.5 || r.top > 0.5 ? 'dirt' : 'grass'; };
let tarmacNow = false;
function finishRun() {
  state = 'done';
  const newBest = raceBestTime <= 0 || runTime < raceBestTime;
  const prevBestTime = raceBestTime;
  if (newBest) {
    raceBestTime = runTime;
    raceBestSplits = [...currentRunSplits];
    try {
      localStorage.setItem(raceBestKey, String(runTime));
      localStorage.setItem(raceBestSplitsKey, JSON.stringify(raceBestSplits));
    } catch (e) {}
  }
  const finishPts = 500; // modest points for finishing the race
  const timeBonus = newBest ? 500 : Math.max(0, Math.round((60 - Math.min(60, runTime)) * 10)); // bonus for beating the record
  const stuntBonus = raceStuntScore;
  const totScore = finishPts + stuntBonus + timeBonus;
  score = totScore;
  const earnedCredits = Math.round(totScore * 0.5) + (newBest ? 1000 : 250);
  creditBal = Up.addCredits(earnedCredits);

  finish = {
    isRace: true,
    time: runTime,
    best: newBest,
    hasPrevRecord: prevBestTime > 0,
    finishPts,
    stuntPts: stuntBonus,
    timeBonus,
    score: totScore,
    credits: earnedCredits,
    hi: raceBestTime,
    splits: currentRunSplits
  };
  play(newBest ? 'new_best' : 'finish_pass', 0.9);
}

function checkpoints() {
  if (passed >= stunt.checkpoints.length) return;
  const c = stunt.checkpoints[passed], m = cpMeshes[passed];
  if (!m) return;
  const inv = m.quaternion.clone().invert();
  const a = prevP.clone().sub(m.position).applyQuaternion(inv);
  const b = truck.comWorld().sub(m.position).applyQuaternion(inv);

  // Crossing gate plane: sign of z changes
  if ((a.z <= 0) !== (b.z <= 0)) {
    const t = a.z / (a.z - b.z);
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    if (Math.abs(x) <= (c.width || 18) / 2 && y >= -1 && y <= (c.height || 9)) {
      const gateNum = passed + 1;
      passed++;
      if (m.userData?.veil) m.userData.veil.visible = false;
      play(passed >= stunt.checkpoints.length ? 'finish_pass' : 'checkpoint_pass', 0.85);

      // Split calculation against record split at this gate
      const recordSplitTime = raceBestSplits && raceBestSplits[gateNum - 1] ? raceBestSplits[gateNum - 1].time : null;
      const delta = recordSplitTime != null ? (runTime - recordSplitTime) : null;
      const splitInfo = { gate: gateNum, time: runTime, delta, recordTime: recordSplitTime };
      currentRunSplits.push(splitInfo);
      liveSplit = { ...splitInfo, timer: 3.5 };

      msg = `GATE ${passed}/${stunt.checkpoints.length}`;
      if (passed >= stunt.checkpoints.length) {
        msg = 'RACE FINISH!';
        finishRun();
      }
    }
  }
}
// Auto truck detail: after a 2 s warm-up, measure the frame rate for 5 s of play; below 27 fps step the truck model down one level and reload.
let lodProbe = LOD_MODE === 'auto' && TRUCK_LOD !== 'low' ? { t0: 0, n: 0, start: performance.now() } : null;
function probeLod(now) {
  if (document.hidden || paused || now - lodProbe.start < 2000) { lodProbe.t0 = 0; return; }
  if (!lodProbe.t0) { lodProbe.t0 = now; lodProbe.n = 0; return; }
  lodProbe.n++;
  if (now - lodProbe.t0 < 5000) return;
  const fps = lodProbe.n / ((now - lodProbe.t0) / 1000); lodProbe = null;
  if (fps < 27) { lsSet('mts_lod_auto', LOD_LEVELS[LOD_LEVELS.indexOf(TRUCK_LOD) + 1]); location.reload(); }
}
function frame(now) {
  perf.begin(now);
  if (lodProbe) probeLod(now);
  const last0 = last;
  const frameDt = Math.min(LOWQ ? 0.05 : 0.1, (now - last) / 1000);
  last = now;
  updateInput(now, last0);
  if (paused) {
    acc = 0;
    renderer.autoClear = true; draw3d();
    perf.end();
    requestAnimationFrame(frame);
    return;
  }
  acc += frameDt;
  if (state === 'ready' && (truck.input.throttle || truck.input.brake)) { state = 'running'; FS?.start(); }
  if (FS) { if (FS.state === 'ready' && (Math.abs(truck.input.throttle) > 0.05 || truck.input.brake > 0.05)) FS.start(); FS.render(); }
  if (state === 'countdown' || state === 'false') {
    const dtf = Math.min(0.1, (now - last0) / 1000); cd += dtf;
    const pressed = truck.input.throttle > 0.3 || truck.input.brake > 0.3; truck.input.throttle = 0; truck.input.brake = 0;
    if (state === 'countdown') {
      const ph = cd < 1.0 ? 0 : cd < 1.5 ? 1 : cd < 2.0 ? 2 : cd < 2.5 ? 3 : 4;
      if (ph !== lightIdx) { lightIdx = ph; play(ph === 4 ? 'start_green' : 'start_amber', 0.8); }
      if (ph >= 1 && ph < 4 && pressed) { state = 'false'; cd = 0; lightIdx = 5; play('false_start', 0.9); }
      else if (ph === 4) { state = 'running'; runTime = 0; }
    } else if (cd > 1.5) { if (DBG()) dbg('false start -> reset'); resetTruck(); }
  }
  if (dropWait > 0) {
    const dtf = Math.min(0.1, (now - last0) / 1000);
    dropWait -= dtf;
    truck.p.copy(dropPose.p);
    truck.q.copy(dropPose.q);
    truck.v.set(0, 0, 0);
    truck.w.set(0, 0, 0);
    truck.input.throttle = 0;
    truck.input.brake = 0;
    acc = 0;
    if (dropWait <= 0) {
      dropWait = 0;
      truck.v.set(0, 0, 0);
      truck.w.set(0, 0, 0);
    }
  }
  if (state === 'countdown' || state === 'false' || dropWait > 0 || hidden('physics')) acc = 0; // truck is held until green or drop release
  else while (acc >= DT) {
    prevP.copy(truck.comWorld());
    ipPrev.p.copy(truck.p);
    ipPrev.q.copy(truck.q);
    ipHave = true;
    truck.step(DT);
    if (FS) FS.step(truck, DT, dmg);
    if (dmg && truck.impact && state !== 'countdown') dmg.check(truck, DT);
    if (checkOutOfBounds()) break;
    // Fuel / Battery runtime depletion (12 min base = 720s)
    if (state === 'running' && !fuelEmpty) {
      const thr = Math.max(0, truck.input.throttle);
      // Burn rate: base idle consumption + throttle consumption, scaled by tuning fuelRate
      const burnRate = (0.45 + 0.9 * thr) * (truck.fuelRate || 1.0);
      fuelRemaining = Math.max(0, fuelRemaining - DT * burnRate);
      if (fuelRemaining <= 0) {
        fuelRemaining = 0;
        fuelEmpty = true;
        truck.input.throttle = 0;
        msg = UP.whine ? 'BATTERY DEPLETED!' : 'OUT OF FUEL!';
        play('break_pipe', 0.85);
      }
    }
    acc -= DT;
    if (state === 'running') {
      runTime += DT;
      const c = truck.comWorld();
      rec.push(c.x, c.y, c.z, truck.q.x, truck.q.y, truck.q.z, truck.q.w, 0);
      if (isRace) checkpoints();
    }
  }
  tarmacNow = !KIT; if (truck.rigid) for (let i = 0; i < 4; i++) { const w = truck.wheels[i]; if (!w.contact || truck.sp[i].dead) { fx.last[i] = null; continue; }
    const c = truck.localToWorld(truck.sp[i].p), pt = c.clone().addScaledVector(w.nrm, -truck.sp[i].r), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(truck.q), vel = truck.v.clone().add(new THREE.Vector3().crossVectors(truck.w, c.clone().sub(truck.comWorld())));
    const lat = vel.clone().sub(w.nrm.clone().multiplyScalar(vel.dot(w.nrm))); const slipSide = Math.abs(lat.dot(new THREE.Vector3().crossVectors(fwd, w.nrm).normalize()));
    const slipLong = Math.max((i > 1 && truck.hand > 0.3) ? Math.abs(lat.dot(fwd)) : 0, (truck.wspin?.[i] || 0) * 6); // wheelspin on launch also marks
    const surf = surfAt(pt.x, pt.z); if (surf === 'tarmac') tarmacNow = true;
    fx.wheel(i, pt, w.nrm, fwd, Math.max(slipSide, slipLong), lat.length(), Math.min(0.05, (now - last0) / 1000), surf); }
  // Nitro exhaust smoke from the downward-facing expansion pipe outlet, thicker with throttle; none on brushless or when the engine is dead
  if (vis.exhaustTip && !UP.whine && state === 'running' && !fuelEmpty && Math.random() < 0.35 + 0.65 * Math.abs(truck.input.throttle)) {
    const th = Math.abs(truck.input.throttle), back = vis.exhaustDir.clone().applyQuaternion(truck.q).multiplyScalar(0.8 + th * 1.4);
    fx.emit('smoke', truck.localToWorld(vis.exhaustTip.clone()), back.add(truck.v).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.3, (Math.random() - 0.5) * 0.3)), 0.5 + Math.random() * 0.4, 0.12, 0.5 + th * 0.3, 0.18 + th * 0.17);
  }
  fx.update(Math.min(0.05, (now - last0) / 1000));
  interp(); syncTruck(vis, truck, Math.min(0.05, (now - last0) / 1000)); dmg?.update(Math.min(0.05, (now - last0) / 1000));
  if (truck.snapped) { truck.snapped = false; msg = 'DRIVESHAFT SNAPPED - upgrade shafts / diffs'; play('break_pipe', 0.8); } else if (truck.snapT <= 0 && msg.startsWith('DRIVESHAFT')) msg = '';
  if (audioOn) { const dta = Math.min(0.1, Math.max(0.001, (now - last0) / 1000)), thrIn = Math.max(0, Math.min(1, truck.gear === 0 ? truck.input.brake : truck.input.throttle)), spd = Math.abs(truck.forwardSpeed()), ctc = truck.wheels.some((w) => w.contact), tAC = AC.currentTime;
    if (evOsc) { // electric whine: pitch follows wheel speed + throttle, silent when off the throttle
      const f = 300 + Math.min(spd, 40) * 55 + thrIn * 300 * (ctc ? 1 : 2.2); evOsc[0].frequency.setTargetAtTime(f, tAC, 0.04); evOsc[1].frequency.setTargetAtTime(f * 2.01, tAC, 0.04); evOsc[2].frequency.setTargetAtTime(f * 3.02, tAC, 0.04); evOsc[3].frequency.setTargetAtTime(f * 6.1, tAC, 0.04);
      evGain.gain.setTargetAtTime(thrIn > 0.02 ? (0.1 + 0.26 * thrIn + 0.1 * Math.min(1, spd / 22)) : 0, tAC, thrIn > 0.02 ? 0.035 : 0.05);
    } else if (engineSrc) { // nitro: rpm model per gear (ratio within the gear's speed band) so upshifts audibly drop the revs
      const Gr = truck.gears || {}, vtop = truck.P.drive.topSpeed * (UP.spd || 1), g = truck.gear, u0 = Gr.up ? Math.min(Gr.up[0], vtop) : vtop, u1 = Gr.up ? Math.min(Gr.up[1], vtop) : vtop;
      const lo = g === 2 ? Gr.down[0] : g === 3 ? Gr.down[1] : 0, hi = g === 0 ? 12 : g === 1 ? u0 : g === 2 ? u1 : vtop, ratio = Math.max(0, Math.min(1, (spd - lo) / Math.max(4, hi - lo)));
      let tgt = 0.2 + 0.6 * ratio + 0.2 * thrIn; if (thrIn > 0.05 && g <= 1 && spd < 5) tgt = Math.max(tgt, 0.4 + 0.45 * thrIn); if (thrIn < 0.05) tgt = Math.max(0.2, tgt - 0.1); if (!ctc) tgt = 0.3 + 0.65 * thrIn;
      rpm += (tgt - rpm) * (1 - Math.exp(-(tgt < rpm - 0.12 ? 11 : thrIn > 0.05 ? 6 : 2.5) * dta));
      engineSrc.playbackRate.value = (0.5 + rpm * 1.55) * (UP.pitch || 1); engineGain.gain.value = 0.26 + 0.14 * thrIn;
    }
    skidGain.gain.value = (!replay && tarmacNow && ctc && (Math.abs(truck.w.y) > 1.1 && truck.speed > 6 || Math.max(...(truck.wspin || [0])) > 0.5)) ? 0.4 : 0; }
  // chase camera
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(truck.q); fwd.y = 0; fwd.normalize();
  { // Forza-style chase heading: trails the truck's heading with a lag (sway through corners), leans toward the direction of travel at speed, and is FROZEN while the truck is flipping/tumbling so the camera just watches it roll
    const upY = new THREE.Vector3(0, 1, 0).applyQuaternion(truck.q).y, dtc = Math.min(0.1, (now - last0) / 1000);
    if (!camInit) { camHead.copy(fwd); camTumble = false; }
    if (camTumble ? upY > 0.75 : upY < 0.45) camTumble = !camTumble;
    if (!camTumble) {
      const tgt = fwd.clone(), vh = truck.v.clone(); vh.y = 0; const sp = vh.length();
      if (sp > 6 && vh.dot(fwd) > 0) { vh.divideScalar(sp); tgt.lerp(vh, Math.min(0.5, (sp - 6) / 24)).normalize(); }
      const a0 = Math.atan2(camHead.x, camHead.z), a1 = Math.atan2(tgt.x, tgt.z); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const a = a0 + da * (1 - Math.exp(-(upY > 0.75 ? 3.2 : 1.2) * dtc)); camHead.set(Math.sin(a), 0, Math.cos(a));
    }
    fwd.copy(camHead);
  }
  const cw = truck.comWorld(), up3 = new THREE.Vector3(0, 1, 0), cm = CAMS[camMode], tf = new THREE.Vector3(0, 0, 1).applyQuaternion(truck.q);
  let want, look;
  if (cm === 'FAR') { want = cw.clone().addScaledVector(fwd, -18).add(new THREE.Vector3(0, 7, 0)); look = cw.clone().addScaledVector(fwd, 6); }
  else if (cm === 'HOOD') { want = cw.clone().addScaledVector(tf, 0.9).add(new THREE.Vector3(0, 1.15, 0).applyQuaternion(truck.q)); look = want.clone().addScaledVector(tf, 12); }
  else if (cm === 'SIDE') { const side = new THREE.Vector3(1, 0, 0).applyQuaternion(truck.q); side.y = 0; side.normalize(); want = cw.clone().addScaledVector(side, 9).add(new THREE.Vector3(0, 2.2, 0)); look = cw.clone().add(new THREE.Vector3(0, 0.8, 0)); }
  else if (cm === 'TOP') { want = cw.clone().add(new THREE.Vector3(0, 24, 0)).addScaledVector(fwd, -4); look = cw.clone().addScaledVector(fwd, 2); }
  else if (cm === 'SUSP_F') {
    // Front suspension camera: mounted ahead of the front axle, locked to the axle housing's frame, viewing shocks/springs/diff
    const ax0 = vis.axles[0]; ax0.updateMatrixWorld(true);
    want = ax0.localToWorld(new THREE.Vector3(0.55, 0.35, 3.2));
    look = ax0.localToWorld(new THREE.Vector3(0.0, 0.75, 1.45));
  }
  else if (cm === 'SUSP_R') {
    // Rear suspension camera: mounted behind the rear axle, locked to the axle housing's frame, viewing 4-link & shocks
    const ax1 = vis.axles[1]; ax1.updateMatrixWorld(true);
    want = ax1.localToWorld(new THREE.Vector3(0.55, 0.35, -3.2));
    look = ax1.localToWorld(new THREE.Vector3(0.0, 0.75, -1.45));
  }
  else { want = cw.clone().addScaledVector(fwd, -9).add(new THREE.Vector3(0, 3.6, 0)); look = cw.clone().addScaledVector(fwd, 4).add(new THREE.Vector3(0, 1.2, 0)); }
  { // apply free-look offsets (recentre smoothly after 3 s without input)
    const idle = !orbit.drag && now - orbit.last > 3000; if (idle) { const k = 1 - Math.exp(-2.5 * Math.min(0.1, (now - last0) / 1000)); orbit.yaw -= orbit.yaw * k; orbit.pitch -= orbit.pitch * k; orbit.zoom += (1 - orbit.zoom) * k; }
    if (Math.abs(orbit.yaw) > 1e-3 || Math.abs(orbit.pitch) > 1e-3 || Math.abs(orbit.zoom - 1) > 1e-3) {
      if (cm === 'HOOD' || cm === 'SUSP_F' || cm === 'SUSP_R') { const d = look.clone().sub(want), r = d.length(), th = Math.atan2(d.x, d.z) + orbit.yaw, ph = Math.max(-1.2, Math.min(1.2, Math.atan2(d.y, Math.hypot(d.x, d.z)) - orbit.pitch)); look = want.clone().add(new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)).multiplyScalar(r)); }
      else { const o = want.clone().sub(look.clone().setY(cw.y)), anchor = cm === 'TOP' ? cw : cw; const d = want.clone().sub(anchor), r = d.length() * orbit.zoom, th = Math.atan2(d.x, d.z) + orbit.yaw, ph = Math.max(-0.12, Math.min(1.45, Math.atan2(d.y, Math.hypot(d.x, d.z)) + orbit.pitch)); want = anchor.clone().add(new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph)).multiplyScalar(r)); }
    }
  }
  const cdt = Math.min(0.1, (now - last0) / 1000), isRigidCam = (cm === 'HOOD' || cm === 'SUSP_F' || cm === 'SUSP_R'), kp = isRigidCam ? 1 : 1 - Math.exp(-7.7 * cdt), kl = isRigidCam ? 1 : 1 - Math.exp(-13.4 * cdt);
  if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
  camPos.lerp(want, kp); camLook.lerp(look, kl); camera.position.copy(camPos); camera.lookAt(camLook); if (window.__camOverride) window.__camOverride(camera, truck);
  sky.position.copy(camera.position);
  hud.textContent = keys.has('F1') ? `${Input.getLayout() === 'wasd' ? 'WASD' : 'Arrows'} drive - Ctrl soft throttle - B camera - L lights - R tap right-side / hold restart - gamepad/touch supported` : '';
  gfx?.follow(truck.comWorld(), sky.userData.sunDir || SUN_DEF); unInterp();
  renderer.autoClear = true; draw3d();
  if (DBG() && (dbgN++ < 5 || dbgN % 300 === 0)) { const gl = renderer.getContext(); dbg(`frame ${dbgN} calls ${renderer.info.render.calls} tris ${renderer.info.render.triangles} tex ${renderer.info.memory.textures} geo ${renderer.info.memory.geometries} glerr ${gl.getError()} lost ${gl.isContextLost()} state ${state}`); }
  if (liveSplit && liveSplit.timer > 0) {
    liveSplit.timer -= Math.min(0.05, (now - last0) / 1000);
    if (liveSplit.timer <= 0) liveSplit = null;
  }
  const f3 = new THREE.Vector3(0, 0, 1).applyQuaternion(truck.q);
  const r3 = new THREE.Vector3(1, 0, 0).applyQuaternion(truck.q);
  const restartProgress = resetHoldActive ? Math.min(1, resetHoldTime / 1.0) : 0;
  const isElectric = !!UP.whine;
  const fuelPct = fuelRemaining / FUEL_CAPACITY;
  if (!hidden('hud')) hudo.update({ credits: replay || isFreestyle ? null : creditBal, free, fs: isFreestyle, isRace, gear: truck.gear, speed: truck.speed, fwd: truck.forwardSpeed(), throttle: truck.input.throttle, roll: Math.asin(THREE.MathUtils.clamp(-r3.y, -1, 1)), pitch: Math.asin(THREE.MathUtils.clamp(f3.y, -1, 1)), lights: (state === 'countdown' || state === 'false') ? lightIdx : (state === 'running' && isRace && runTime < 1.0 ? 4 : -1), finish, wrecked: dmg?.wrecked, lostWheels: dmg ? dmg.lost.filter(Boolean).length : 0, time: runTime, score, hiScore, cp: passed, cpTotal: stunt.checkpoints.length, msg, state, raceBestTime, split: liveSplit, restartProgress, fuelPct, isElectric, fuelEmpty });
  perf.end();
  requestAnimationFrame(frame);

}
requestAnimationFrame(frame);
