import { setup } from './harness.mjs';
import * as U from '../web/js/upgrades.js';
const mk = (o) => ({ credits: 0, route: 'nitro', own: { ...Object.fromEntries(U.PARTS.map((p) => [p.id, 0])), ...o } });
for (const tier of [0, 1, 2, 3]) for (const H of [0.3, 0.6, 2.0]) {
  const t = await setup(); U.apply(U.stats(mk({ shocks: tier })), { truck: t, cab: null, vis: null });
  t.place([0, 0.6, 0], 90); for (let i = 0; i < 150; i++) t.step(1 / 75);
  const y0 = t.comWorld().y; t.p.y += H; t.v.set(0, 0, 0);
  let td = -1, ys = [], wm = [], onG = 0;
  for (let i = 0; i < 75 * 5; i++) { t.step(1 / 75); const g = t.wheels.filter((w) => w.contact).length; if (g === 4 && td < 0 && i > 5) td = i;
    if (td >= 0) { ys.push(t.comWorld().y - y0); wm.push(Math.hypot(t.w.x, t.w.z)); } }
  // count heave zero crossings > 1cm, and time until |heave|<1cm & ang<0.3 for good
  let zc = 0; for (let i = 1; i < ys.length; i++) if (Math.sign(ys[i]) !== Math.sign(ys[i - 1]) && Math.abs(ys[i]) > 0.01) zc++;
  let ts = ys.length; while (ts > 0 && Math.abs(ys[ts - 1]) < 0.02 && wm[ts - 1] < 0.4) ts--;
  let wz = 0; for (let i = 1; i < wm.length; i++) if (wm[i] > 0.5) wz++;
  console.log(`t${tier} ${H}m heaveZX ${zc} settle ${(ts / 75).toFixed(2)}s pitchRollRate>0.5 frames ${wz} maxW ${Math.max(...wm).toFixed(2)}`);
}
