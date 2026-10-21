import { setup } from './harness.mjs';
import * as U from '../web/js/upgrades.js';
import { CabSpring } from '../web/js/cab.js';
import fs from 'fs';
const mk = (o) => ({ credits: 0, route: 'nitro', own: { ...Object.fromEntries(U.PARTS.map((p) => [p.id, 0])), ...o } });
const tj = JSON.parse(fs.readFileSync(new URL('../web/assets/trucks/eighthmt/truck.json', import.meta.url), 'utf8'));
const phases = [['coast', 1.5, 0, 0, 0], ['throttle', 2, 1, 0, 0], ['coast', 2, 0, 0, 0], ['steerL', 2, 0.6, 0, 1], ['steerR', 2, 0.6, 0, -1], ['brake', 1.5, 0, 1, 0], ['stop', 3, 0, 0, 0]];
for (const tier of [0, 1, 2, 3]) {
  const t = await setup(), cab = new CabSpring(); U.apply(U.stats(mk({ shocks: tier })), { truck: t, cab, vis: null });
  t.place([0, 0.6, 0], 90); for (let i = 0; i < 150; i++) t.step(1 / 75);
  let out = [];
  for (const [n, d, thr, br, st] of phases) {
    Object.assign(t.input, { throttle: thr, brake: br, steer: st }); const s = []; 
    for (let i = 0; i < d * 75; i++) { t.step(1 / 75); cab.update(t, 1 / 75); s.push([cab.r.x, cab.r.z, cab.o.y, cab.o.x, cab.o.z]); }
    // peak and oscillation count over last half of phase (ringing after transient)
    const half = s.slice(s.length >> 1); let zc = 0, pk = [0, 0, 0];
    for (let k = 0; k < 3; k++) { for (let i = 1; i < half.length; i++) if (Math.sign(half[i][k] - half[0][k]) !== Math.sign(half[i - 1][k] - half[0][k]) && Math.abs(half[i][k] - half[0][k]) > 0.004) zc++; pk[k] = Math.max(...s.map((r) => Math.abs(r[k]))); }
    out.push(`${n}:pk(${pk.map((x) => x.toFixed(2))})zx${zc}`);
  }
  console.log(`tier${tier} ${out.join(' ')}`);
}
