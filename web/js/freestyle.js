// Freestyle mode: 2 minutes, points for wheelies, endos, air time, flips, barrel rolls, spins, side wheelies, drifts, donuts and big jumps.
// Skate-game scoring: trick points collect in a "pending" pot with a combo multiplier; the pot is banked once the truck has been
// driving cleanly for a moment, and lost if the truck bails (lands on its roof, wrecks or loses a wheel).
import * as THREE from 'three';

const TAU = Math.PI * 2, UP = new THREE.Vector3(0, 1, 0);
export const FS_TIME = 120, CREDITS_PER_POINT = 1; // score paid out 1:1 as credits (+1200 new best bonus)
// all point values live here so they are easy to tune
export const PTS = {
  airPerSec: 40, airBonusPerSec: 120, airHeight: 40, airDistance: 12, minAir: 0.6,
  flip: 400, flipStep: 200, barrel: 350, spin: 250, donut: 150,
  wheeliePerSec: 40, wheelieLean: 140, wheelieDist: 6, endoPerSec: 55, endoLean: 160, endoDist: 7,
  sidePerSec: 60, sideLean: 220, sideDist: 8, driftPerSec: 14, minTrick: 1.0,
  cleanLanding: 100, comboStep: 0.25, comboMax: 4,
};

export const CAT_NAMES = {
  air: 'Air & Jumps',
  flips: 'Flips',
  rolls: 'Barrel Rolls',
  spins: '360 Spins',
  wheelie: 'Wheelies',
  endo: 'Endos',
  side: 'Side Wheelies',
  drift: 'Drifts',
  donuts: 'Donuts',
  landings: 'Clean Landings',
};

