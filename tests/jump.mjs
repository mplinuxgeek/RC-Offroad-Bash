import { setup } from './harness.mjs';
import * as U from '../web/js/upgrades.js';
import { CabSpring } from '../web/js/cab.js';
const mk = (o) => ({ credits: 0, route: 'nitro', own: { ...Object.fromEntries(U.PARTS.map((p) => [p.id, 0])), ...o } });
for (const tier of [0, 1, 2, 3]) for (const [H, sp, pitch] of [[0.8, 8, 0], [1.5, 12, 0.25], [1.5, 12, -0.2]]) {
  const t = await setup(), cab = new CabSpring(); U.apply(U.stats(mk({ shocks: tier })), { truck: t, cab, vis: null });
  t.place([0, 0.6, 0], 90); for (let i = 0; i < 150; i++) t.step(1 / 75);
  t.p.y += H; const fwd = new t.q.constructor().copy(t.q); t.v.set(0, 0, 0).add({ x: 0, y: 0, z: 0 });
  const f = [1, 0, 0].map(Number); const F = new (t.v.constructor)(0, 0, 1).applyQuaternion(t.q); t.v.copy(F.multiplyScalar(sp));
  t.q.multiply(new t.q.constructor().setFromAxisAngle(new t.v.constructor(1, 0, 0), pitch)); cab.reset();
  const pa = [], ra = [], cr = [], cz = []; let td = -1;
  for (let i = 0; i < 75 * 5; i++) { t.step(1 / 75); cab.update(t, 1 / 75);
    if (td < 0 && t.wheels.some((w) => w.contact) && i > 3) td = i;
    if (td >= 0) { const up = new t.v.constructor(0, 1, 0).applyQuaternion(t.q), fw = new t.v.constructor(0, 0, 1).applyQuaternion(t.q); pa.push(Math.asin(fw.y)); ra.push(Math.atan2(new t.v.constructor(1, 0, 0).applyQuaternion(t.q).y, up.y)); cr.push(cab.r.x); cz.push(cab.o.y); } }
  const osc = (a) => { const s = a.slice(+process.env.SK||0); const m = s.reduce((x, y) => x + y, 0) / s.length; let zc = 0; for (let i = 1; i < s.length; i++) if (Math.sign(s[i] - m) !== Math.sign(s[i - 1] - m) && Math.abs(s[i] - m) > 0.004) zc++; return zc; };
  if (process.env.DUMP && tier==0 && pitch==-0.2) console.log(pa.filter((_, i) => i % 6 == 0).slice(0, 40).map((x) => x.toFixed(2)).join(" "));
  const pk = (a) => Math.max(...a.map(Math.abs)).toFixed(2);
  console.log(`t${tier} H${H} v${sp} p${pitch}: bodyPitch pk ${pk(pa)} zc>1s ${osc(pa)} | roll pk ${pk(ra)} zc ${osc(ra)} | cabPitch pk ${pk(cr)} zc ${osc(cr)} | cabY pk ${pk(cz)} zc ${osc(cz)}`);
}
