import * as Up from './upgrades.js';

// Garage overlay: spend credits on the tech tree and tune vehicle setup (see upgrades.js). Mouse/touch/keyboard and gamepad (up/down/left/right, A buy/step, Y switch branch, B close).
let st = Up.load(), tune = Up.loadTuning(), root = null, fi = 0, note = '', noteT = 0, padUsed = false, confirmReset = false, activeTab = 'powertrain', resetScroll = false;
const TABS = [['powertrain', 'Powertrain'], ['drivetrain', 'Drivetrain'], ['suspension', 'Suspension'], ['wheels', 'Wheels / Steering'], ['tuning', 'Tuning & Setup'], ['paint', 'Paint & Colours']];
let paintApi = null;
const CAT = { engine: 'powertrain', pipe: 'powertrain', motor: 'powertrain', battery: 'powertrain', trans: 'drivetrain', center: 'drivetrain', shafts: 'drivetrain', diffs: 'drivetrain', shocks: 'suspension', chassis: 'suspension', tires: 'wheels', steering: 'wheels', brakes: 'wheels' };
const partList = () => Up.PARTS.filter((p) => (CAT[p.id] || 'powertrain') === activeTab);
const setTab = (t) => { activeTab = t; fi = 0; resetScroll = true; render(); };
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const bar = (label, v, max, cls = '') => `<div class="gbar ${cls}"><span>${label}</span><i><b style="width:${Math.max(4, Math.min(100, v / max * 100))}%"></b></i></div>`;
function ensure() {
  if (root) return; root = document.createElement('div'); root.id = 'garage'; document.body.appendChild(root);
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
}
function activeTuneDefs() {
  return Up.TUNING_DEFS.filter((d) => d.branch === 'all' || d.branch === st.route);
}
function render() {
  st = Up.load(); tune = Up.loadTuning(); const c = Up.stats(st, undefined, tune), el = st.route === 'electric';
  const tuneDefs = activeTuneDefs(), parts = partList(), prevScroll = root.querySelector('.gwrap')?.scrollTop || 0;

  let bodyContent = '';
  if (activeTab === 'paint') {
    const secs = paintApi ? paintApi.sections() : [];
    const secHtml = secs.map((sc, i) => `<div class="color-sec ${padUsed && fi === i ? 'padfocus' : ''}" data-ci="${i}"><div class="color-head"><span class="lbl">${sc.label}</span><span class="val">${sc.name()}</span></div>
      <div class="cp-grid ${sc.text ? 'txtgrid' : ''}">${sc.palette.map(([hex, nm]) => `<button class="${sc.cur().toLowerCase() === hex.toLowerCase() ? 'on' : ''} ${sc.text ? 'txt' : ''}" style="${sc.text ? '' : 'background-color:' + hex}" title="${nm}" data-ci="${i}" data-hex="${hex}" data-nm="${nm}">${sc.text ? nm : ''}</button>`).join('')}</div></div>`).join('');
    const on = paintApi ? paintApi.bodyOn() : true, lon = paintApi?.lightsOn ? paintApi.lightsOn() : false;
    bodyContent = `<div class="paint-grid">${secHtml}</div>
      <div class="tune-actions"><button class="btn ${padUsed && fi === secs.length ? 'padfocus' : ''}" id="pbody">Body: ${on ? 'On' : 'Off'}</button>${paintApi?.hasLights ? `<button class="btn" id="plights">Lights: ${lon ? 'On' : 'Off'}</button>` : ''}</div>`;
  } else if (activeTab !== 'tuning') {
    const cards = parts.map((p, i) => {
      const own = st.own[p.id], mx = Up.maxTier(p), act = Up.active(st, p), nxt = own + 1, why = nxt > mx ? 'Maxed' : Up.blocked(st, p, nxt), tier = p.tiers[own];
      const pips = Array.from({ length: mx }, (_, t) => `<u class="${t < own ? 'on' : ''}"></u>`).join('');
      const nt = nxt <= mx ? p.tiers[nxt] : null;
      const tag = p.branch === 'nitro' ? 'NITRO' : p.branch === 'electric' ? 'BRUSHLESS' : 'COMMON';
      const lock = why && why !== 'Maxed' && why !== 'Not enough credits' ? why : '';
      const sellBtn = `<button class="gsell" ${own > 0 ? `data-sell="${p.id}"` : 'disabled'}><span>Uninstall${own > 0 ? ` · +${fmt(Up.sellValue(p, own))}` : ''}</span></button>`;
      const btn = nxt > mx ? '<button class="gbuy" disabled><span>Maxed</span></button>' : `<button class="gbuy ${why ? 'no' : ''}" data-id="${p.id}" ${lock ? 'disabled' : ''}><span>${lock ? 'Locked' : (p.id === 'motor' && own === 0 ? 'Convert · ' : 'Upgrade · ') + fmt(Up.tierCost(p, nxt))}</span></button>`;
      return `<div class="gcard ${act ? '' : 'off'} ${padUsed && fi === i ? 'padfocus' : ''}" data-i="${i}"><div class="gh"><b>${p.name}</b><em class="${p.branch}">${tag}</em></div>
        <div class="gpips">${pips}</div><div class="gbody"><div class="gcur">${tier ? tier[0] : 'Not installed'}</div><div class="gdesc">${tier && tier[1] ? tier[1] : p.info}</div>
        ${lock ? `<div class="glock">${lock}</div>` : nt ? `<div class="gnext">Next: <b>${nt[0]}</b>${nt[1] ? ' — ' + nt[1] : ''}</div>` : ''}</div><div class="gbtns">${sellBtn}${btn}</div></div>`;
    }).join('');
    bodyContent = `
      <div class="gstats">${bar('Power', c.pwr, 4.5)}${bar('Top speed', c.spd, 1.45)}${bar('Braking', c.brake, 20)}${bar('Handling', (c.steerRate / 0.55 + c.grip / 1.2) / 2, 1)}${bar('Durability', c.dmg * (1 + 0.1 * c.strength), 2.2)}${c.deficit > 0 ? `<div class="gwarn">⚠ Drivetrain too weak for this power — shafts may snap on launch. Upgrade shafts / diffs${el ? ' / centre drivetrain' : ''}.</div>` : ''}</div>
      <div class="ggrid">${cards}</div>`;
  } else {
    const tuneCards = tuneDefs.map((d, i) => {
      const val = tune[d.id] ?? d.def;
      const pips = Array.from({ length: d.max - d.min + 1 }, (_, idx) => `<span class="tune-pip ${idx === (val - d.min) ? 'on' : ''}"></span>`).join('');
      const tag = d.branch === 'nitro' ? 'NITRO' : d.branch === 'electric' ? 'BRUSHLESS' : 'ALL BUILDS';
      return `<div class="tune-card ${padUsed && fi === i ? 'padfocus' : ''}" data-ti="${i}">
        <div class="tune-head"><span class="tune-title">${d.name}</span><em class="tune-tag ${d.branch}">${tag}</em></div>
        <div class="tune-ctrl">
          <button class="tune-step-btn" data-tdec="${d.id}" ${val <= d.min ? 'disabled' : ''}>◀</button>
          <div class="tune-val-box">
            <span class="tune-val-label">${d.opts[val - d.min] || val}</span>
            <div class="tune-pips">${pips}</div>
          </div>
          <button class="tune-step-btn" data-tinc="${d.id}" ${val >= d.max ? 'disabled' : ''}>▶</button>
        </div>
      </div>`;
    }).join('');
    bodyContent = `
      <div class="gstats">${bar('Power', c.pwr, 4.5)}${bar('Top speed', c.spd, 1.45)}${bar('Braking', c.brake, 20)}${bar('Damping', c.dampMul, 1.6)}${bar('Spring Rate', c.preloadMul, 1.4)}${bar('Est. Runtime', (12 / c.fuelRate), 15)}</div>
      <div class="tune-grid">${tuneCards}</div>
      <div class="tune-actions"><button class="btn btn-reset" id="treset">Reset Tuning to Defaults</button></div>`;
  }

  root.innerHTML = `<div class="gwrap"><div class="gtop"><h2>Garage</h2><div class="gcred">${fmt(st.credits)} <small>credits${st.loan ? ` · loan owed ${fmt(st.loan)}` : ''}</small></div>
    <div class="seg gseg"><button data-route="nitro" class="${el ? '' : 'on'}">Nitro</button><button data-route="electric" class="${el ? 'on' : ''}">Brushless</button></div>
    ${activeTab !== 'tuning' && activeTab !== 'paint' ? '<button class="btn btn-reset" id="greset">Refund all (80%)</button>' : ''}
    <button class="btn go" id="gclose">Done</button></div>
    <div class="gtab-bar">${TABS.map(([k, n]) => `<button class="gtab ${activeTab === k ? 'on' : ''}" id="tab-${k}" data-tab="${k}">${n}</button>`).join('')}</div>
    <div class="gnote">${note || (activeTab === 'paint' ? 'Pick colours for body, trim, suspension links and springs. Changes show on the truck instantly.' : activeTab !== 'tuning' ? 'Parts can be uninstalled for 80% back. Earn credits by finishing stunts. Nitro and brushless are mutually exclusive.' : 'Fine-tune your RC truck handling, gearing slip, suspension rates and power curve. Changes apply to both practice and competition.')}</div>
    ${bodyContent}</div>`;
  const gw = root.querySelector('.gwrap'); gw.scrollTop = resetScroll ? 0 : prevScroll; resetScroll = false;

  root.querySelectorAll('.gtab').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  root.querySelectorAll('.gbuy[data-id]').forEach((b) => (b.onclick = () => buyId(b.dataset.id)));
  root.querySelectorAll('.gsell').forEach((b) => (b.onclick = () => sellId(b.dataset.sell)));
  root.querySelectorAll('.gseg button').forEach((b) => (b.onclick = () => route(b.dataset.route)));
  root.querySelectorAll('.tune-step-btn[data-tdec]').forEach((b) => (b.onclick = () => adjustTune(b.dataset.tdec, -1)));
  root.querySelectorAll('.tune-step-btn[data-tinc]').forEach((b) => (b.onclick = () => adjustTune(b.dataset.tinc, 1)));
  root.querySelectorAll('.cp-grid button').forEach((b) => (b.onclick = () => { paintApi.sections()[+b.dataset.ci].set(b.dataset.hex, b.dataset.nm); render(); }));
  root.querySelector('#pbody')?.addEventListener('click', () => { paintApi.toggleBody(); render(); });
  root.querySelector('#plights')?.addEventListener('click', () => { paintApi.toggleLights(); render(); });
  root.querySelector('#treset')?.addEventListener('click', () => { Up.resetTuning(); tune = Up.loadTuning(); say('Tuning reset to defaults'); });
  root.querySelectorAll('.gcard').forEach((cd) => cd.addEventListener('pointerdown', () => { fi = +cd.dataset.i; root.querySelectorAll('.padfocus').forEach((x) => x.classList.remove('padfocus')); }));
  root.querySelectorAll('.tune-card').forEach((cd) => cd.addEventListener('pointerdown', () => { fi = +cd.dataset.ti; root.querySelectorAll('.padfocus').forEach((x) => x.classList.remove('padfocus')); }));
  root.querySelector('#gclose').onclick = close;
  const rb = root.querySelector('#greset');
  if (rb) {
    if (confirmReset) rb.textContent = 'Really refund all?';
    rb.onclick = () => {
      if (confirmReset) { confirmReset = false; Up.refundAll(st); say('All upgrades refunded'); }
      else { confirmReset = true; render(); setTimeout(() => { if (confirmReset) { confirmReset = false; if (isOpen()) render(); } }, 3000); }
    };
  }
  fitBtns();
  updateFocus();
}
// shrink label text so it spans at most 90% of its button
function fitBtns() {
  root.querySelectorAll('.gbtns button').forEach((b) => {
    const t = b.firstElementChild; if (!t || !b.clientWidth) return;
    b.style.fontSize = ''; const w = t.offsetWidth, max = b.clientWidth * 0.9;
    if (w > max) b.style.fontSize = (parseFloat(getComputedStyle(b).fontSize) * max / w).toFixed(2) + 'px';
  });
}
function adjustTune(id, delta) {
  const d = Up.TUNING_DEFS.find((x) => x.id === id);
  if (!d) return;
  tune = Up.loadTuning();
  const cur = tune[id] ?? d.def;
  const next = Math.max(d.min, Math.min(d.max, cur + delta));
  if (next !== cur) {
    tune[id] = next;
    Up.saveTuning(tune);
    say(`${d.name}: ${d.opts[next - d.min]}`);
  }
}
function say(t) { note = t; render(); clearTimeout(noteT); noteT = setTimeout(() => { note = ''; if (isOpen()) render(); }, 3500); }
function buyId(id) { const why = Up.buy(st, id); garage.onClose?.(); say(why ? why : `Installed: ${Up.part(id).tiers[st.own[id]][0]}`); }
function sellId(id) { const was = st.own[id], name = Up.part(id).tiers[was][0], why = Up.sell(st, id); garage.onClose?.(); say(why || `Uninstalled: ${name} (+${fmt(Up.sellValue(Up.part(id), was))} credits)`); }
function route(r) { const why = Up.setRoute(st, r); say(why || (r === 'electric' ? 'Brushless conversion active — nitro parts locked out' : 'Nitro engine restored')); }
function getCols() {
  const grid = root?.querySelector('.ggrid');
  const cards = grid?.querySelectorAll('.gcard');
  if (!cards || cards.length < 2) return 1;
  const top0 = cards[0].offsetTop;
  let cols = 0;
  for (let i = 0; i < cards.length; i++) {
    if (Math.abs(cards[i].offsetTop - top0) < 6) cols++;
    else break;
  }
  return Math.max(1, cols);
}

