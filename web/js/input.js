import { getMap, read } from './padmap.js';
// Keyboard + gamepad + touch input merged into one analogue state: {throttle, brake, steer(-1..1), soft}
export class Input {
  constructor(keys) {
    this.keys = keys; this.pad = { throttle: 0, brake: 0, steer: 0, soft: 0 }; this.touch = { throttle: 0, brake: 0, steer: 0, active: false }; this.touchIds = new Map(); this.cam = false; this.reset = false; this._camPrev = false; this._rstPrev = false; this._menuPrev = false; this._accPrev = false; this._bakPrev = false; this._lightsPrev = false;
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) this.setupTouch();
  }
  setupTouch() {
    const mk = (css, label) => { const d = document.createElement('div'); d.textContent = label; Object.assign(d.style, { position: 'fixed', background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.45)', borderRadius: '14px', color: '#fff', font: 'bold 22px sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', touchAction: 'none', zIndex: 5, ...css }); document.body.appendChild(d); return d; };
    const L = mk({ left: '12px', bottom: '150px', width: '90px', height: '90px' }, '◀'), R = mk({ left: '116px', bottom: '150px', width: '90px', height: '90px' }, '▶');
    const G = mk({ right: '12px', bottom: '150px', width: '110px', height: '90px' }, 'GAS'), B = mk({ right: '132px', bottom: '150px', width: '90px', height: '90px' }, 'BRAKE');
    const C = mk({ right: '12px', top: '48px', width: '70px', height: '46px', font: 'bold 14px sans-serif' }, 'CAM'), X = mk({ right: '90px', top: '48px', width: '70px', height: '46px', font: 'bold 14px sans-serif' }, 'RESET'), S = mk({ right: '168px', top: '48px', width: '70px', height: '46px', font: 'bold 14px sans-serif' }, 'START'), LT = mk({ right: '246px', top: '48px', width: '70px', height: '46px', font: 'bold 14px sans-serif' }, 'LIGHTS');
    const bind = (el, on, off) => { const d = (e) => { e.preventDefault(); on(); }, u = (e) => { e.preventDefault(); off(); }; el.addEventListener('pointerdown', d); el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u); el.addEventListener('pointerleave', u); };
    const t = this.touch; bind(L, () => { t.steer = 1; t.active = true; }, () => { if (t.steer > 0) t.steer = 0; }); bind(R, () => { t.steer = -1; t.active = true; }, () => { if (t.steer < 0) t.steer = 0; });
    bind(G, () => { t.throttle = 1; t.active = true; }, () => { t.throttle = 0; }); bind(B, () => { t.brake = 1; t.active = true; }, () => { t.brake = 0; });
    bind(C, () => { this.camPress = true; }, () => {}); bind(X, () => { this.resetPress = true; }, () => {}); bind(S, () => { this.menuPress = true; }, () => {}); bind(LT, () => { this.lightsPress = true; }, () => {});
  }
  poll() {
    const k = (...c) => c.some((x) => this.keys.has(x)), pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [], p = pads[0], s = { throttle: 0, brake: 0, steer: 0, soft: 0, cam: false, lights: false, reset: false, menu: false, accept: false, back: false, u: false, d: false, l: false, r: false };
    if (p) {
      const std = p.mapping === 'standard', ax = (j) => { const v = p.axes[j] || 0; return Math.abs(v) < 0.12 ? 0 : v; }, bt = (j) => (p.buttons[j] ? p.buttons[j].value : 0), b = (j) => !!(p.buttons[j] && p.buttons[j].pressed);
      if (!this.rest) this.rest = p.axes.map((v) => v);
      const map = getMap(p.id);
      if (map) {
        const L = read(p, map);
        s.steer = L.steer_l - L.steer_r; s.throttle = L.throttle; s.brake = L.brake; s.soft = L.soft > 0.5 ? 1 : 0; s.cam = L.cam > 0.5; s.lights = L.lights > 0.5; s.reset = L.reset > 0.5; s.menu = L.menu > 0.5; s.accept = L.accept > 0.5; s.back = L.back > 0.5;
        let upAct = (L['up'] || 0) > 0.55, downAct = (L['down'] || 0) > 0.55;
        const steerBinding = map['steer_l'] || map['steer_r'];
        if (steerBinding && steerBinding.t === 'a') {
          const steerAxisIdx = steerBinding.i;
          const yAxisIdx = steerAxisIdx % 2 === 0 ? steerAxisIdx + 1 : steerAxisIdx;
          const stickY = p.axes[yAxisIdx];
          if (stickY != null) {
            if (stickY < -0.55) upAct = true;
            else if (stickY > 0.55) downAct = true;
          }
        }
        if (b(12)) upAct = true;
        if (b(13)) downAct = true;
        const steerL = (L['steer_l'] || 0) > 0.55, steerR = (L['steer_r'] || 0) > 0.55;
        const absSteer = Math.max(L['steer_l'] || 0, L['steer_r'] || 0);
        const isVertical = upAct || downAct;
        const isHorizontal = (steerL || steerR || b(14) || b(15)) && (!isVertical || absSteer > 0.75);
        s.u = upAct; s.d = downAct; s.l = isHorizontal && (steerL || b(14)); s.r = isHorizontal && (steerR || b(15));
      } else {
        // triggers: standard mapping = buttons 6/7; otherwise analogue axes that rest at -1 (lower index = left trigger), falling back to buttons 6/7
        let lt = std ? bt(6) : 0, rt = std ? bt(7) : 0;
        if (!std) { const tr = []; p.axes.forEach((v, j) => { if (j >= 2 && this.rest[j] < -0.9) tr.push((v + 1) / 2); }); if (tr.length >= 2) { lt = tr[0]; rt = tr[tr.length - 1]; } else { lt = bt(6); rt = bt(7); } }
        const dz = (v) => (v < 0.15 ? 0 : v); lt = dz(lt); rt = dz(rt);
        const a0 = p.axes[0] || 0, a1 = p.axes[1] || 0;
        const horiz = Math.abs(a0) > 0.55 && Math.abs(a0) >= Math.abs(a1) * 0.9;
        const vert = Math.abs(a1) > 0.55 && Math.abs(a1) >= Math.abs(a0) * 0.9;
        s.steer = -ax(0); s.throttle = Math.max(rt, bt(0)); s.brake = Math.max(lt, bt(1)); s.soft = bt(5) > 0.5 || bt(2) > 0.5 ? 1 : 0; s.cam = bt(3) > 0.5; s.lights = bt(4) > 0.5; s.reset = bt(10) > 0.5; s.menu = bt(11) > 0.5 || bt(9) > 0.5; s.accept = bt(0) > 0.5; s.back = bt(1) > 0.5;
        s.l = b(14) || (horiz && a0 < -0.55); s.r = b(15) || (horiz && a0 > 0.55); s.u = b(12) || (vert && a1 < -0.55); s.d = b(13) || (vert && a1 > 0.55);
      }
      if (new URLSearchParams(location.search).has('debug')) { const now = performance.now(); if (!this._dbgT || now - this._dbgT > 400) { this._dbgT = now; window.__padInfo = `PAD ${p.id.slice(0, 40)} map=${p.mapping || 'none'} btn[${p.buttons.map((x, j) => (x.value > 0.2 ? j : '')).filter((x) => x !== '').join(',')}] ax[${p.axes.map((x) => x.toFixed(1)).join(' ')}] lt=${lt.toFixed(2)} rt=${rt.toFixed(2)}`; } }
    }
    const t = this.touch;
    const now = performance.now();
    if (!this._padRep) this._padRep = {};
    const dirEdgeOrRep = (dirKey, active) => {
      const prev = !!this['_' + dirKey + 'Prev'];
      const edge = active && !prev;
      const rep = active && prev && (now - (this._padRep[dirKey] || 0) > 220);
      if (edge || rep) { this._padRep[dirKey] = now; return true; }
      return false;
    };
    const layout = Input.getLayout();
    const upKey = layout === 'wasd' ? k('KeyW') : layout === 'arrows' ? k('ArrowUp') : k('ArrowUp', 'KeyW');
    const downKey = layout === 'wasd' ? k('KeyS') : layout === 'arrows' ? k('ArrowDown') : k('ArrowDown', 'KeyS');
    const leftKey = layout === 'wasd' ? k('KeyA') : layout === 'arrows' ? k('ArrowLeft') : k('ArrowLeft', 'KeyA');
    const rightKey = layout === 'wasd' ? k('KeyD') : layout === 'arrows' ? k('ArrowRight') : k('ArrowRight', 'KeyD');

    const out = { throttle: Math.max(upKey ? 1 : 0, s.throttle, t.throttle), brake: Math.max(downKey ? 1 : 0, s.brake, t.brake),
      steer: Math.max(-1, Math.min(1, (leftKey ? 1 : 0) - (rightKey ? 1 : 0) + s.steer + t.steer)), soft: (k('ControlLeft', 'ControlRight') ? 1 : 0) || s.soft,
      camPressed: (s.cam && !this._camPrev) || !!this.camPress, lightsPressed: (s.lights && !this._lightsPrev) || !!this.lightsPress, resetPressed: (s.reset && !this._rstPrev) || !!this.resetPress, resetDown: !!(s.reset || this.resetPress || k('KeyR')), menuPressed: (s.menu && !this._menuPrev) || !!this.menuPress,
      acceptPressed: (s.accept && !this._accPrev) || !!this.acceptPress, backPressed: (s.back && !this._bakPrev) || !!this.backPress,
      upPressed: dirEdgeOrRep('u', s.u || upKey), downPressed: dirEdgeOrRep('d', s.d || downKey),
      leftPressed: dirEdgeOrRep('l', s.l || leftKey), rightPressed: dirEdgeOrRep('r', s.r || rightKey) };
    this._camPrev = s.cam; this._lightsPrev = s.lights; this._rstPrev = s.reset; this._menuPrev = s.menu; this._accPrev = s.accept; this._bakPrev = s.back;
    this._uPrev = s.u || upKey; this._dPrev = s.d || downKey;
    this._lPrev = s.l || leftKey; this._rPrev = s.r || rightKey;
    this.camPress = false; this.lightsPress = false; this.resetPress = false; this.menuPress = false; this.acceptPress = false; this.backPress = false; return out;
  }
}
Input.getLayout = function() {
  try { return localStorage.getItem('mts_key_layout') || 'arrows'; } catch (e) { return 'arrows'; }
};
Input.setLayout = function(layout) {
  try { localStorage.setItem('mts_key_layout', layout); } catch (e) {}
};
