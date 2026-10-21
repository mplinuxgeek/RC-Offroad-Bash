import * as THREE from 'three';
const base = './assets/';
const texCache = new Map(), meshCache = new Map();
export let manifest;
export async function loadManifest() { manifest = await (await fetch(base + 'manifest.json')).json(); return manifest; }
export function texture(name, { repeat = false } = {}) {
  const png = name.replace(/\.dds$/i, '.png');
  const key = png + repeat;
  if (!texCache.has(key)) {
    const t = new THREE.TextureLoader().load(base + 'tex/' + png, undefined, undefined, () => {
      const alt = png.replace(/\.png$/, '.jpg'); t.image = null; new THREE.TextureLoader().load(base + 'tex/' + alt, (t2) => { t.image = t2.image; t.needsUpdate = true; });
    });
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.flipY = false;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
// Mesh bin: u32 nVerts,u32 nIdx, f32[8*n] (pos,normal,uv), u16[nIdx]
export async function geometry(name) {
  if (meshCache.has(name)) return meshCache.get(name);
  const p = (async () => {
    const buf = await (await fetch(base + 'mesh/' + name + '.bin')).arrayBuffer();
    const [n, ni] = new Uint32Array(buf, 0, 2);
    const v = new Float32Array(buf, 8, n * 8);
    const idx = new Uint16Array(buf.slice(8 + n * 32, 8 + n * 32 + ni * 2));
    const g = new THREE.BufferGeometry();
    const ib = new THREE.InterleavedBuffer(v.slice(), 8);
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    g.setAttribute('uv', new THREE.InterleavedBufferAttribute(ib, 2, 6));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  })();
  meshCache.set(name, p); return p;
}
export async function makeMesh(name, matOpts = {}) {
  const m = manifest.meshes[name];
  const g = await geometry(name);
  const mat = new THREE.MeshLambertMaterial({ map: texture(m.tex), side: THREE.DoubleSide, ...matOpts });
  return new THREE.Mesh(g, mat);
}
