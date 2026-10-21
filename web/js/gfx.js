import * as THREE from 'three';

// generated textures: tileable grey detail noise for the terrain shader, and an equirect sky for reflections
export function detailTex() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const g = (n) => Array.from({ length: n * n }, rnd);
  const oct = [[8, g(8), 0.5], [16, g(16), 0.28], [32, g(32), 0.15], [64, g(64), 0.07]];
  const ctx = c.getContext('2d'), im = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const [n, a, w] of oct) { // wrapping bilinear lattice noise, so the tile repeats seamlessly
      const fx = x / N * n, fy = y / N * n, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      v += w * ((a[y0 * n + x0] * (1 - sx) + a[y0 * n + x1] * sx) * (1 - sy) + (a[y1 * n + x0] * (1 - sx) + a[y1 * n + x1] * sx) * sy);
    }
    const i = (y * N + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.max(0, Math.min(255, v * 255)); im.data[i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; return t;
}
export function envTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#192c71'); g.addColorStop(0.2, '#8f9bae'); g.addColorStop(0.4, '#ede8b9'); g.addColorStop(0.5, '#7d7248'); g.addColorStop(0.62, '#746e42'); g.addColorStop(1, '#5a522f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
  const sun = ctx.createRadialGradient(64, 36, 0, 64, 36, 30); sun.addColorStop(0, 'rgba(255,250,230,1)'); sun.addColorStop(1, 'rgba(255,250,230,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Quality mode: ?q=potato|low|high, else the saved pause-menu choice (mts_quality), else auto (low on touch devices).
export const QMODE = (() => { const ok = (v) => (v === 'potato' || v === 'low' || v === 'high' ? v : null); const p = ok(new URLSearchParams(location.search).get('q')); if (p) return p; try { return ok(localStorage.getItem('mts_quality')); } catch (e) { return null; } })();
// Truck model detail: saved pause-menu choice (mts_lod: auto|high|medium|low). Auto starts from the quality mode and steps down once if the frame rate is poor (game.js saves the result in mts_lod_auto).
const LOD_LEVELS = ['high', 'medium', 'low'];
const lodGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
export const LOD_MODE = LOD_LEVELS.includes(lodGet('mts_lod')) ? lodGet('mts_lod') : 'auto';
export const POTATO = QMODE === 'potato';
export const LOWQ = QMODE ? QMODE !== 'high' : (() => { try { return matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent); } catch (e) { return false; } })();
export const TRUCK_LOD = LOD_MODE !== 'auto' ? LOD_MODE : LOD_LEVELS.includes(lodGet('mts_lod_auto')) ? lodGet('mts_lod_auto') : POTATO ? 'low' : LOWQ ? 'medium' : 'high';
export { LOD_LEVELS };
/** Modern rendering layer (disable with ?gfx=classic): tone mapping, soft shadows, terrain detail texture, reflective truck paint, smooth normals. */
export async function setupGfx({ renderer, scene, sun, world, vis, quality = LOWQ ? 'low' : 'high' }) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(POTATO ? (parseFloat(new URLSearchParams(location.search).get('rs')) || 0.5) : Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : 1)); // potato renders at half resolution
  const low = quality === 'low'; renderer.shadowMap.enabled = !low; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // lighting: sky/ground hemisphere + low sun, replaces flat ambient
  scene.children.filter((o) => o.isAmbientLight).forEach((o) => scene.remove(o));
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x8a7b55, 1.1); scene.add(hemi);
  sun.color.set(0xfff0d8); sun.intensity = 2.6; sun.castShadow = true;
  const S = low ? 28 : 42; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 220 });
  sun.shadow.mapSize.set(low ? 512 : 4096, low ? 512 : 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; scene.add(sun.target);
  // terrain: the original is one 1024px atlas over the whole 6 km arena, so we add procedural detail in the shader (infinite resolution): multi-octave colour variation,
  // micro bump mapping for lighting, distance-faded so it never shimmers. Terrain becomes a standard PBR material.
  const detail = detailTex(); detail.anisotropy = low ? 2 : 16;
  const OCT = low ? 3 : 5;
  for (const n of ['sceneryc', 'sceneryb', 'scenerya']) {
    const m = world.getObjectByName(n); if (!m) continue; m.receiveShadow = n !== 'scenerya'; m.castShadow = n === 'sceneryb';
    if (m.material.map) { m.material.map.anisotropy = low ? 4 : 16; m.material.map.needsUpdate = true; }
    if (n === 'sceneryc' || n === 'sceneryb') { const old = m.material; m.material = new THREE.MeshStandardMaterial({ map: old.map, side: old.side, alphaTest: old.alphaTest, roughness: 0.95, metalness: 0 }); }
    const mat = m.material;
    if (n === 'sceneryc' && !POTATO) mat.onBeforeCompile = (sh) => {
      sh.uniforms.detailMap = { value: detail };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D detailMap; varying vec3 vWp; float tHeight = 0.5;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < ${OCT}; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
{ vec2 p = vWp.xz; float dist = length(vViewPosition), fine = exp(-dist * 0.018), mid = exp(-dist * 0.006);
  float n1 = fbm(p * 0.045), n2 = fbm(p * 0.35 + 7.0), n3 = fbm(p * 2.2 + 3.0) * mid, aa4 = 1.0 - smoothstep(0.35, 0.9, fwidth(p.x * 14.0) + fwidth(p.y * 14.0)), aa5 = 1.0 - smoothstep(0.35, 0.9, fwidth(p.x * 55.0) + fwidth(p.y * 55.0)), n4 = mix(0.5, vnoise(p * 9.0), aa4) * fine + 0.5 * (1.0 - fine), n5 = mix(0.5, vnoise(p * 55.0), aa5 * fine);
  float orig = texture2D(detailMap, p * 0.35).r;
  float k = 0.62 + 0.55 * n1 + 0.30 * (n2 - 0.5) + 0.22 * (n3 - 0.35) + 0.07 * (n4 - 0.5) + 0.03 * (n5 - 0.5) + 0.25 * (orig - 0.5);
  diffuseColor.rgb *= clamp(k, 0.25, 1.7) * mix(vec3(1.04, 0.98, 0.90), vec3(0.93, 1.0, 0.95), smoothstep(0.3, 0.7, n1));
  tHeight = 0.6 * n2 + 0.3 * n3 + 0.1 * n4; }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(tHeight), hy = dFdy(tHeight); vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
  float amt = 1.2 * exp(-length(vViewPosition) * 0.012); normal = normalize(abs(det) * normal - amt * sign(det) * (hx * r1 + hy * r2)); }`);
    };
    mat.needsUpdate = true;
  }
  // potato: the whole world uses plain Lambert shading and no anisotropic filtering (the big grass plane is costly on weak GPUs)
  if (POTATO) world.traverse((o) => {
    if (!o.isMesh) return; const old = o.material; if (!old || Array.isArray(old) || !old.color || old.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return; // keep the track terrain's own dirt shader
    if (old.map) old.map.anisotropy = 1;
    const m = new THREE.MeshLambertMaterial({ map: old.map, color: old.color, vertexColors: old.vertexColors, side: old.side, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest, reflectivity: 0 });
    o.material = m; o.castShadow = o.receiveShadow = false;
  });
  // truck: the RC model ships its own PBR materials (rctruck.js); here only shadows and the reflection environment
  vis.root.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; } });
  if (low) return { follow(pos, dirToSun) { sun.target.position.copy(pos); sun.position.copy(pos).addScaledVector(dirToSun, 90); } };
  const env = envTex();
  const pm = new THREE.PMREMGenerator(renderer), envRT = pm.fromEquirectangular(env); scene.environment = envRT.texture; scene.environmentIntensity = 0.6;
  return { follow(pos, dirToSun) { sun.target.position.copy(pos); sun.position.copy(pos).addScaledVector(dirToSun, 90); } };
}
/** Re-compute smooth vertex normals for a geometry (merging coincident vertices, crease angle in degrees). */
export function smoothNormals(geo, crease = 50) {
  const pos = geo.getAttribute('position'), idx = geo.index.array, n = pos.count, key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  const faceN = [], groups = new Map();
  for (let f = 0; f < idx.length; f += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, idx[f]), b = new THREE.Vector3().fromBufferAttribute(pos, idx[f + 1]), c = new THREE.Vector3().fromBufferAttribute(pos, idx[f + 2]);
    const fn = b.sub(a).cross(c.sub(a)); faceN.push(fn);
    for (let k = 0; k < 3; k++) { const kk = key(idx[f + k]); if (!groups.has(kk)) groups.set(kk, []); groups.get(kk).push(f / 3); }
  }
  const cosC = Math.cos(crease * Math.PI / 180), nrm = geo.getAttribute('normal'), acc = new Float32Array(n * 3);
  for (let f = 0; f < idx.length; f += 3) for (let k = 0; k < 3; k++) {
    const vi = idx[f + k], mine = faceN[f / 3].clone().normalize(), sum = new THREE.Vector3();
    for (const g of groups.get(key(vi))) { const o = faceN[g]; if (o.clone().normalize().dot(mine) >= cosC) sum.add(o); }
    sum.normalize(); acc[vi * 3] = sum.x; acc[vi * 3 + 1] = sum.y; acc[vi * 3 + 2] = sum.z;
  }
  const ng = new THREE.BufferAttribute(acc, 3); geo.setAttribute('normal', ng); return geo;
}
