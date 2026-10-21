import * as THREE from 'three';

// Post-processing: HDR scene target (MSAA) -> bloom (thresholded, 5-level blur chain) -> ACES tone map, vignette, grade, light grain -> screen.
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
const BRIGHT = `uniform sampler2D tex; uniform float thr; varying vec2 vUv; void main(){ vec3 c = texture2D(tex, vUv).rgb; if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.0); c = min(c, vec3(12.0)); float l = max(c.r, max(c.g, c.b)); float k = smoothstep(thr, thr + 0.9, l); gl_FragColor = vec4(c * k, 1.0); }`;
const BLUR = `uniform sampler2D tex; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 s = texture2D(tex, vUv).rgb * 0.2270270270; s += (texture2D(tex, vUv + dir * 1.3846153846).rgb + texture2D(tex, vUv - dir * 1.3846153846).rgb) * 0.3162162162; s += (texture2D(tex, vUv + dir * 3.2307692308).rgb + texture2D(tex, vUv - dir * 3.2307692308).rgb) * 0.0702702703; gl_FragColor = vec4(s, 1.0); }`;
const COMP = `uniform sampler2D scene; uniform sampler2D b0; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3; uniform sampler2D b4; uniform float bloom; uniform float exposure; uniform float time; uniform vec2 res; varying vec2 vUv;
vec3 aces(vec3 x){ const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 c = texture2D(scene, vUv).rgb; if (!(c.r == c.r) || !(c.g == c.g) || !(c.b == c.b)) c = vec3(0.0);
  vec3 bl = texture2D(b0, vUv).rgb * 0.45 + texture2D(b1, vUv).rgb * 0.32 + texture2D(b2, vUv).rgb * 0.24 + texture2D(b3, vUv).rgb * 0.18 + texture2D(b4, vUv).rgb * 0.12;
  c += bl * bloom; c *= exposure; c = aces(c);
  // gentle grade: contrast + saturation + warm highlights / cool shadows
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.12); c = (c - 0.5) * 1.05 + 0.5; c += vec3(0.012, 0.004, -0.010) * (l - 0.35);
  vec2 q = vUv - 0.5; q.x *= res.x / res.y; float v = smoothstep(1.05, 0.25, length(q)); c *= mix(0.72, 1.0, v);
  c += (hash(vUv * res + time) - 0.5) * 0.012;
  gl_FragColor = vec4(pow(max(c, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

export class Post {
  constructor(renderer, { bloom = 0.35, exposure = 1.0 } = {}) {
    this.r = renderer; this.bloom = bloom; this.exposure = exposure; this.enabled = true;
    this.quad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)).setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2)), null); this.quad.frustumCulled = false;
    this.cam = new THREE.Camera(); this.sc = new THREE.Scene(); this.sc.add(this.quad);
    this.matBright = mk(BRIGHT, { tex: { value: null }, thr: { value: 1.1 } }); this.matBlur = mk(BLUR, { tex: { value: null }, dir: { value: new THREE.Vector2() } });
    this.matComp = mk(COMP, { scene: { value: null }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, b4: { value: null }, bloom: { value: bloom }, exposure: { value: exposure }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } });
    this.levels = []; this.rt = null; this.size = new THREE.Vector2(0, 0);
  }
  _alloc(w, h) {
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rt?.dispose(); this.levels.forEach((l) => { l.a.dispose(); l.b.dispose(); });
    this.rt = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true, samples: 4 });
    this.levels = []; let lw = w, lh = h; for (let i = 0; i < 5; i++) { lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1); this.levels.push({ w: lw, h: lh, a: new THREE.WebGLRenderTarget(lw, lh, opts), b: new THREE.WebGLRenderTarget(lw, lh, opts) }); }
    this.size.set(w, h);
  }
  _pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.sc, this.cam); }
  render(scene, camera) {
    const r = this.r, sz = r.getDrawingBufferSize(new THREE.Vector2()); if (sz.x !== this.size.x || sz.y !== this.size.y) this._alloc(sz.x, sz.y);
    const prevTM = r.toneMapping, prevAuto = r.autoClear; r.toneMapping = THREE.NoToneMapping; r.autoClear = true;
    r.setRenderTarget(this.rt); r.clear(); r.render(scene, camera);
    // bright pass into level 0, then blur chain (each level downsamples the previous blurred result)
    this.matBright.uniforms.tex.value = this.rt.texture; this._pass(this.matBright, this.levels[0].a);
    for (let i = 0; i < this.levels.length; i++) {
      const L = this.levels[i]; if (i > 0) { this.matBright.uniforms.thr.value = -1; this.matBright.uniforms.tex.value = this.levels[i - 1].b.texture; this._pass(this.matBright, L.a); this.matBright.uniforms.thr.value = 1.1; }
      this.matBlur.uniforms.tex.value = L.a.texture; this.matBlur.uniforms.dir.value.set(1 / L.w, 0); this._pass(this.matBlur, L.b);
      this.matBlur.uniforms.tex.value = L.b.texture; this.matBlur.uniforms.dir.value.set(0, 1 / L.h); this._pass(this.matBlur, L.a); // result back in .a; copy semantics: keep .b as source for next downsample
      const t = L.a; L.a = L.b; L.b = t; // after swap: .b holds the final blurred image
    }
    const u = this.matComp.uniforms; u.scene.value = this.rt.texture; this.levels.forEach((L, i) => (u['b' + i].value = L.b.texture)); u.bloom.value = this.bloom; u.exposure.value = this.exposure; u.time.value = (performance.now() % 1000) / 1000; u.res.value.copy(this.size);
    this._pass(this.matComp, null);
    r.toneMapping = prevTM; r.autoClear = prevAuto; r.setRenderTarget(null);
  }
}
