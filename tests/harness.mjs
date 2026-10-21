// Node harness: flat-ground MonsterTruck without browser globals.
import fs from 'fs';
const W = decodeURIComponent(new URL('../web/', import.meta.url).pathname);
globalThis.location = { search: '' };
globalThis.localStorage = { getItem: () => null };
globalThis.fetch = async (u) => { const s = fs.readFileSync(W + String(u).replace(/^\.\//, '')); return { ok: true, json: async () => JSON.parse(s) }; };
const { TriGrid } = await import('../web/js/physics.js');
const { MonsterTruck, loadTruckSpheres } = await import('../web/js/mt_physics.js');
export async function setup() {
  await loadTruckSpheres();
  const g = new TriGrid(4), S = 200, v = new Float32Array(4 * 8);
  [[-S, 0, -S], [S, 0, -S], [S, 0, S], [-S, 0, S]].forEach((p, i) => { v.set([...p, 0, 1, 0, 0, 0], i * 8); });
  g.addMesh(v, new Uint32Array([0, 2, 1, 0, 3, 2]));
  return new MonsterTruck(g);
}
