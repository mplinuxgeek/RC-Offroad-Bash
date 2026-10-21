import { setup } from './harness.mjs';
import * as U from '../web/js/upgrades.js';
import { CabSpring } from '../web/js/cab.js';
const mk = (o) => ({ credits: 0, route: 'nitro', own: { ...Object.fromEntries(U.PARTS.map((p) => [p.id, 0])), ...o } });
for (const tier of [0, 1, 2, 3]) for (const H of [0.6, 2.0]) {
  const t = await setup(), cab = new CabSpring(); U.apply(U.stats(mk({ shocks: tier })), { truck: t, cab, vis: null });
  t.place([0, 0.6, 0], 90); t.v.set(0, 0, 0); t.w.set(0, 0, 0); for (let i = 0; i < 150; i++) t.step(1 / 75);
  const y0 = t.comWorld().y; t.p.y += H; t.v.set(0, 0, 0);
  let vyPrev = 0, touched = false, ev = [], cabY = [], minAir = 0, air = 0, maxUp = 0;
  for (let i = 0; i < 75 * 4; i++) { t.step(1 / 75); cab.update(t, 1 / 75); const g = t.wheels.some((w) => w.contact); const vy = t.v.y;
    if (g) touched = true;
    if (touched) { if (vyPrev < -0.5 && vy > vyPrev + 0.5) ev.push([+(i / 75).toFixed(2), +vyPrev.toFixed(1), +vy.toFixed(1)]); maxUp = Math.max(maxUp, vy); cabY.push(cab.o.y); }
    vyPrev = vy; }
  // cab zero-crossing count after touchdown (wobble)
  let zc = 0; for (let i = 1; i < cabY.length; i++) if (Math.sign(cabY[i]) !== Math.sign(cabY[i - 1]) && Math.abs(cabY[i]) > 0.003) zc++;
  const cm = Math.max(...cabY.map(Math.abs));
  console.log(`tier${tier} drop${H}m maxUpVy ${maxUp.toFixed(2)} | impacts(t,vIn,vOut): ${JSON.stringify(ev.slice(0, 5))} | cab y peak ${cm.toFixed(3)} zeroX ${zc}`);
}