export class Freestyle {
  constructor(payout = null, options = {}) {
    this.payout = payout; // (credits) => balance
    this.options = options;
    this.calloutsOnly = !!options.calloutsOnly;
    this.onRestart = options.onRestart || null;
    this.onMenu = options.onMenu || null;
    this.onStunt = options.onStunt || null; // callback(cat, label, pts)
    this.best = 0; try { this.best = +localStorage.getItem('mts_fs_best') || 0; } catch (e) {}
    this.build(); this.reset();
  }
  build() {
    const css = document.createElement('style');
    this.styleEl = css;
    css.textContent = `#fs{position:fixed;inset:0;pointer-events:none;font-family:"Barlow Condensed","Barlow",sans-serif;color:#fff;text-shadow:0 2px 4px #000a;z-index:5}
#fs.callouts-only .tm,#fs.callouts-only .tb,#fs.callouts-only .sc,#fs.callouts-only .lg,#fs.callouts-only .res{display:none !important}
#fs .tm{position:absolute;top:10px;left:50%;transform:translateX(-50%);font-size:56px;font-weight:700;letter-spacing:2px}#fs .tm.low{color:#ff5a3c}
#fs .tb{position:absolute;top:6px;left:50%;transform:translateX(-50%);margin-top:62px;font-size:18px;opacity:.85}
#fs .sc{position:absolute;top:10px;right:16px;text-align:right}#fs .sc b{display:block;font-size:54px;line-height:1;color:#ffcf40}#fs .sc i{font-style:normal;font-size:24px;color:#9fe870}
#fs .sc em{display:block;font-style:normal;font-size:18px;opacity:.8}
#fs .lg{position:absolute;top:10px;left:16px;width:300px;font-size:20px;line-height:1.15}
#fs .lg h4{margin:0 0 4px;font-size:15px;letter-spacing:2px;opacity:.8;font-weight:600}
#fs .lg div[data-cat],#fs .lg .fs-cat-row{display:flex;justify-content:space-between;gap:10px;padding:1px 0}
#fs .lg .fs-cat-row.zero{opacity:0.42}
#fs .lg .fs-cat-row.zero b{color:rgba(255,255,255,0.45);font-weight:500}
#fs .lg .fs-cat-row.active{opacity:1}
#fs .lg .fs-cat-row.active b{color:#ffcf40;font-weight:700}
#fs .lg .bail{color:#ff6a50}#fs .lg .bail b{color:#ff6a50}
#fs .cur{position:absolute;left:50%;top:34%;transform:translateX(-50%);font-size:40px;font-weight:700;text-align:center;color:#ffcf40}
#fs .cur small{display:block;font-size:22px;color:#fff}
#fs .res{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0009;pointer-events:auto}
#fs .res.on{display:flex}#fs .card{background:#161a22ee;border:1px solid #fff3;border-radius:14px;padding:22px 30px;min-width:420px;max-width:92vw;max-height:88vh;overflow:auto}
#fs .card h2{margin:0 0 2px;font-size:40px;text-align:center}#fs .card .big{font-size:64px;font-weight:700;color:#ffcf40;text-align:center;line-height:1}
#fs .card .nb{text-align:center;color:#9fe870;font-size:22px;margin-bottom:4px}
#fs .card .tot-cr{text-align:center;color:#ffcf40;font-size:20px;margin-bottom:8px}
#fs .card table{width:100%;border-collapse:collapse;font-size:20px;margin:10px 0}#fs .card td{padding:2px 4px;border-bottom:1px solid #fff1}#fs .card td:last-child{text-align:right;color:#ffcf40;font-weight:700}
#fs .fs-actions{display:flex;gap:12px;margin-top:16px;justify-content:center}
#fs .fs-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;border-radius:12px;font:700 20px "Barlow Condensed",sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:transform .12s,background .15s,box-shadow .15s;color:#fff;border:0}
#fs .fs-btn:active{transform:scale(.97)}
#fs .fs-btn-go{background:linear-gradient(135deg,#ff9a2e,#ff6a00);box-shadow:0 6px 20px rgba(255,120,0,.35)}
#fs .fs-btn-go:hover{box-shadow:0 8px 24px rgba(255,120,0,.55)}
#fs .fs-btn-alt{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22)}
#fs .fs-btn-alt:hover{background:rgba(255,255,255,.2)}
#fs .fs-btn.padfocus{outline:3px solid #ffd23f;outline-offset:2px;box-shadow:0 0 18px rgba(255,210,63,.65)}
#fs .fs-btn kbd{font:600 12px sans-serif;letter-spacing:0;padding:2px 6px;border-radius:5px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.25);opacity:.9}
@keyframes fsin{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}`;
    document.head.appendChild(css);
    const d = document.createElement('div'); d.id = 'fs';
    if (this.calloutsOnly) d.classList.add('callouts-only');
    this.domEl = d;
    d.innerHTML = '<div class="lg"><h4>SESSION STUNTS</h4><div id="fsl"></div></div><div class="tm" id="fst">2:00</div><div class="tb" id="fsh"></div>' +
      '<div class="sc"><b id="fss">0</b><i id="fsp"></i><em id="fsm"></em></div><div class="cur" id="fsc"></div>' +
      '<div class="res" id="fsr"><div class="card"><h2>TIME!</h2><div class="big" id="fsrs">0</div><div class="nb" id="fsrb"></div><div class="tot-cr" id="fsrc"></div><table id="fsrt"></table><div class="fs-actions"><button type="button" class="fs-btn fs-btn-go padfocus" id="fs-restart">Ride Again <kbd>A / Enter</kbd></button><button type="button" class="fs-btn fs-btn-alt" id="fs-menu">Menu <kbd>B / Esc</kbd></button></div></div></div>';
    document.body.appendChild(d);
    this._zoom = () => { d.style.zoom = Math.max(0.9, Math.min(innerWidth, innerHeight * 1.6) / 1000 * 1.1); };
    this._zoom();
    addEventListener('resize', this._zoom);
    this.endBtnIdx = 0;
    this.el = { t: d.querySelector('#fst'), h: d.querySelector('#fsh'), s: d.querySelector('#fss'), p: d.querySelector('#fsp'), m: d.querySelector('#fsm'), c: d.querySelector('#fsc'), l: d.querySelector('#fsl'), r: d.querySelector('#fsr'), rs: d.querySelector('#fsrs'), rb: d.querySelector('#fsrb'), rc: d.querySelector('#fsrc'), rt: d.querySelector('#fsrt'), btnRestart: d.querySelector('#fs-restart'), btnMenu: d.querySelector('#fs-menu') };
    this.el.btnRestart.onclick = (e) => { e.stopPropagation(); this.triggerRestart(); };
    this.el.btnMenu.onclick = (e) => { e.stopPropagation(); this.triggerMenu(); };
  }
  updateBtnFocus() {
    if (!this.el?.btnRestart || !this.el?.btnMenu) return;
    this.el.btnRestart.classList.toggle('padfocus', this.endBtnIdx === 0);
    this.el.btnMenu.classList.toggle('padfocus', this.endBtnIdx === 1);
  }
  pad(k) {
    if (!this.over) return;
    if (k === 'l' || k === 'u') { this.endBtnIdx = 0; this.updateBtnFocus(); }
    else if (k === 'r' || k === 'd') { this.endBtnIdx = 1; this.updateBtnFocus(); }
    else if (k === 'a') {
      if (this.endBtnIdx === 0) this.triggerRestart();
      else this.triggerMenu();
    } else if (k === 'b') {
      this.triggerMenu();
    }
  }
  reset() {
    this.state = 'ready'; this.left = FS_TIME; this.total = 0; this.pending = 0; this.chain = 0; this.safeT = 0; this.log = []; this.cats = {}; this.comboCats = {}; this.over = false;
    this.paid = false; this._lastPayout = null; this.roofT = 0;
    this.airT = 0; this.air = null; this.pitchAcc = 0; this.rollAcc = 0; this.yawAcc = 0; this.flipsDone = 0; this.rollsDone = 0; this.spinsDone = 0;
    this.act = null; this.donutAcc = 0; this.donutsDone = 0; this.bailed = false; this.prevLost = 0; this.prevWrecked = false; this.curText = ''; this.curT = 0;
    if (this.el?.r) this.el.r.classList.remove('on');
    if (this.el?.l) this.el.l.innerHTML = '';
    this.render(); this.renderStunts();
  }
  ensurePayout() {
    if (this.calloutsOnly) return { sc: 0, nb: false, bonus: 0, pay: 0, bal: null };
    if (this.paid) return this._lastPayout || { sc: 0, nb: false, bonus: 0, pay: 0, bal: null };
    this.paid = true;
    const sc = Math.round(this.total), nb = sc > this.best;
    if (nb) { this.best = sc; try { localStorage.setItem('mts_fs_best', String(sc)); } catch (e) {} }
    const bonus = nb ? 1200 : 0;
    const pay = Math.round(sc * CREDITS_PER_POINT) + bonus;
    let bal = null;
    if (pay > 0 && this.payout) {
      bal = this.payout(pay);
    }
    this._lastPayout = { sc, nb, bonus, pay, bal };
    return this._lastPayout;
  }
  triggerRestart() {
    this.ensurePayout();
    if (this.el?.r) this.el.r.classList.remove('on');
    this.reset();
    if (this.onRestart) this.onRestart();
  }
  triggerMenu() {
    this.ensurePayout();
    this.destroy();
    if (this.onMenu) this.onMenu();
  }
  destroy() {
    if (this._zoom) removeEventListener('resize', this._zoom);
    try { this.styleEl?.remove(); } catch (e) {}
    try { this.domEl?.remove(); } catch (e) {}
    try { document.getElementById('fs')?.remove(); } catch (e) {}
  }
  getStuntsTotals() {
    const totals = {};
    for (const [k, c] of Object.entries(this.cats)) {
      totals[k] = { n: c.n || 0, pts: c.pts || 0 };
    }
    for (const [k, c] of Object.entries(this.comboCats)) {
      totals[k] = totals[k] || { n: 0, pts: 0 };
      totals[k].pts += c.pts || 0;
    }
    return totals;
  }
  start() { if (this.state === 'ready') { this.state = 'running'; } }
  /** crashes forfeit the pending pot */
  bail(why) {
    if (this.bailed) return; this.bailed = true;
    if (this.pending > 0) this.addLog('BAIL: ' + why, -this.pending, true);
    this.pending = 0; this.chain = 0; this.act = null; this.air = null; this.comboCats = {};
    this.flash('BAIL!', 1.2); this.renderStunts();
  }
  mult() { return Math.min(PTS.comboMax, 1 + PTS.comboStep * Math.max(0, this.chain - 1)); }
  /** award points for a finished/ongoing trick; new trick kinds extend the combo chain */
  award(cat, label, pts, chain = true) {
    if (this.state !== 'running' || this.bailed) return;
    if (chain) this.chain++; const v = Math.round(pts * this.mult()); this.pending += v; this.safeT = 0;
    this.cats[cat] = this.cats[cat] || { n: 0, pts: 0 }; this.cats[cat].n++;
    this.comboCats[cat] = this.comboCats[cat] || { n: 0, pts: 0 }; this.comboCats[cat].pts += v;
    this.addLog(label, v);
    this.flash(this.calloutsOnly ? label : (label + ' +' + v), 1.4);
    if (this.onStunt) this.onStunt(cat, label, v);
    this.renderStunts();
  }
  /** continuous points while a trick is held */
  live(cat, rate, dt) {
    if (this.state !== 'running' || this.bailed) return 0;
    const v = rate * dt * this.mult(); this.pending += v; this.safeT = 0;
    this.comboCats[cat] = this.comboCats[cat] || { n: 0, pts: 0 }; this.comboCats[cat].pts += v;
    return v;
  }
  addLog(label, v, bad = false) { this.log.push({ label, v, bad }); }
  flash(t, s) { this.curText = t; this.curT = s; }
  step(truck, dt, dmg) {
    if (this.state === 'ready') return;
    if (this.state === 'running' && !this.calloutsOnly) { this.left -= dt; if (this.left <= 0) { this.left = 0; this.finish(); return; } }
    if (this.state !== 'running') return;
    const q = truck.q, f = new THREE.Vector3(0, 0, 1).applyQuaternion(q), u = UP.clone().applyQuaternion(q), s = new THREE.Vector3().crossVectors(f, u), w = truck.w, v = truck.v;
    const c = [0, 1, 2, 3].map((i) => !!(truck.wheels[i].contact && !truck.sp[i].dead)), nC = c.filter(Boolean).length, spd = v.length();
    const roofY = truck.sp && truck.sp[4] ? truck.localToWorld(truck.sp[4].p).y : 0;
    const wheelY = truck.sp && truck.sp[0] ? (truck.localToWorld(truck.sp[0].p).y + truck.localToWorld(truck.sp[1].p).y + truck.localToWorld(truck.sp[2].p).y + truck.localToWorld(truck.sp[3].p).y) * 0.25 : 0;
    const verticalWheelie = f.y > 0.35 || ((c[2] || c[3]) && f.y > 0.1);
    const onRoof = u.y < -0.65 && !verticalWheelie && (roofY < wheelY);
    const airborne = nC === 0 && (!truck.touch || !onRoof);
    const hv = new THREE.Vector3(v.x, 0, v.z), lat = hv.clone().sub(f.clone().setY(0).normalize().multiplyScalar(hv.dot(f.clone().setY(0).normalize()))).length();
    // --- crashes ---
    const lost = dmg ? dmg.lost.filter(Boolean).length : 0;
    if (lost > this.prevLost) this.bail('lost a wheel'); this.prevLost = lost;
    if (dmg && dmg.wrecked && !this.prevWrecked) this.bail('body wrecked'); this.prevWrecked = !!(dmg && dmg.wrecked);
    if (!airborne && onRoof) {
      this.roofT = (this.roofT || 0) + dt;
      if ((this.roofT > 0.3 || (truck.impact && truck.impact[4] > 50)) && !this.bailed) {
        this.bail('landed on the roof');
      }
    } else {
      this.roofT = Math.max(0, (this.roofT || 0) - dt * 2);
    }
    if (this.bailed && u.y > 0.6 && nC >= 3) this.bailed = false;
    // --- air ---
    if (airborne) {
      if (!this.air) { this.air = { t: 0, p0: truck.p.clone(), y0: truck.p.y, maxY: truck.p.y }; this.pitchAcc = this.rollAcc = this.yawAcc = 0; this.flipsDone = this.rollsDone = this.spinsDone = 0; }
      const a = this.air; a.t += dt; a.maxY = Math.max(a.maxY, truck.p.y);
      this.pitchAcc += w.dot(s) * dt; this.rollAcc += w.dot(f) * dt; this.yawAcc += w.y * dt;
      if (a.t > PTS.minAir) this.live('air', PTS.airPerSec, dt);
      const fl = Math.floor((Math.abs(this.pitchAcc) + 2.1) / TAU);
      while (this.flipsDone < fl) { this.flipsDone++; const n = this.flipsDone, back = this.pitchAcc > 0; this.award('flips', (n > 1 ? (n === 2 ? 'DOUBLE ' : n === 3 ? 'TRIPLE ' : n + 'x ') : '') + (back ? 'BACKFLIP' : 'FRONTFLIP'), PTS.flip + PTS.flipStep * (n - 1) * n / 2); }
      const rl = Math.floor((Math.abs(this.rollAcc) + 2.1) / TAU); while (this.rollsDone < rl) { this.rollsDone++; this.award('rolls', 'BARREL ROLL', PTS.barrel); }
      const sp = Math.floor((Math.abs(this.yawAcc) + 2.1) / TAU); while (this.spinsDone < sp) { this.spinsDone++; this.award('spins', '360 SPIN', PTS.spin); }
    } else if (this.air) { this.land(truck, u, nC); }
    // --- ground tricks ---
    let kind = null, rate = 0;
    if (!airborne && !this.bailed && spd > 1.2) {
      if (c[2] && c[3] && !c[0] && !c[1] && f.y > 0.3) { kind = 'wheelie'; rate = PTS.wheeliePerSec + PTS.wheelieLean * (f.y - 0.3); }
      else if (c[0] && c[1] && !c[2] && !c[3] && f.y < -0.3) { kind = 'endo'; rate = PTS.endoPerSec + PTS.endoLean * (-f.y - 0.3); }
      else if (nC === 2 && ((c[0] && c[2]) || (c[1] && c[3])) && u.y < 0.9 && u.y > 0.15) { kind = 'side'; rate = PTS.sidePerSec + PTS.sideLean * (0.9 - u.y); }
      else if (nC >= 3 && spd > 6 && lat > 3.5 && u.y > 0.7) { kind = 'drift'; rate = PTS.driftPerSec * lat; }
    }
    if (kind) {
      if (!this.act || this.act.kind !== kind) { this.endAct(); this.act = { kind, t: 0, d: 0, pts: 0, bonus: false }; }
      const A = this.act; A.t += dt; A.d += spd * dt; A.pts += this.live(kind, rate, dt);
      if (!A.bonus && A.t > PTS.minTrick) { A.bonus = true; this.chain++; }
      this.curText = { wheelie: 'WHEELIE', endo: 'ENDO', side: 'SIDE WHEELIE', drift: 'DRIFT' }[kind] + '  ' + A.t.toFixed(1) + 's'; this.curT = 0.3;
    } else if (this.act) this.endAct();
    // --- donuts (spinning on the spot on the ground) ---
    if (!airborne && !this.bailed && nC >= 3 && spd < 9 && Math.abs(w.y) > 1.8 && u.y > 0.7) { this.donutAcc += w.y * dt; const d = Math.floor(Math.abs(this.donutAcc) / TAU); while (this.donutsDone < d) { this.donutsDone++; this.award('donuts', 'DONUT', PTS.donut); } }
    else if (Math.abs(w.y) < 1) { this.donutAcc = 0; this.donutsDone = 0; }
    // --- bank the pot after a stretch of clean driving ---
    if (this.pending > 0 && !airborne && !kind && u.y > 0.6 && nC >= 3) { this.safeT += dt; if (this.safeT > 1.2) this.bank(); }
    if (this.curT > 0) this.curT -= dt;
  }
  endAct() {
    const A = this.act; this.act = null; if (!A || A.t < PTS.minTrick) return;
    const per = { wheelie: PTS.wheelieDist, endo: PTS.endoDist, side: PTS.sideDist, drift: 0 }[A.kind], name = { wheelie: 'WHEELIE', endo: 'ENDO', side: 'SIDE WHEELIE', drift: 'DRIFT' }[A.kind];
    const bonus = this.bailed ? 0 : Math.round(A.d * per * this.mult());
    this.cats[A.kind] = this.cats[A.kind] || { n: 0, pts: 0 };
    this.cats[A.kind].n++;
    this.comboCats[A.kind] = this.comboCats[A.kind] || { n: 0, pts: 0 };
    if (bonus > 0) { this.pending += bonus; this.comboCats[A.kind].pts += bonus; }
    const v = Math.round(A.pts + bonus);
    this.addLog(name + ' ' + (per ? Math.round(A.d) + ' m' : A.t.toFixed(1) + 's'), v);
    const flashLabel = name + ' ' + (per ? Math.round(A.d) + ' m' : A.t.toFixed(1) + 's');
    this.flash(this.calloutsOnly ? flashLabel : (name + ' +' + v), 1.2);
    if (this.onStunt) this.onStunt(A.kind, flashLabel, v);
    this.renderStunts();
  }
  land(truck, u, nC) {
    const a = this.air; this.air = null; const dist = Math.hypot(truck.p.x - a.p0.x, truck.p.z - a.p0.z), h = Math.max(0, a.maxY - a.y0), clean = u.y > 0.5 && !this.bailed;
    if (a.t < PTS.minAir) return;
    if (clean) {
      const big = a.t * PTS.airBonusPerSec + h * PTS.airHeight + dist * PTS.airDistance;
      this.award('air', (h > 6 || dist > 30 ? 'HUGE AIR ' : 'AIR ') + a.t.toFixed(1) + 's / ' + Math.round(dist) + ' m', big);
      this.award('landings', 'CLEAN LANDING', PTS.cleanLanding, false);
    }
  }
  bank() {
    const v = Math.round(this.pending); this.total += v; this.pending = 0; this.chain = 0; this.safeT = 0;
    for (const [k, c] of Object.entries(this.comboCats)) {
      this.cats[k] = this.cats[k] || { n: 0, pts: 0 };
      this.cats[k].pts += c.pts;
    }
    this.comboCats = {};
    if (v > 0) this.addLog('BANKED', v);
    this.renderStunts();
  }
  finish() {
    if (this.calloutsOnly) return;
    this.endAct(); this.bank(); this.state = 'over'; this.over = true;
    const res = this.ensurePayout();
    this.el.rs.textContent = res.sc.toLocaleString('en-US');
    this.el.rb.innerHTML = (res.nb ? 'NEW BEST!' + (res.bonus ? ` (+${res.bonus.toLocaleString('en-US')} bonus)` : '') : 'Best: ' + this.best.toLocaleString('en-US')) + (res.pay > 0 ? ` &nbsp;&middot;&nbsp; +${res.pay.toLocaleString('en-US')} credits` : '');
    if (res.bal != null && this.el.rc) {
      this.el.rc.textContent = `Total Credits: ${res.bal.toLocaleString('en-US')} cr`;
    } else if (this.el.rc) {
      this.el.rc.textContent = '';
    }
    this.el.rt.innerHTML = Object.entries(this.cats).filter(([, c]) => c.pts >= 1).sort((a, b) => b[1].pts - a[1].pts).map(([k, c]) => `<tr><td>${CAT_NAMES[k] || k}${c.n ? ' &times;' + c.n : ''}</td><td>${Math.round(c.pts).toLocaleString('en-US')}</td></tr>`).join('') || '<tr><td>No tricks landed</td><td>0</td></tr>';
    this.endBtnIdx = 0;
    this.updateBtnFocus();
    this.el.r.classList.add('on');
  }
  renderStunts() {
    if (!this.el?.l) return;
    const totals = this.getStuntsTotals();
    const categories = Object.keys(CAT_NAMES);

    for (const k of categories) {
      let row = this.el.l.querySelector(`[data-cat="${k}"]`);
      if (!row) {
        row = document.createElement('div');
        row.dataset.cat = k;
        row.className = 'fs-cat-row zero';
        row.innerHTML = '<span class="lbl"></span><b class="val"></b>';
        this.el.l.appendChild(row);
      }
      const c = totals[k] || { n: 0, pts: 0 };
      const isActive = c.pts >= 1 || c.n >= 1;
      const name = CAT_NAMES[k] || k;
      const countHtml = c.n ? ` <small style="opacity:.8;font-size:16px">&times;${c.n}</small>` : '';
      const lbl = `${name}${countHtml}`;
      const val = isActive ? Math.round(c.pts).toLocaleString('en-US') : '0';
      const cls = 'fs-cat-row ' + (isActive ? 'active' : 'zero');

      if (row.className !== cls) row.className = cls;
      if (row._lbl !== lbl) { row.querySelector('.lbl').innerHTML = lbl; row._lbl = lbl; }
      if (row._val !== val) { row.querySelector('.val').textContent = val; row._val = val; }
    }
  }
  renderLog() { this.renderStunts(); }
  /** per-frame UI refresh */
  render() {
    const t = Math.max(0, this.left), m = Math.floor(t / 60), s = Math.floor(t % 60); this.el.t.textContent = `${m}:${String(s).padStart(2, '0')}`; this.el.t.classList.toggle('low', this.state === 'running' && t < 10);
    this.el.h.textContent = this.state === 'ready' ? 'Drive to start the clock' : '';
    this.el.s.textContent = Math.round(this.total).toLocaleString('en-US'); this.el.p.textContent = this.pending > 0 ? '+' + Math.round(this.pending).toLocaleString('en-US') : ''; this.el.m.textContent = this.chain > 1 ? 'COMBO x' + this.mult().toFixed(2) : '';
    this.el.c.innerHTML = this.curT > 0 ? this.curText : '';
    this.renderStunts();
  }
}
