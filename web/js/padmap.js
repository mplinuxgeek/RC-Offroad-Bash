// Controller mapping: a guided "press each control in turn" wizard (hold any input to skip a binding) + the logical reader used by driving and menu navigation.
// Mapping is stored per controller id in localStorage ('mts_padmap'): {id: {action: {t:'b',i} | {t:'a',i,s,r} | null}}.
export const ACTIONS = [
  ['steer_l', 'Steer LEFT', 'Push the stick (or D-pad) LEFT'], ['steer_r', 'Steer RIGHT', 'Push the stick (or D-pad) RIGHT'],
  ['throttle', 'THROTTLE', 'Press the accelerator (right trigger)'], ['brake', 'BRAKE / REVERSE', 'Press the brake (left trigger)'],
  ['cam', 'CHANGE CAMERA', 'Press the camera button'], ['reset', 'RESET TRUCK', 'Press the reset button'], ['menu', 'MENU / START', 'Press the menu / start button'],
  ['lights', 'HEADLIGHTS (optional)', 'Press the lights button'], ['soft', 'SOFT THROTTLE (optional)', 'Press a shoulder button'],
  ['up', 'MENU UP', 'Press UP (D-pad or stick)'], ['down', 'MENU DOWN', 'Press DOWN (D-pad or stick)'],
  ['accept', 'MENU SELECT / BUY', 'Press the confirm button (A / Cross)'], ['back', 'MENU BACK', 'Press the back button (B / Circle)'],
  ['lb', 'PREVIOUS TRUCK', 'Press the left bumper'], ['rb', 'NEXT TRUCK', 'Press the right bumper'], ['alt1', 'GARAGE: SWITCH BRANCH', 'Press Y / Triangle'], ['alt2', 'GARAGE: UNINSTALL', 'Press X / Square'],
];
const KEY = 'mts_padmap';
const all = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
export const getMap = (id) => all()[id] || null;
export function saveMap(id, map) { const a = all(); a[id] = map; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
export function clearMap(id) { const a = all(); delete a[id]; try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
export const firstPad = () => (navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null) || null;

/** value 0..1 of one binding on a pad */
export function bval(p, b) {
  if (!b) return 0;
  if (b.t === 'b') return p.buttons[b.i] ? (p.buttons[b.i].value > 0 ? p.buttons[b.i].value : p.buttons[b.i].pressed ? 1 : 0) : 0;
  const v = p.axes[b.i]; if (v == null) return 0; const max = b.s > 0 ? 1 - b.r : b.r + 1, x = (b.s * (v - b.r)) / (max || 1); return x < 0.15 ? 0 : Math.min(1, x);
}
/** logical state from a mapping: {action: 0..1} */
export function read(p, map) { const o = {}; for (const [id] of ACTIONS) o[id] = bval(p, map[id]); return o; }

// ---------------- wizard UI ----------------
export function startWizard(onDone) {
  const root = document.createElement('div'); root.id = 'padwiz';
  root.innerHTML = '<div class="pwcard"><h2>Controller setup</h2><div class="pwstep" id="pwstep"></div><div class="pwdesc" id="pwdesc"></div><div class="pwbar"><b id="pwbar"></b></div><div class="pwhold"><i id="pwhold"></i></div><div class="pwhint" id="pwhint"></div><div class="pwbtns"><button class="btn" id="pwskip">Skip this</button><button class="btn" id="pwcancel">Cancel</button></div></div>';
  document.body.appendChild(root); const $ = (id) => root.querySelector('#' + id);
  let step = -1, map = {}, base = null, cand = null, holdT = 0, last = performance.now(), idle = 0, raf = 0, padId = null, done = false, rest = null, waiting = true;
  const finish = (ok) => { if (done) return; done = true; clearInterval(raf); if (ok && padId) saveMap(padId, map); root.remove(); onDone?.(ok); };
  $('pwcancel').onclick = () => finish(false); $('pwskip').onclick = () => bind(null);
  const esc = (e) => { if (e.code === 'Escape') { removeEventListener('keydown', esc); finish(false); } }; addEventListener('keydown', esc);
  const snap = (p) => ({ ax: p.axes.slice(), bt: p.buttons.map((b) => b.pressed || b.value > 0.5) });
  function show() { const [id, label, desc] = ACTIONS[step]; $('pwstep').textContent = `${step + 1} / ${ACTIONS.length}  ·  ${label}`; $('pwdesc').textContent = desc; $('pwbar').style.width = `${step / ACTIONS.length * 100}%`; $('pwhint').textContent = 'Tap the control to bind it. HOLD any control for 1.5 s to skip this binding.'; }
  function bind(b) { if (step >= 0) map[ACTIONS[step][0]] = b; step++; cand = null; holdT = 0; base = null; idle = 0; waiting = true; $('pwhold').style.width = '0%'; if (step >= ACTIONS.length) { finish(true); return; } show(); }
  function tick(now) {
    if (done) return; const dt = Math.min(0.1, (now - last) / 1000); last = now; const p = firstPad();
    if (!p) { $('pwstep').textContent = 'Press any button on your controller…'; $('pwdesc').textContent = 'No controller detected yet (browsers only see it after the first press).'; return; }
    if (padId !== p.id) { padId = p.id; step = -1; map = {}; base = null; rest = p.axes.slice(); waiting = true; idle = 0; }
    if (step < 0) { step = 0; show(); }
    const cur = snap(p);
    if (waiting) { const ok = !cur.bt.some(Boolean) && cur.ax.every((v, i) => Math.abs(v - rest[i]) < 0.3); idle = ok ? idle + dt : 0; if (idle > 0.35) { waiting = false; base = { ax: rest.slice(), bt: cur.bt }; } return; }
    // detect the most deflected control relative to the baseline taken when the step began
    let found = null, dev = 0;
    cur.bt.forEach((on, i) => { if (on && !base.bt[i]) { found = { t: 'b', i }; dev = 9; } });
    if (dev < 9) cur.ax.forEach((v, i) => { const d = v - base.ax[i]; if (Math.abs(d) > 0.6 && Math.abs(d) > dev) { dev = Math.abs(d); found = { t: 'a', i, s: Math.sign(d), r: base.ax[i] }; } });
    const same = (a, b) => a && b && a.t === b.t && a.i === b.i && a.s === b.s;
    if (found) { if (!cand || !same(found, cand)) { cand = found; holdT = 0; } else holdT += dt; $('pwhold').style.width = `${Math.min(1, holdT / 1.5) * 100}%`; if (holdT >= 1.5) { bind(null); }
    } else if (cand) { // released: bind it
      const c = cand; cand = null; $('pwhold').style.width = '0%'; if (holdT < 1.5) bind(c); }
  }
  raf = setInterval(() => tick(performance.now()), 16);
  return { cancel: () => finish(false) };
}
