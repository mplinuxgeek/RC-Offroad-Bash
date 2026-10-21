// Performance overlay (F3, or ?fps): FPS, frame time, CPU busy %, GPU time, memory.
// Browsers expose no real CPU/GPU load: CPU is main-thread busy time as a share of the frame interval,
// GPU is the EXT_disjoint_timer_query_webgl2 draw time (n/a where the browser hides it),
// heap comes from performance.memory (Chromium only), geometries/textures from renderer.info.
const KEY = 'mts_perf';
const MB = 1048576;

export function createPerf(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:8px;right:8px;z-index:50;padding:6px 9px;font:12px/1.35 ui-monospace,Menlo,Consolas,monospace;color:#cfe;background:rgba(0,0,0,0.6);border-radius:4px;white-space:pre;pointer-events:none;display:none';
  document.body.appendChild(el);

  let on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}
  if (new URLSearchParams(location.search).has('fps')) on = true;
  const show = (v) => { on = v; el.style.display = v ? 'block' : 'none'; try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} };
  show(on);
  addEventListener('keydown', (e) => { if (e.code === 'F3') { show(!on); e.preventDefault(); } });

  let t0 = 0, lastStart = 0, shown = 0, n = 0, sumFrame = 0, sumBusy = 0, maxFrame = 0;
  let gpuMs = null, gpuSum = 0, gpuN = 0, query = null;
  const pending = [];

  function pollGpu() {
    while (pending.length) {
      const qy = pending[0];
      if (!gl.getQueryParameter(qy, gl.QUERY_RESULT_AVAILABLE)) break;
      pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) { gpuSum += gl.getQueryParameter(qy, gl.QUERY_RESULT) / 1e6; gpuN++; }
      gl.deleteQuery(qy);
    }
  }

  return {
    isOn() { return on; },
    toggle() { show(!on); return on; },
    set(v) { show(!!v); },
    begin(now) {
      t0 = performance.now();
      if (lastStart) { const dt = now - lastStart; sumFrame += dt; if (dt > maxFrame) maxFrame = dt; n++; }
      lastStart = now;
    },
    gpuBegin() { if (!on || !ext || query || pending.length > 4) return; query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); },
    gpuEnd() { if (!query) return; gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(query); query = null; },
    end() {
      sumBusy += performance.now() - t0;
      if (!on) { n = 0; sumFrame = sumBusy = maxFrame = 0; return; }
      const now = performance.now();
      if (now - shown < 500 || n === 0) return;
      shown = now;
      if (ext) { pollGpu(); if (gpuN) { gpuMs = gpuSum / gpuN; gpuSum = gpuN = 0; } }
      const ft = sumFrame / n, busy = sumBusy / n, i = renderer.info;
      let s = `${(1000 / ft).toFixed(0)} FPS  ${ft.toFixed(1)} ms (max ${maxFrame.toFixed(0)})\n`;
      s += `CPU ${Math.min(100, busy / ft * 100).toFixed(0)}%  ${busy.toFixed(1)} ms\n`;
      s += gpuMs === null ? 'GPU n/a\n' : `GPU ${Math.min(100, gpuMs / ft * 100).toFixed(0)}%  ${gpuMs.toFixed(1)} ms\n`;
      const pm = performance.memory;
      if (pm) s += `Heap ${(pm.usedJSHeapSize / MB).toFixed(0)} / ${(pm.jsHeapSizeLimit / MB).toFixed(0)} MB\n`;
      s += `Geo ${i.memory.geometries}  Tex ${i.memory.textures}\n`;
      s += `Draws ${i.render.calls}  Tris ${(i.render.triangles / 1000).toFixed(0)}k`;
      el.textContent = s;
      n = 0; sumFrame = sumBusy = maxFrame = 0;
    },
  };
}