function updateFocus() {
  if (!root) return;
  root.querySelectorAll('.padfocus').forEach((el) => el.classList.remove('padfocus'));
  if (!padUsed) return;
  if (typeof fi === 'number' && fi >= 0) {
    const card = activeTab === 'paint'
      ? (root.querySelector(`.color-sec[data-ci="${fi}"]`) || root.querySelector('#pbody'))
      : activeTab !== 'tuning'
        ? root.querySelector(`.gcard[data-i="${fi}"]`)
        : root.querySelector(`.tune-card[data-ti="${fi}"]`);
    if (card) {
      card.classList.add('padfocus');
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } else if (typeof fi === 'string') {
    let el = null;
    if (fi === 'route-nitro') el = root.querySelector('.gseg button[data-route="nitro"]');
    else if (fi === 'route-electric') el = root.querySelector('.gseg button[data-route="electric"]');
    else if (fi.startsWith('tab-')) el = root.querySelector('#' + fi);
    else if (fi === 'refund') el = root.querySelector('#greset');
    else if (fi === 'close') el = root.querySelector('#gclose');
    else if (fi === 'treset') el = root.querySelector('#treset');
    if (el) {
      el.classList.add('padfocus');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
}

export function open(onClose, paint, tab) { ensure(); garage.onClose = onClose; if (paint) paintApi = paint; if (tab) activeTab = tab; fi = 0; padUsed = false; render(); root.classList.add('on'); document.body.classList.add('garage-open'); }
export function close() { if (!root) return; root.classList.remove('on'); document.body.classList.remove('garage-open'); garage.onClose?.(); }
export const isOpen = () => !!root && root.classList.contains('on');

export function pad(k) {
  padUsed = true;
  if (k === 'b') { close(); return; }
  if (k === 'y') { route(st.route === 'nitro' ? 'electric' : 'nitro'); updateFocus(); return; }

  const tuneDefs = activeTuneDefs();
  const parts = partList();
  const tabIds = TABS.map(([k]) => 'tab-' + k);
  const topControls = [...tabIds, 'route-nitro', 'route-electric', activeTab === 'tuning' ? 'treset' : activeTab === 'paint' ? null : 'refund', 'close'].filter(Boolean);
  const isTop = typeof fi === 'string' && topControls.includes(fi);

  if (isTop) {
    const topIdx = topControls.indexOf(fi);
    if (k === 'l') {
      fi = topControls[Math.max(0, topIdx - 1)];
    } else if (k === 'r') {
      fi = topControls[Math.min(topControls.length - 1, topIdx + 1)];
    } else if (k === 'd') {
      fi = 0;
    } else if (k === 'a') {
      if (fi.startsWith('tab-')) { const t = fi.slice(4); setTab(t); fi = 'tab-' + t; }
      else if (fi === 'route-nitro') route('nitro');
      else if (fi === 'route-electric') route('electric');
      else if (fi === 'refund') root.querySelector('#greset')?.click();
      else if (fi === 'treset') root.querySelector('#treset')?.click();
      else if (fi === 'close') close();
      return;
    }
  } else if (activeTab === 'paint') {
    const secs = paintApi ? paintApi.sections() : [];
    if (typeof fi !== 'number' || fi < 0) fi = 0;
    if (k === 'u') { if (fi > 0) fi--; else fi = 'tab-paint'; }
    else if (k === 'd') { if (fi < secs.length) fi++; }
    else if (fi < secs.length && (k === 'l' || k === 'r')) {
      const sc = secs[fi], i = sc.palette.findIndex(([h]) => h.toLowerCase() === sc.cur().toLowerCase());
      const n = Math.max(0, Math.min(sc.palette.length - 1, i + (k === 'r' ? 1 : -1)));
      sc.set(sc.palette[n][0], sc.palette[n][1]); render(); return;
    } else if (k === 'a' && fi === secs.length) { paintApi.toggleBody(); render(); return; }
  } else if (activeTab === 'tuning') {
    if (typeof fi !== 'number' || fi < 0) fi = 0;
    const total = tuneDefs.length;
    if (k === 'u') {
      if (fi > 0) fi--;
      else fi = 'tab-' + activeTab;
    } else if (k === 'd') {
      if (fi < total - 1) fi++;
      else fi = 'treset';
    } else if (k === 'l') {
      const d = tuneDefs[fi];
      if (d) { adjustTune(d.id, -1); render(); }
      return;
    } else if (k === 'r') {
      const d = tuneDefs[fi];
      if (d) { adjustTune(d.id, 1); render(); }
      return;
    } else if (k === 'a') {
      const d = tuneDefs[fi];
      if (d) { adjustTune(d.id, 1); render(); }
      return;
    } else if (k === 'x') {
      const d = tuneDefs[fi];
      if (d) { adjustTune(d.id, -1); render(); }
      return;
    }
  } else {
    // fi is card index 0..Up.PARTS.length - 1
    if (typeof fi !== 'number' || fi < 0) fi = 0;
    const total = parts.length;
    const cols = getCols();

    if (k === 'l') {
      if (fi > 0) fi--;
    } else if (k === 'r') {
      if (fi < total - 1) fi++;
    } else if (k === 'u') {
      if (fi - cols >= 0) {
        fi -= cols;
      } else {
        const colPos = cols > 1 ? (fi % cols) / (cols - 1) : 0;
        if (colPos < 0.34) fi = 'tab-' + activeTab;
        else if (colPos < 0.67) fi = 'route-nitro';
        else fi = 'refund';
      }
    } else if (k === 'd') {
      if (fi + cols < total) {
        fi += cols;
      } else if (fi < total - 1) {
        fi = total - 1;
      }
    } else if (k === 'a') {
      const p = parts[fi];
      if (p) buyId(p.id);
      updateFocus();
      return;
    } else if (k === 'x') {
      const p = parts[fi];
      if (p) sellId(p.id);
      updateFocus();
      return;
    }
  }

  updateFocus();
}
export function credits() { return Up.load().credits; }
export const garage = { open, close, isOpen, pad, onClose: null };

