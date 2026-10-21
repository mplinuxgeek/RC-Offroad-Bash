import * as THREE from 'three';
import { LOWQ } from './gfx.js';

/** HUD: original gauge meshes (WebGL ortho overlay) + original bitmap font (2D canvas overlay). */
export class Hud {
  constructor(renderer) {
    this.renderer = renderer; this.scene = new THREE.Scene(); this.cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
    this.text = document.createElement('canvas'); Object.assign(this.text.style, { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' });
    document.body.appendChild(this.text); this.ctx = this.text.getContext('2d');
    this.fonts = {}; this.wid = {};
    this.rpm = 1000; this.gear = 1;
  }
  async init() {
    // start lights: a generated three-lamp gantry on a canvas texture, redrawn when the state changes
    // (0 = all dark, 1..3 = that many red lamps lit, 4 = green, 5 = false start, all red)
    const lc = document.createElement('canvas'); lc.width = 512; lc.height = 256; this.lightCtx = lc.getContext('2d');
    this.lightTex = new THREE.CanvasTexture(lc); this.lightTex.colorSpace = THREE.SRGBColorSpace; this.lightState = -2;
    this.lightMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ map: this.lightTex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    this.lights = [this.lightMesh]; this.root = new THREE.Group(); this.root.add(this.lightMesh); this.scene.add(this.root);
    try { await Promise.all([document.fonts.load('700 20px "Barlow Condensed"'), document.fonts.load('600 20px "Barlow"')]); } catch (e) {}
    this.resize();
  }
  drawLights(st) {
    this.lightMesh.visible = st >= 0;
    if (st < 0 || st === this.lightState) return;
    this.lightState = st;
    const c = this.lightCtx, W = 512, H = 256;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(14,16,22,0.92)'; c.beginPath(); c.roundRect(14, 40, W - 28, 176, 36); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 4; c.stroke();
    for (let i = 0; i < 3; i++) {
      const x = 96 + i * 160, y = H / 2, lit = st === 5 || (st === 4 ? true : st > i), col = st === 4 ? '#37e36a' : '#ff2a1c';
      c.fillStyle = '#05060a'; c.beginPath(); c.arc(x, y, 62, 0, Math.PI * 2); c.fill();
      if (lit) { const g = c.createRadialGradient(x, y, 4, x, y, 100); g.addColorStop(0, col + 'aa'); g.addColorStop(1, col + '00'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 100, 0, Math.PI * 2); c.fill(); }
      const g2 = c.createRadialGradient(x - 14, y - 16, 4, x, y, 52); if (lit) { g2.addColorStop(0, '#ffffffdd'); g2.addColorStop(0.25, col); g2.addColorStop(1, col + 'aa'); } else { g2.addColorStop(0, '#2a2e38'); g2.addColorStop(1, '#10131a'); }
      c.fillStyle = g2; c.beginPath(); c.arc(x, y, 52, 0, Math.PI * 2); c.fill();
    }
    this.lightTex.needsUpdate = true;
  }
  resize() {
    const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
    this.W = W; this.H = H; this.text.width = W * dpr; this.text.height = H * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Object.assign(this.cam, { left: 0, right: W, top: H, bottom: 0 }); this.cam.updateProjectionMatrix();
    this.u = Math.min(W, H * 1.6) / 1000; // layout unit
    // speedometer bottom-right, clinometers bottom-left (mesh units * pixel scale)
    const s = 190 * this.u;
    for (const m of this.lights) { m.scale.setScalar(120 * this.u); m.position.set(W / 2, H - 170 * this.u, 0); }
    this.speedCenter = [W - 120 * this.u, H - (90 * this.u + 0.25 * s)];
  }
  /** Draw text (modern HUD font). size = glyph height px; font 'white' = primary, 'main' = accent, or direct CSS color string. y = top of the text box. */
  draw(str, x, y, size = 32, font = 'main', align = 'left') {
    const ctx = this.ctx; ctx.save(); ctx.font = `700 ${(size * 1.12).toFixed(1)}px "Barlow Condensed","Barlow",system-ui,sans-serif`; ctx.textBaseline = 'top'; ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, size * 0.14); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; const txt = String(str).toUpperCase(); ctx.strokeText(txt, x, y - size * 0.1);
    ctx.fillStyle = font === 'white' ? '#f4f7fb' : (font === 'main' ? '#ffb84a' : font); ctx.fillText(txt, x, y - size * 0.1); ctx.restore();
  }
  /** s: {speed (m/s), fwd (m/s), throttle, roll, pitch (rad), time, cp, cpTotal, msg, state} */
  update(s) {
    // synthesized gearbox / RPM (original exe model not recovered yet)
    const v = Math.abs(s.fwd), gears = [12.5, 21, 28]; let g = gears.findIndex((m) => v <= m); if (g < 0) g = gears.length - 1;
    const lo = g ? gears[g - 1] * 0.55 : 0, rpmT = 900 + 5600 * Math.min(1, Math.max(0, (v - lo) / (gears[g] - lo)) * 0.88 + 0.12 * s.throttle);
    this.rpm += (rpmT - this.rpm) * 0.25; this.gear = s.fwd < -0.5 ? 'R' : (s.gear > 0 ? s.gear : g + 1);
    // needles
    const kn = v * 2.23694; // dial is calibrated in mph (0..90); needle pins just past the end of the scale
    this.drawLights(s.lights);
    const r = this.renderer; r.autoClear = false; r.clearDepth(); r.render(this.scene, this.cam);
    // 2D overlay
    if (LOWQ && (this._fn = ((this._fn || 0) + 1) % 3)) return; // weak GPUs: redraw the full-screen 2D overlay every third frame
    const ctx = this.ctx; ctx.clearRect(0, 0, this.W, this.H); const u = this.u;
    this.speedoGauge(this.speedCenter[0], this.speedCenter[1], 88 * u, kn);
    this.draw(`${(v * 2.23694).toFixed(0)}`, this.speedCenter[0], this.speedCenter[1] + 22 * u, 34 * u, 'white', 'center');
    this.draw('mph', this.speedCenter[0], this.speedCenter[1] + 62 * u, 16 * u, 'main', 'center');
    this.clinoPanel(20 * u, this.H - 150 * u, 300 * u, 130 * u, s.pitch, -s.roll);
    const rx = this.W - 300 * u, ry = this.H - 70 * u, Rr = 54 * u;
    this.rpmGauge(rx, ry, Rr);
    this.draw(String(this.gear), rx, ry + Rr * 0.28, 30 * u, 'white', 'center');
    if (s.fuelPct != null) {
      this.fuelGauge(this.W - 275 * u, this.H - 26 * u, 240 * u, 20 * u, s.fuelPct, !!s.isElectric, !!s.fuelEmpty);
    }
    if (s.credits != null) this.draw(`CREDITS ${Math.round(s.credits).toLocaleString('en-US')}`, 16 * u, (s.free ? 14 : 116) * u, 22 * u, 'main', 'left');
    if (s.fs) { /* freestyle draws its own DOM overlay (freestyle.js) */ } else if (s.free) this.draw('FREE ROAM', this.W / 2, 14 * u, 40 * u, 'white', 'center');
    else if (s.isRace) {
      // Race mode live timing & splits display
      const isRecord = s.raceBestTime > 0;
      this.draw(`TIME  ${s.time.toFixed(2)}`, this.W / 2, 14 * u, 42 * u, 'white', 'center');
      if (isRecord) {
        this.draw(`RECORD  ${s.raceBestTime.toFixed(2)}`, this.W / 2, 58 * u, 22 * u, 'rgba(255,255,255,0.7)', 'center');
      }
      this.draw(`SCORE ${Math.round(s.score)}`, 16 * u, 14 * u, 34 * u, 'white', 'left');
      this.draw(`HI SCORE ${Math.round(s.hiScore)}`, 16 * u, 54 * u, 24 * u, 'main', 'left');
      this.draw(`CHECKPOINT ${Math.min(s.cp + 1, s.cpTotal)}/${s.cpTotal}`, 16 * u, 86 * u, 24 * u, 'main', 'left');

      // Live / recent checkpoint split banner
      if (s.split) {
        const d = s.split.delta;
        const col = d == null ? '#38bdf8' : (d <= 0 ? '#22c55e' : '#ef4444');
        const sign = d == null ? '' : (d >= 0 ? '+' : '');
        const str = d == null ? `GATE ${s.split.gate}  ${s.split.time.toFixed(2)}s` : `GATE ${s.split.gate}  ${sign}${d.toFixed(2)}s`;
        this.draw(str, this.W / 2, 86 * u, 28 * u, col, 'center');
      }
    }
    if (s.restartProgress > 0) {
      const p = Math.min(1, Math.max(0, s.restartProgress));
      const bw = 240 * u, bh = 14 * u, bx = (this.W - bw) / 2, by = 135 * u;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 3 * u, by - 3 * u, bw + 6 * u, bh + 6 * u);
      ctx.fillStyle = '#ff8a1f';
      ctx.fillRect(bx, by, bw * p, bh);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, bw, bh);
      this.draw(`HOLD TO RESTART RACE ${Math.round(p * 100)}%`, this.W / 2, by + 18 * u, 20 * u, 'white', 'center');
      ctx.restore();
    }
    if (s.msg && !s.finish && !s.split && !s.fs) this.draw(s.msg, this.W / 2, 100 * u, 26 * u, 'main', 'center');
    else if (s.lostWheels) this.draw(`WHEELS LOST: ${s.lostWheels}`, this.W / 2, this.H * 0.32, 26 * u, 'main', 'center');
    if (s.state === 'false') this.draw('FALSE START!', this.W / 2, this.H * 0.4, 56 * u, 'white', 'center');
    if (s.state === 'done' && s.finish) this.statsScreen(s.finish);
  }
  statsScreen(f) { // results card (race finish / stuntstats)
    const ctx = this.ctx, u = this.u, W = Math.min(this.W * 0.94, 940 * u);
    if (f.isRace) {
      const hasSplits = f.splits && f.splits.length > 0;
      const H = (hasSplits ? 420 : 340) * u, X0 = (this.W - W) / 2, Y0 = (this.H - H) / 2;
      ctx.save(); ctx.fillStyle = 'rgba(10,14,22,0.92)'; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(X0, Y0, W, H, 18 * u); ctx.fill(); ctx.stroke();
      this.draw('RACE FINISHED!', X0 + 28 * u, Y0 + 20 * u, 38 * u, 'white', 'left');
      this.draw(`TIME ${f.time.toFixed(2)}s`, X0 + W - 28 * u, Y0 + 22 * u, 32 * u, f.best ? '#22c55e' : 'main', 'right');
      const ly = Y0 + 68 * u;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(X0 + 20 * u, ly - 4 * u, W - 40 * u, 26 * u);
      this.draw('BREAKDOWN', X0 + 28 * u, ly, 18 * u, 'main', 'left');
      this.draw('PTS', X0 + W - 28 * u, ly, 18 * u, 'main', 'right');
      const rows = [
        ['RACE COMPLETION', Math.round(f.finishPts || 500)],
        ['STUNT BONUSES', Math.round(f.stuntPts || 0)],
        [f.best ? 'RECORD BEATEN BONUS!' : 'TIME RATING', Math.round(f.timeBonus || 0)]
      ];
      rows.forEach(([label, pts], i) => {
        const y = ly + 30 * u + i * 28 * u;
        if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(X0 + 20 * u, y - 4 * u, W - 40 * u, 28 * u); }
        this.draw(label, X0 + 28 * u, y, 20 * u, 'white', 'left');
        this.draw(String(pts), X0 + W - 28 * u, y, 22 * u, 'main', 'right');
      });

      // Split times table / comparison against record
      let nextY = ly + 30 * u + rows.length * 28 * u + 6 * u;
      if (hasSplits) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(X0 + 20 * u, nextY - 4 * u, W - 40 * u, 24 * u);
        this.draw('SPLITS', X0 + 28 * u, nextY, 17 * u, 'main', 'left');
        this.draw('TIME', X0 + W * 0.58, nextY, 17 * u, 'main', 'right');
        this.draw(f.hasPrevRecord ? 'VS RECORD' : 'SPLIT TIME', X0 + W - 28 * u, nextY, 17 * u, 'main', 'right');
        nextY += 26 * u;

        // Show sample of splits (or all if <= 5)
        const spList = f.splits.length <= 5 ? f.splits : [f.splits[0], ...f.splits.slice(-3)];
        spList.forEach((sp, i) => {
          const y = nextY + i * 24 * u;
          if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(X0 + 20 * u, y - 3 * u, W - 40 * u, 24 * u); }
          this.draw(`GATE ${sp.gate}/${f.splits.length}`, X0 + 28 * u, y, 18 * u, 'white', 'left');
          this.draw(`${sp.time.toFixed(2)}s`, X0 + W * 0.58, y, 19 * u, 'white', 'right');
          const d = sp.delta;
          const col = d == null ? '#38bdf8' : (d <= 0 ? '#22c55e' : '#ef4444');
          const deltaStr = d == null ? `${sp.time.toFixed(2)}s` : `${d >= 0 ? '+' : ''}${d.toFixed(2)}s`;
          this.draw(deltaStr, X0 + W - 28 * u, y, 19 * u, col, 'right');
        });
        nextY += spList.length * 24 * u + 4 * u;
      }

      const ty = nextY + 6 * u;
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(X0 + 20 * u, ty - 6 * u, W - 40 * u, 1.5);
      this.draw('TOTAL SCORE', X0 + 28 * u, ty + 2 * u, 24 * u, 'main', 'left');
      this.draw(String(Math.round(f.score)), X0 + 28 * u, ty + 26 * u, 42 * u, 'white', 'left');
      if (f.best) this.draw('NEW BEST TIME!', X0 + W - 28 * u, ty + 4 * u, 26 * u, '#22c55e', 'right');
      if (f.credits) this.draw(`+${f.credits} CREDITS`, X0 + W - 28 * u, ty + 30 * u, 26 * u, 'main', 'right');
      this.draw('A / ENTER  RETRY      B / ESC  MENU', this.W / 2, Y0 + H - 22 * u, 19 * u, 'main', 'center');
      ctx.restore();
      return;
    }
    const rh = Math.max(22, 38 * u), fit = (n) => Math.min(1, this.H * 0.95 / ((300 * u) + n * rh + 40 * u), this.W * 0.97 / W);
    let n = f.rows ? f.rows.length : 0; while (n > 6 && fit(n) < 0.6) n--; const rows = (f.rows || []).slice(-n), k = fit(n), H = (150 * u) + rows.length * rh + 150 * u, X0 = (this.W - W) / 2, Y0 = (this.H - (H + 30 * u)) / 2;
    const tot = { time: 0, centre: 0, align: 0 }; (f.rows || []).forEach((r) => { tot.time += r.time; tot.centre += r.centre; tot.align += r.align; });
    ctx.save(); ctx.translate(this.W / 2, this.H / 2); ctx.scale(k, k); ctx.translate(-this.W / 2, -this.H / 2); ctx.fillStyle = 'rgba(10,14,22,0.86)'; ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; const R = 18 * u; ctx.beginPath(); ctx.roundRect(X0, Y0, W, H, R); ctx.fill(); ctx.stroke();
    this.draw('RESULTS', X0 + 28 * u, Y0 + 22 * u, 40 * u, 'white', 'left'); this.draw(`TIME ${f.time.toFixed(2)}`, X0 + W - 28 * u, Y0 + 26 * u, 30 * u, 'main', 'right');
    const cols = [['GATE', 0.04, 'left'], ['TIME', 0.2, 'right'], ['TIME PTS', 0.42, 'right'], ['CENTERING', 0.68, 'right'], ['ALIGNMENT', 0.96, 'right']], hy = Y0 + 92 * u;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(X0 + 20 * u, hy - 4 * u, W - 40 * u, 30 * u);
    cols.forEach(([t, p, al]) => this.draw(t, X0 + W * p, hy, 20 * u, 'main', al));
    rows.forEach((r, i) => { const y = hy + 38 * u + i * rh; if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(X0 + 20 * u, y - 4 * u, W - 40 * u, rh); }
      [r.n, r.t.toFixed(2), Math.round(r.time), Math.round(r.centre), Math.round(r.align)].forEach((v, k) => this.draw(v, X0 + W * cols[k][1], y, 24 * u, 'white', cols[k][2])); });
    const ty = hy + 38 * u + rows.length * rh + 10 * u; ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(X0 + 20 * u, ty - 6 * u, W - 40 * u, 1.5);
    this.draw('TOTAL', X0 + W * 0.04, ty + 4 * u, 24 * u, 'main', 'left'); [Math.round(tot.time), Math.round(tot.centre), Math.round(tot.align)].forEach((v, k) => this.draw(v, X0 + W * cols[k + 2][1], ty + 4 * u, 26 * u, 'white', 'right'));
    if (n < (f.rows ? f.rows.length : 0)) this.draw(`(last ${n} of ${f.rows.length} gates shown)`, X0 + W - 28 * u, hy - 22 * u, 14 * u, 'main', 'right');
    this.draw('SCORE', X0 + 28 * u, ty + 46 * u, 26 * u, 'main', 'left'); this.draw(String(Math.round(f.score)), X0 + 28 * u, ty + 70 * u, 64 * u, 'white', 'left');
    this.draw(`HI-SCORE ${Math.round(f.hi)}`, X0 + W - 28 * u, ty + 56 * u, 26 * u, 'main', 'right'); if (f.best) this.draw('NEW BEST!', X0 + W - 28 * u, ty + 90 * u, 34 * u, 'white', 'right'); if (f.credits) this.draw(`+${f.credits} CREDITS`, X0 + W - 28 * u, ty + 126 * u, 26 * u, 'main', 'right');
    this.draw('A / ENTER  RETRY      V  REPLAY      D  SAVE .RPL      B / ESC  MENU', this.W / 2, Y0 + H + 10 * u, 20 * u, 'main', 'center'); ctx.restore();
  }
  speedoGauge(cx, cy, R, mph) {
    const ctx = this.ctx, a0 = 0.75 * Math.PI, sweep = 1.5 * Math.PI, max = 90, ang = (v) => a0 + sweep * v / max;
    ctx.save(); ctx.lineCap = 'butt';
    ctx.fillStyle = 'rgba(10,20,40,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.06, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,184,74,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R * 1.04, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.max(9, Math.round(R * 0.15))}px "Barlow Condensed",system-ui,sans-serif`;
    for (let v = 0; v <= max; v += 5) {
      const a = ang(v), big = v % 10 === 0, l = big ? 0.14 : 0.07; ctx.lineWidth = big ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * (0.92 - l), cy + Math.sin(a) * R * (0.92 - l)); ctx.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); ctx.stroke();
      if (v % 20 === 0) ctx.fillText(String(v), cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62);
    }
    this.needle(cx, cy, R, ang(Math.min(mph, max + 2)), 0.88); ctx.restore();
  }
  /** Analog clinometer panel: rolling (rear view) and pitching (side view) monster truck silhouettes tilt against a fixed orange horizon; degree scale on each rim with a red pointer. Angles in rad, positive = clockwise on screen. */
  clinoPanel(x0, y0, w, h, pitch, roll) {
    const ctx = this.ctx, u = this.u, R = h * 0.4, cy = y0 + h * 0.5, cl = x0 + 12 * u + R, cr = x0 + w - 12 * u - R, d = Math.PI / 180, lim = 60;
    ctx.save(); ctx.fillStyle = 'rgba(10,20,40,0.65)'; ctx.beginPath(); ctx.roundRect(x0, y0, w, h, 14 * u); ctx.fill();
    const poly = (pts) => { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); };
    const dial = (cx, a, side, label) => {
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
      ctx.save(); ctx.clip(); ctx.translate(cx, cy); ctx.rotate(Math.max(-1.2, Math.min(1.2, a))); ctx.scale(R, R);
      ctx.fillStyle = ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 0.035;
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
      if (side) {
        poly([[-0.56, 0.02], [-0.56, -0.16], [-0.3, -0.2], [-0.15, -0.38], [0.2, -0.38], [0.3, -0.18], [0.58, -0.14], [0.6, 0.02]]);
        ctx.fillRect(-0.5, 0.02, 1, 0.08); line(-0.5, 0.22, -0.4, 0.02); line(0.5, 0.22, 0.4, 0.02);
        for (const x of [-0.5, 0.5]) { ctx.fillStyle = '#d8d8d8'; ctx.beginPath(); ctx.arc(x, 0.22, 0.28, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(x, 0.22, 0.11, 0, 7); ctx.fill(); }
      } else {
        poly([[-0.34, 0.02], [-0.34, -0.18], [-0.25, -0.36], [0.25, -0.36], [0.34, -0.18], [0.34, 0.02]]);
        ctx.fillRect(-0.55, 0.12, 1.1, 0.07); line(-0.55, 0.2, -0.3, 0.0); line(0.55, 0.2, 0.3, 0.0);
        for (const x of [-0.62, 0.62]) { ctx.beginPath(); ctx.roundRect(x - 0.13, -0.08, 0.26, 0.6, 0.07); ctx.fill(); }
      }
      ctx.restore();
      ctx.strokeStyle = '#f08a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - R * 1.12, cy); ctx.lineTo(cx + R * 1.12, cy); ctx.stroke();
      // degree scale on the upper rim, 0 at top, every 10 deg
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.fillStyle = '#ffb84a';
      for (let g = -lim; g <= lim; g += 10) {
        const t = (g - 90) * d, big = g % 30 === 0, l = big ? 0.16 : 0.09; ctx.lineWidth = big ? 2 : 1.2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(t) * R * (0.97 - l), cy + Math.sin(t) * R * (0.97 - l)); ctx.lineTo(cx + Math.cos(t) * R * 0.97, cy + Math.sin(t) * R * 0.97); ctx.stroke();
        if (big) { ctx.font = `700 ${Math.max(8, Math.round(R * 0.15))}px "Barlow Condensed",system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(Math.abs(g)), cx + Math.cos(t) * R * 0.62, cy + Math.sin(t) * R * 0.62); }
      }
      const pa = Math.max(-lim * d, Math.min(lim * d, a)) - Math.PI / 2; ctx.fillStyle = '#f00'; ctx.save(); ctx.translate(cx, cy); ctx.rotate(pa);
      ctx.beginPath(); ctx.moveTo(R * 0.99, 0); ctx.lineTo(R * 0.8, -R * 0.07); ctx.lineTo(R * 0.8, R * 0.07); ctx.closePath(); ctx.fill(); ctx.restore();
      this.draw(label, cx, cy + R * 0.58, R * 0.17, 'white', 'center');
      ctx.restore();
    };
    dial(cl, roll, false, 'ROLLING'); dial(cr, pitch, true, 'PITCHING');
    this.draw('CLINOMETER', x0 + w / 2, y0 + h - 22 * u, 10 * u, 'white', 'center'); this.draw('DEGREES', x0 + w / 2, y0 + h - 11 * u, 9 * u, 'main', 'center');
    ctx.restore();
  }
  /** Tapered red needle: fine tip, thick near a round hub, short square tail behind. */
  needle(cx, cy, R, a, len) {
    const ctx = this.ctx; ctx.save(); ctx.translate(cx, cy); ctx.rotate(a); ctx.fillStyle = '#f00';
    const w = R * 0.045, t = R * 0.2, tw = Math.max(1, R * 0.012);
    ctx.beginPath(); ctx.moveTo(R * len, -tw); ctx.lineTo(0, -w); ctx.lineTo(-t, -w); ctx.lineTo(-t, w); ctx.lineTo(0, w); ctx.lineTo(R * len, tw); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, R * 0.08, 0, 7); ctx.fill(); ctx.restore();
  }
  rpmGauge(cx, cy, R) {
    const ctx = this.ctx, a0 = 0.75 * Math.PI, sweep = 1.5 * Math.PI, max = 7000, ang = (r) => a0 + sweep * r / max;
    ctx.save(); ctx.lineCap = 'butt';
    ctx.fillStyle = 'rgba(10,20,40,0.55)'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.08, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    for (let r = 0; r <= max; r += 500) { const a = ang(r), l = r % 1000 ? 0.08 : 0.16; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * (0.92 - l), cy + Math.sin(a) * R * (0.92 - l)); ctx.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); ctx.stroke(); }
    ctx.strokeStyle = '#e22'; ctx.lineWidth = R * 0.08; ctx.beginPath(); ctx.arc(cx, cy, R * 0.97, ang(6000), ang(max)); ctx.stroke();
    this.needle(cx, cy, R, ang(Math.min(this.rpm, max)), 0.85);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(9, Math.round(R * 0.18))}px "Barlow Condensed",system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText('x1000', cx, cy - R * 0.45); ctx.restore();
  }
  fuelGauge(x, y, w, h, pct, isElectric, empty) {
    const ctx = this.ctx, u = this.u;
    const p = Math.max(0, Math.min(1, pct));
    const label = isElectric ? 'BATTERY' : 'FUEL';
    const pctStr = `${Math.round(p * 100)}%`;
    ctx.save();
    // Background pill / box
    ctx.fillStyle = 'rgba(10,20,40,0.65)';
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6 * u);
    ctx.fill();
    ctx.stroke();

    // Fill bar
    const barPad = 3 * u;
    const barW = Math.max(0, (w - barPad * 2) * p);
    const barH = h - barPad * 2;
    if (barW > 0) {
      let col = '#22c55e';
      if (p <= 0.15) col = (Math.floor(performance.now() / 300) % 2 === 0) ? '#ff3b30' : '#b91c1c';
      else if (p <= 0.3) col = '#f59e0b';
      else if (isElectric) col = '#38bdf8';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(x + barPad, y + barPad, barW, barH, 4 * u);
      ctx.fill();
    }

    // Label and percentage text
    this.draw(label, x + 8 * u, y + 2 * u, 14 * u, 'white', 'left');
    this.draw(empty ? 'EMPTY' : pctStr, x + w - 8 * u, y + 2 * u, 14 * u, p <= 0.15 ? '#ff4d4d' : 'white', 'right');
    ctx.restore();
  }
}
