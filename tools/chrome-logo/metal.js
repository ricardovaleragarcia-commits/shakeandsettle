/* Chrome Logo Studio.
   A logo becomes a solid metal piece: SVG paths are extruded as real vectors (the solid and its bevel are built from the distance to the outline); PNG, JPG and typed text are
   traced into contours first (d3-contour) and extruded the same way.
   The metal is a custom shader: the reflection of the view on each normal looks up an analytic photo studio
   (softboxes, a fill gradient, a rim light and a moving shine bar), with roughness as a small cone of reflections and
   brushing as fine lines in the normals. Lights, piece and camera only move in whole cycles of the loop (seamless). */
(function () {
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const $ = s => document.querySelector(s);
  const cv = $('#cv'), art = $('#art');
  // anything that goes wrong is shown on the preview, with its cause (so it can be fixed, not guessed)
  function showErr(msg) {
    let d = document.getElementById('errBox');
    if (!d) { d = document.createElement('div'); d.id = 'errBox'; d.style.cssText = 'position:absolute;left:10px;right:10px;bottom:10px;padding:8px 10px;background:rgba(0,0,0,.82);color:#fff;font:700 12px/1.35 system-ui,sans-serif;z-index:9;white-space:pre-wrap'; art.appendChild(d); }
    if (d.textContent.indexOf(msg) < 0) d.textContent = (d.textContent ? d.textContent + '\n' : '') + msg;
  }
  addEventListener('error', e => showErr('Error: ' + (e.message || e.error) + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')));
  addEventListener('unhandledrejection', e => showErr('Error: ' + (e.reason && e.reason.message || e.reason)));
  const ce = console.error.bind(console);
  console.error = (...a) => { ce(...a); const t = a.map(String).join(' '); if (/THREE\.WebGL(Program|Shader)/.test(t)) showErr('The metal shader did not compile on this device: ' + t.slice(0, 300)); };
  if (!window.THREE || !THREE.SVGLoader || !window.d3 || !d3.contours) showErr('A library did not load (' + [!window.THREE && 'three.js', window.THREE && !THREE.SVGLoader && 'SVGLoader', (!window.d3 || !d3.contours) && 'd3-contour'].filter(Boolean).join(', ') + '). Reload the page.');

  const DEF = {
    src: 'file', trace: 'auto', text: 'S&S', font: 'Helvetica Neue', size: 62, depth: 10, bevel: 8, bseg: 12,
    metal: 'chrome', tint: '#d4d6da', rough: 3, brush: 0, brushDir: 0,
    rig: 'studio', lights: null, expo: 100, fill: 22, lAz: 0, lEl: 0, lW: 100, lCol: '#ffffff', lMove: 'fixed', lAmp: 45, lLaps: 1,
    shine: 1, shineI: 160, shineW: 12, shineD: 60, pulse: 0, pulseN: 1,
    move: 'swing', amp: 22, laps: 1, dir: 1, lens: 35, yaw: -14, pitch: 8, T: 6,
    bg: '#000000', glowC: '#3a3a3a', glow: 0,
    ratio: '3:4', quality: 1080, cw: 1080, ch: 1350, playing: true, tm: 0
  };
  const c = Object.assign({}, DEF);

  const METALS = {
    chrome: { tint: '#d4d6da', rough: 3, brush: 0 },
    silver: { tint: '#f1ede6', rough: 12, brush: 0 },
    inox: { tint: '#c9ccd1', rough: 16, brush: 70, brushDir: 0 },
    satin: { tint: '#babec4', rough: 34, brush: 20, brushDir: 0 },
    gold: { tint: '#f4c66c', rough: 7, brush: 0 },
    copper: { tint: '#efa283', rough: 11, brush: 0 },
    black: { tint: '#3b3d42', rough: 4, brush: 0 },
    titanium: { tint: '#b7b0a6', rough: 26, brush: 35, brushDir: 2 }
  };
  // light rigs: azimuth (0 = behind the camera), elevation, half width, half height (degrees), intensity
  // + softness of its edges (degrees)
  const RIGS = {
    studio: [[38, 16, 8, 40, 5, 2.5], [-52, 8, 24, 28, 1.6, 12], [0, 62, 80, 12, 2.2, 10], [180, 10, 30, 30, 3, 6], [0, 26, 70, 20, 1.0, 26]],
    strips: [[22, 0, 3, 62, 6, 1.2], [-22, 0, 3, 62, 6, 1.2], [68, 0, 3, 62, 4, 1.2], [-68, 0, 3, 62, 4, 1.2], [0, 30, 60, 14, 0.5, 22]],
    soft: [[0, 22, 50, 30, 2.2, 22], [115, 0, 40, 40, 1.2, 20], [-115, 0, 40, 40, 1.2, 20], [180, 30, 50, 30, 1, 20], [0, -40, 80, 14, 0.35, 25]],
    drama: [[62, 28, 5, 24, 8, 1.5], [-150, 4, 9, 42, 4.5, 3], [0, 80, 20, 6, 1, 6], [-20, 18, 30, 16, 0.35, 22], [0, 0, 0, 0, 0, 1]]
  };

  // the lights in use: a rig, or your own version of it (moved, resized or dimmed on the light map)
  const lights = () => (Array.isArray(c.lights) && c.lights.length === 5 ? c.lights : RIGS[c.rig] || RIGS.studio);
  const lightNow = { env: 0, shine: null };   // where the lights are in the frame being shown (for the light map)

  /* ---------- three.js ---------- */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false }); }
  catch (e) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:12px;right:12px;bottom:12px;padding:8px;background:rgba(0,0,0,.75);color:#fff;font:700 12px/1.3 system-ui,sans-serif;z-index:9';
    d.textContent = 'This tool needs WebGL. Try Chrome, Edge, Firefox or Safari.'; document.querySelector('.stage').appendChild(d); throw e;
  }
  renderer.setPixelRatio(1); renderer.autoClear = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 0.75, 0.01, 100);
  const view = new THREE.Group(), spin = new THREE.Group(), mirror = new THREE.Group(), mspin = new THREE.Group();
  scene.add(view); view.add(spin); scene.add(mirror); mirror.add(mspin);

  // background: flat color + an optional soft glow behind the piece
  const bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uBg: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uA: { value: 0 }, uAsp: { value: 0.75 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `precision highp float; uniform vec3 uBg, uGlow; uniform float uA, uAsp; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec2 p = (vUv - 0.5) * vec2(uAsp, 1.0); float g = exp(-dot(p, p) * 5.5);
        gl_FragColor = vec4(mix(uBg, uGlow, g * uA) + (h(gl_FragCoord.xy) - 0.5) / 255.0, 1.0); }`
  });
  bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));

  const VS = `
varying vec3 vN; varying vec3 vW; varying vec3 vP; varying vec3 vO; varying vec3 vON;
uniform float uInvS;
void main(){
  vP = position * uInvS; vO = position; vON = normal;
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
  const FS = `
precision highp float;
#define PI 3.14159265
uniform vec4 uL[6]; uniform float uI[6]; uniform float uS[6]; uniform vec3 uLc; uniform float uFill;
uniform float uRough; uniform float uBrush; uniform float uBDir; uniform vec3 uF0; uniform float uExpo; uniform mat3 uRot;
uniform float uMirror; uniform float uFloorY; uniform float uFloorA; uniform float uFade;
uniform sampler2D uSdf; uniform vec2 uSdfO; uniform vec2 uSdfSz; uniform vec2 uTexel; uniform float uBev; uniform float uRound; uniform float uSlope;
varying vec3 vN; varying vec3 vW; varying vec3 vP; varying vec3 vO; varying vec3 vON;
float hash(float n){ return fract(sin(n) * 43758.5453123); }
float noise(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
vec3 env(vec3 d, float e){
  float el = asin(clamp(d.y, -1.0, 1.0)), az = atan(d.x, d.z);
  float up = smoothstep(-0.25, 0.95, d.y);
  vec3 col = vec3(uFill * (0.06 + 0.94 * up * up)) * 0.9 + vec3(uFill * 0.35 * exp(-el * el * 40.0));   // studio gradient + soft horizon
  for (int i = 0; i < 6; i++) {
    vec4 L = uL[i]; if (uI[i] <= 0.0) continue;
    float ee = e + uS[i];
    float da = mod(az - L.x + PI, 2.0 * PI) - PI;
    float x = da * cos(el), y = el - L.y;
    float m = (1.0 - smoothstep(L.z - ee, L.z + ee, abs(x))) * (1.0 - smoothstep(L.w - ee, L.w + ee, abs(y)));
    col += uLc * uI[i] * m;
  }
  return col;
}
vec3 aces(vec3 x){ return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 N = normalize(vN);
  // Bevel: the solid itself has square edges (so its outline is always exactly the logo); near the edge of the faces
  // the normal leans outward following the distance to the outline, like a rounded (or chamfered) edge.
  if (uBev > 0.5 && abs(vON.z) > 0.5) {
    vec2 uv = (vO.xy - uSdfO) / uSdfSz;
    float t = texture2D(uSdf, uv).r;
    if (t < 0.999) {
      vec2 e = uTexel * 2.0;   // Sobel-like slope: 8 samples, so the bevel's reflections stay smooth
      float a1 = texture2D(uSdf, uv + vec2(-e.x, e.y)).r, a2 = texture2D(uSdf, uv + vec2(0.0, e.y)).r, a3 = texture2D(uSdf, uv + vec2(e.x, e.y)).r;
      float b1 = texture2D(uSdf, uv + vec2(-e.x, 0.0)).r, b3 = texture2D(uSdf, uv + vec2(e.x, 0.0)).r;
      float c1 = texture2D(uSdf, uv + vec2(-e.x, -e.y)).r, c2 = texture2D(uSdf, uv + vec2(0.0, -e.y)).r, c3 = texture2D(uSdf, uv + vec2(e.x, -e.y)).r;
      float gx = (a3 + 2.0 * b3 + c3) - (a1 + 2.0 * b1 + c1), gy = (a1 + 2.0 * a2 + a3) - (c1 + 2.0 * c2 + c3);
      vec2 g = vec2(gx / uSdfSz.x, gy / uSdfSz.y); float gl = length(g);
      if (gl > 1e-7) {
        float s = clamp(1.0 - t, 0.0, 1.0);                                        // 1 at the edge, 0 where the face is flat
        float sl = uSlope * mix(1.0, s / sqrt(max(1.0 - s * s, 1e-4)), uRound);   // slope of the profile: chamfer .. round
        float sn = sl / sqrt(1.0 + sl * sl);
        vec3 no = normalize(vec3(-g / gl * sn, sign(vON.z) * sqrt(max(0.0, 1.0 - sn * sn))));
        N = normalize(uRot * no); if (uMirror > 0.5) N.y = -N.y;
      }
    }
  }
  vec3 V = normalize(cameraPosition - vW);
  // brushed lines: fine noise across the lines bends the normal; the highlights stretch across them
  vec3 perp; float lc, al;
  if (uBDir < 0.5) { perp = vec3(0.0, 1.0, 0.0); lc = vP.y; al = vP.x; }
  else if (uBDir < 1.5) { perp = vec3(1.0, 0.0, 0.0); lc = vP.x; al = vP.y; }
  else { float r = length(vP.xy) + 1e-4; perp = vec3(vP.xy / r, 0.0); lc = r; al = atan(vP.y, vP.x) * 0.3; }
  vec3 pW = normalize(uRot * perp);
  if (uBrush > 0.0) {
    float n = noise(lc * 1400.0 + noise(al * 6.0) * 4.0) * 0.6 + noise(lc * 380.0 + al * 1.5) * 0.4;
    N = normalize(N + pW * (n - 0.5) * uBrush * 0.22);
  }
  vec3 R = reflect(-V, N);
  float e = 0.004 + uRough * 0.32;
  vec3 col;
  if (uRough < 0.004 && uBrush < 0.01) col = env(R, e);
  else {
    vec3 T1 = pW - R * dot(pW, R); if (dot(T1, T1) < 1e-5) T1 = cross(R, vec3(0.0, 1.0, 0.0)); T1 = normalize(T1);
    vec3 T2 = cross(R, T1);
    float s1 = uRough * 0.55 + uBrush * 0.22, s2 = uRough * 0.55 * (1.0 - 0.6 * uBrush);
    col = env(R, e) * 0.2;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * PI * 0.25 + 0.3;
      col += env(normalize(R + T1 * cos(a) * s1 + T2 * sin(a) * s2), e) * 0.1;
    }
  }
  float nv = clamp(dot(N, V), 0.0, 1.0);
  vec3 F = uF0 + (1.0 - uF0) * pow(1.0 - nv, 5.0);
  vec3 c = pow(aces(col * F * uExpo), vec3(1.0 / 2.2));
  float a = 1.0;
  if (uMirror > 0.5) { float dy = uFloorY - vW.y; a = uFloorA * (1.0 - smoothstep(0.0, uFade, dy)); if (a < 0.003) discard; }
  gl_FragColor = vec4(c, a);
}`;
  const U = {
    uL: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4()) }, uI: { value: [0, 0, 0, 0, 0, 0] }, uS: { value: [0, 0, 0, 0, 0, 0] }, uLc: { value: new THREE.Color(1, 1, 1) },
    uFill: { value: 0.2 }, uRough: { value: 0 }, uBrush: { value: 0 }, uBDir: { value: 0 }, uF0: { value: new THREE.Color() }, uExpo: { value: 1 },
    uRot: { value: new THREE.Matrix3() }, uInvS: { value: 1 }, uSdf: { value: null }, uSdfO: { value: new THREE.Vector2() }, uSdfSz: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2(1e-3, 1e-3) }, uBev: { value: 0 }, uRound: { value: 1 }, uSlope: { value: 1 }, uMirror: { value: 0 }, uFloorY: { value: 0 }, uFloorA: { value: 0 }, uFade: { value: 0.3 }
  };
  const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: U, side: THREE.DoubleSide });
  const mU = Object.assign({}, U, { uMirror: { value: 1 } });   // the reflection shares every uniform but this one
  const mMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: mU, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  let mesh = null, mMesh = null, geoInfo = null;

  /* ---------- logo -> 2D shapes ---------- */
  let subject = { kind: 'svg', text: null, url: null };   // what is loaded (kept between visits)
  let shapes2d = null, shapeKey = '';
  const status = t => { $('#status').textContent = t; };

  function rdp(pts, eps) {   // Ramer–Douglas–Peucker
    if (pts.length < 4) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let md = 0, mi = -1;
      const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
      for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L; if (d > md) { md = d; mi = i; } }
      if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((p, i) => keep[i]);
  }
  const area = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };

  // a canvas (logo pixels) -> contours -> THREE.Shapes, y up
  function traceCanvas(src, mode) {
    const LONG = 1100, k = LONG / Math.max(src.width, src.height), w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k));
    const pad = 4, cc = document.createElement('canvas'); cc.width = w + pad * 2; cc.height = h + pad * 2;
    const x = cc.getContext('2d', { willReadFrequently: true });
    x.filter = 'blur(0.8px)'; x.drawImage(src, pad, pad, w, h); x.filter = 'none';
    const W = cc.width, H = cc.height, d = x.getImageData(0, 0, W, H).data, v = new Float64Array(W * H);
    let opaque = true;   // judged on the image itself, not on the transparent margin added around it
    for (let yy = pad + 4; yy < H - pad - 4 && opaque; yy += 3) for (let xx = pad + 4; xx < W - pad - 4; xx += 3) if (d[(yy * W + xx) * 4 + 3] < 250) { opaque = false; break; }
    if (!opaque && mode === 'auto') { for (let i = 0; i < W * H; i++) v[i] = d[i * 4 + 3] / 255; }
    else {
      // no transparency: the logo is whatever contrasts with the border (or what you pick: dark / light)
      let bl = 0, n = 0; const lum = i => (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255 * (d[i * 4 + 3] / 255) + (1 - d[i * 4 + 3] / 255);
      for (let i = 0; i < W; i++) { bl += lum(i + (pad + 4) * W) + lum(i + (H - pad - 5) * W); n += 2; }
      const dark = mode === 'dark' || (mode === 'auto' && bl / n > 0.5);
      for (let i = 0; i < W * H; i++) { const L = lum(i); v[i] = (dark ? 1 - L : L) * (d[i * 4 + 3] / 255); }
    }
    const mp = d3.contours().size([W, H]).smooth(true).thresholds([0.5])(v)[0];
    const minA = W * H * 0.00003, out = [];
    mp.coordinates.forEach(poly => {
      const ring = r => rdp(r.slice(0, -1), 0.45).map(p => new THREE.Vector2(p[0], H - p[1]));
      if (Math.abs(area(poly[0])) < minA || poly[0].length < 5) return;
      const s = new THREE.Shape(ring(poly[0]));
      poly.slice(1).forEach(hl => { if (Math.abs(area(hl)) >= minA && hl.length >= 5) s.holes.push(new THREE.Path(ring(hl))); });
      out.push(s);
    });
    return out;
  }
  async function svgPrep(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), s = doc.documentElement;
    if (!s || s.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('not an SVG');
    doc.querySelectorAll('script, foreignObject').forEach(n => n.remove());
    return { doc, s };
  }
  let forceTrace = false;   // set when this SVG's vectors could not be made into a solid
  async function shapesFromSvg(text, trace) {
    const { doc, s } = await svgPrep(text);
    // vector first: every filled path, flipped so y goes up
    if (!trace) try {
      const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('transform', 'scale(1,-1)');
      while (s.firstChild) g.appendChild(s.firstChild); s.appendChild(g);
      const data = new THREE.SVGLoader().parse(new XMLSerializer().serializeToString(s)), out = [];
      let strokes = 0;
      data.paths.forEach(p => {
        const st = p.userData && p.userData.style || {};
        if (st.fill && st.fill !== 'none' && st.fill !== 'transparent' && +(st.fillOpacity ?? 1) > 0) THREE.SVGLoader.createShapes(p).forEach(sh => out.push(sh));
        else if (st.stroke && st.stroke !== 'none') strokes++;
      });
      if (out.length && !strokes) return { shapes: out, vector: true };
    } catch (e) { console.warn('SVG vector parse failed, tracing instead', e); }
    // strokes, text or anything unusual: draw it big and trace it
    const { s: s2 } = await svgPrep(text);
    const vb = (s2.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const w = vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(s2.getAttribute('width')) || 1000, h = vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(s2.getAttribute('height')) || 1000;
    const k = 1800 / Math.max(w, h); s2.setAttribute('width', w * k); s2.setAttribute('height', h * k);
    if (!s2.getAttribute('xmlns')) s2.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = await decode(URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(s2)], { type: 'image/svg+xml' })));
    const cc = document.createElement('canvas'); cc.width = img.naturalWidth || w * k; cc.height = img.naturalHeight || h * k; cc.getContext('2d').drawImage(img, 0, 0, cc.width, cc.height);
    return { shapes: traceCanvas(cc, 'auto'), vector: false };
  }
  async function decode(url) { const el = new Image(); el.src = url; await (el.decode ? el.decode() : new Promise((ok, no) => { el.onload = ok; el.onerror = no; })); return el; }
  function textCanvas() {
    const lines = String(c.text || ' ').split('\n'), fs = 400, cc = document.createElement('canvas'), x = cc.getContext('2d');
    const font = `900 ${fs}px "${c.font}", "Helvetica Neue", Helvetica, Arial, sans-serif`;
    x.font = font; const wd = Math.max(1, ...lines.map(l => x.measureText(l).width));
    cc.width = Math.ceil(wd + fs * 0.4); cc.height = Math.ceil(lines.length * fs * 1.0 + fs * 0.5);
    x.font = font; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => x.fillText(l, cc.width / 2, fs * 0.75 + i * fs * 1.0));
    return cc;
  }

  async function buildShapes() {
    const key = c.src + '|' + (c.src === 'text' ? c.text + c.font : (subject.text || subject.url || '').length + subject.kind + c.trace + forceTrace + (subject.text || subject.url || '').slice(-64));
    if (key === shapeKey && shapes2d) return;
    shapeKey = key;
    try {
      if (c.src === 'text') shapes2d = traceCanvas(textCanvas(), 'auto');
      else if (subject.kind === 'svg' && subject.text) shapes2d = (await shapesFromSvg(subject.text, forceTrace)).shapes;
      else if (subject.url) { const im = await decode(subject.url), cc = document.createElement('canvas'); cc.width = im.naturalWidth; cc.height = im.naturalHeight; cc.getContext('2d').drawImage(im, 0, 0); shapes2d = traceCanvas(cc, c.trace); }
      if (!shapes2d || !shapes2d.length) throw new Error('no shapes');
      status('');
    } catch (e) { console.warn(e); status('Could not find a shape in that file. Try an SVG, or a PNG with a transparent background.'); }
    geoKey = ''; buildGeo();
  }

  /* ---------- 2D shapes -> beveled solid ---------- */
  let geoKey = '';
  function buildGeo() {
    if (!shapes2d || !shapes2d.length) return;
    const key = [shapeKey, c.depth, c.bevel, c.bseg].join('|'); if (key === geoKey) return; geoKey = key;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shapes2d.forEach(s => s.getPoints(8).forEach(p => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }));
    if (![x0, y0, x1, y1].every(isFinite)) { status('This logo could not be made solid; try an SVG or a PNG with a transparent background.'); return; }
    const S = Math.max(x1 - x0, y1 - y0) || 1, cx = (x0 + x1) / 2 + (subject.nudge || 0) * S, cy = (y0 + y1) / 2;   // nudge: optical centring of the default logo (its right side is heavier)
    if (!sdf || sdf.key !== shapeKey) buildSdf(x0, y0, x1, y1, S, cx, cy);
    const g = solid(S, cx, cy);
    if (!g) { status('This logo could not be made solid; try an SVG or a PNG with a transparent background.'); return; }
    if (mesh) { spin.remove(mesh); mspin.remove(mMesh); mesh.geometry.dispose(); }
    mesh = new THREE.Mesh(g, mat); mMesh = new THREE.Mesh(g, mMat);
    spin.add(mesh); mspin.add(mMesh);
    geoInfo = { S, w: (x1 - x0) / S, h: (y1 - y0) / S, box: g.boundingBox.clone() };
    U.uInvS.value = 1 / S;
    bevelTex();
  }

  /* ---------- the solid, built from the distance to the outline ----------
     The logo is drawn at ~1024 px and every pixel gets its exact signed distance to the outline (Felzenszwalb's distance
     transform, lightly smoothed). The solid is built from that field: its outline is where the distance is 0 (marching
     squares, sub-pixel), and each point of the faces is raised by the bevel profile of its distance to the edge.
     Nothing is pushed or offset, so nothing can cross itself: a stroke thinner than the bevel simply becomes a round tube. */
  let sdf = null;
  function edt1(f, n, d, v, z) {   // 1D squared distance transform
    let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (let q = 1; q < n; q++) {
      let s2 = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s2 <= z[k]) { k--; s2 = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s2; z[k + 1] = 1e20;
    }
    k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  }
  function edt2(g, w, h, f, d, v, z) {
    for (let X = 0; X < w; X++) { for (let Y = 0; Y < h; Y++) f[Y] = g[Y * w + X]; edt1(f, h, d, v, z); for (let Y = 0; Y < h; Y++) g[Y * w + X] = d[Y]; }
    for (let Y = 0; Y < h; Y++) { for (let X = 0; X < w; X++) f[X] = g[Y * w + X]; edt1(f, w, d, v, z); for (let X = 0; X < w; X++) g[Y * w + X] = d[X]; }
  }
  function buildSdf(x0, y0, x1, y1, S, cx, cy) {
    const k = 1024 / S, P = 16, w = Math.ceil((x1 - x0) * k) + 2 * P, h = Math.ceil((y1 - y0) * k) + 2 * P;
    const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
    const x = cc.getContext('2d', { willReadFrequently: true });
    x.setTransform(k, 0, 0, -k, P - x0 * k, P + y1 * k); x.fillStyle = '#fff';
    shapes2d.forEach(sh => {
      const ex = sh.extractPoints(24); x.beginPath();
      [ex.shape].concat(ex.holes).forEach(r => { r.forEach((p, i) => i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)); x.closePath(); });
      x.fill('evenodd');
    });
    const a = x.getImageData(0, 0, w, h).data, n = Math.max(w, h), INF = 1e20, N = w * h;
    const gi = new Float64Array(N), go = new Float64Array(N), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let i = 0; i < N; i++) { const ins = a[i * 4 + 3] > 127; gi[i] = ins ? INF : 0; go[i] = ins ? 0 : INF; }
    edt2(gi, w, h, f, d, v, z); edt2(go, w, h, f, d, v, z);
    const sd = new Float32Array(N);   // + inside, − outside, in px
    for (let i = 0; i < N; i++) sd[i] = gi[i] > 0 ? Math.sqrt(gi[i]) - 0.5 : -(Math.sqrt(go[i]) - 0.5);
    const tmp = new Float32Array(N), R = 2;   // smooth: the reflections slide along the bevel without stair steps
    for (let pass = 0; pass < 3; pass++) {
      for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) { let s2 = 0, c2 = 0; for (let o = -R; o <= R; o++) { const xx = X + o; if (xx >= 0 && xx < w) { s2 += sd[Y * w + xx]; c2++; } } tmp[Y * w + X] = s2 / c2; }
      for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) { let s2 = 0, c2 = 0; for (let o = -R; o <= R; o++) { const yy = Y + o; if (yy >= 0 && yy < h) { s2 += tmp[yy * w + X]; c2++; } } sd[Y * w + X] = s2 / c2; }
    }
    if (sdf && sdf.tex) sdf.tex.dispose();
    const data = new Uint8Array(N * 4), tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.flipY = false;
    sdf = { key: shapeKey, w, h, k, P, x0, y1, cx, cy, sd, data, tex };
    U.uSdf.value = tex; U.uTexel.value.set(1 / w, 1 / h);
    // texture row 0 is the bottom of the logo (y up); the canvas row 0 is its top
    U.uSdfO.value.set(x0 - P / k - cx, y1 + P / k - h / k - cy); U.uSdfSz.value.set(w / k, h / k);
  }
  // bevel measures shared by the solid and the shader
  function bevelDims(S) {
    const bpx = c.bevel / 100 * 0.25 * 1024, b = bpx / (1024 / S), T = Math.max(0.004, c.depth / 100) * S * 0.5;
    const bh = Math.min(b, T / 2), r = (c.bseg - 1) / 11;
    return { bpx, b, bh, zc: T / 2 - bh, r };
  }
  function solid(S) {
    const { sd, w, h, k, P, x0, y1, cx, cy } = sdf, { bpx, bh, zc, r } = bevelDims(S);
    const G = 380, st = Math.max(w, h) / G, nx = Math.floor((w - 1) / st), ny = Math.floor((h - 1) / st);
    const at = (px, py) => {   // bilinear sample, pixel-centre coordinates
      const X = Math.min(w - 2, Math.max(0, Math.floor(px))), Y = Math.min(h - 2, Math.max(0, Math.floor(py))), fx = px - X, fy = py - Y;
      const i = Y * w + X; return (sd[i] * (1 - fx) + sd[i + 1] * fx) * (1 - fy) + (sd[i + w] * (1 - fx) + sd[i + w + 1] * fx) * fy;
    };
    const zOf = s => { if (bpx <= 0.5) return zc + bh; const t = Math.min(1, Math.max(0, s / bpx)); return zc + bh * (t + (Math.sqrt(1 - (1 - t) * (1 - t)) - t) * r); };
    const ox = px => x0 + (px + 0.5 - P) / k - cx, oy = py => y1 - (py + 0.5 - P) / k - cy;
    const pos = [], nor = [];
    const tri = (a, b2, c2, nz) => { for (const q of [a, b2, c2]) { pos.push(q[0], q[1], q[2] * nz); nor.push(0, 0, nz); } };
    const val = new Float32Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) val[j * (nx + 1) + i] = at(i * st, j * st);
    const V = (i, j) => val[j * (nx + 1) + i];
    const P3 = (px, py, s) => [ox(px), oy(py), zOf(s)];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const cs = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], vs = cs.map(q => V(q[0], q[1])), ins = vs.map(s => s > 0);
      const cnt = ins.filter(Boolean).length; if (!cnt) continue;
      const corner = q => P3(cs[q][0] * st, cs[q][1] * st, vs[q]);
      const cross = e => { const q = (e + 1) % 4, t = vs[e] / (vs[e] - vs[q]); return [ox((cs[e][0] + (cs[q][0] - cs[e][0]) * t) * st), oy((cs[e][1] + (cs[q][1] - cs[e][1]) * t) * st), zc]; };
      const polys = [], segs = [];
      const saddle = cnt === 2 && ins[0] === ins[2];
      if (saddle) {
        const ctr = (vs[0] + vs[1] + vs[2] + vs[3]) / 4 > 0, E = [0, 1, 2, 3].map(cross);
        if (ctr) { const pl = []; for (let q = 0; q < 4; q++) { if (ins[q]) pl.push(corner(q)); pl.push(E[q]); } polys.push(pl); }
        else for (let q = 0; q < 4; q++) if (ins[q]) polys.push([E[(q + 3) % 4], corner(q), E[q]]);
        if (ctr === ins[0]) segs.push([E[0], E[1]], [E[2], E[3]]); else segs.push([E[3], E[0]], [E[1], E[2]]);
      } else {
        const pl = [], ce = [];
        for (let q = 0; q < 4; q++) { if (ins[q]) pl.push(corner(q)); if (ins[q] !== ins[(q + 1) % 4]) { const e = cross(q); pl.push(e); ce.push(e); } }
        polys.push(pl); if (ce.length === 2) segs.push(ce);
      }
      for (const pl of polys) for (let q = 1; q + 1 < pl.length; q++) { tri(pl[0], pl[q], pl[q + 1], 1); tri(pl[0], pl[q + 1], pl[q], -1); }
      if (zc > 1e-6) for (const [A2, B2] of segs) {   // the straight side wall between the two bevels
        const mx = (A2[0] + B2[0]) / 2, my = (A2[1] + B2[1]) / 2, ex = 1;
        const gpx = (mx + cx - x0) * k + P - 0.5, gpy = (y1 - (my + cy)) * k + P - 0.5;
        let gx = at(gpx + ex, gpy) - at(gpx - ex, gpy), gy = -(at(gpx, gpy + ex) - at(gpx, gpy - ex)); const L = Math.hypot(gx, gy) || 1; gx = -gx / L; gy = -gy / L;
        const a1 = [A2[0], A2[1], zc], b1 = [B2[0], B2[1], zc], a0 = [A2[0], A2[1], -zc], b0 = [B2[0], B2[1], -zc];
        for (const q of [a1, b1, b0, a1, b0, a0]) { pos.push(q[0], q[1], q[2]); nor.push(gx, gy, 0); }
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  function bevelTex() {   // the bevel profile, for the shader's normals
    if (!sdf || !geoInfo) return;
    const { bpx, b, bh, r } = bevelDims(geoInfo.S), { w, h, sd, data } = sdf;
    U.uBev.value = bpx > 0.5 ? 1 : 0; U.uRound.value = r; U.uSlope.value = b > 0 ? bh / b : 0;
    if (!U.uBev.value) return;
    for (let Y = 0; Y < h; Y++) { const src = (h - 1 - Y) * w, dst = Y * w; for (let X = 0; X < w; X++) { const t = Math.max(0, Math.min(255, Math.round(sd[src + X] / bpx * 255))); const o = (dst + X) * 4; data[o] = data[o + 1] = data[o + 2] = t; data[o + 3] = 255; } }
    sdf.tex.needsUpdate = true;
  }

  /* ---------- size ---------- */
  let W = 0, H = 0, A = 0.75;
  const ev = x => 2 * Math.round(x / 2);
  function geometry() {
    if (c.ratio === 'custom') { const cl = (v, d) => Math.min(4096, Math.max(64, ev(+v || d))); return { w: cl(c.cw, 1080), h: cl(c.ch, 1350) }; }
    const r = c.ratio.split(':').map(Number), Q = +c.quality;
    return { w: ev(r[0] >= r[1] ? Q * r[0] / r[1] : Q), h: ev(r[0] >= r[1] ? Q : Q * r[1] / r[0]) };
  }
  function allocate() { const g = geometry(); if (g.w === W && g.h === H) return; W = g.w; H = g.h; A = W / H; renderer.setSize(W, H, false); art.style.setProperty('--ar', A); }

  /* ---------- motion ---------- */
  function bez(x) {   // cubic-bezier(.65, 0, .35, 1)
    const p1 = 0.65, p2 = 0.35; let t = x;
    for (let i = 0; i < 6; i++) { const bx = 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t - x, d = 3 * (1 - t) * (1 - t) * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (1 - p2); if (Math.abs(d) < 1e-6) break; t = Math.min(1, Math.max(0, t - bx / d)); }
    return 3 * (1 - t) * t * t + t * t * t;
  }
  const frac = x => x - Math.floor(x);
  function pose(t) {
    const ph = TAU * t / c.T, a = c.amp * D2R, dir = +c.dir || 1;
    let yaw = c.yaw * D2R, flip = 0, bob = 0, envOff = 0;
    switch (c.move) {
      case 'swing': yaw += a * Math.sin(ph) * dir; break;
      case 'float': yaw += a * Math.sin(ph) * dir; flip = a * 0.35 * Math.sin(2 * ph + 0.6); bob = 0.012 * (c.amp / 22) * Math.sin(ph + 1.2); break;
      case 'turntable': yaw += dir * c.laps * ph; break;
      case 'flip': flip = dir * c.laps * ph; break;
      case 'orbit': { const o = a * Math.sin(ph) * dir; yaw += o; envOff = o; break; }
    }
    return { yaw, flip, bob, envOff };
  }

  /* ---------- one frame ---------- */
  const lin = new THREE.Color(), tmpC = new THREE.Color(), box = new THREE.Box3(), M3 = new THREE.Matrix3(), corner = new THREE.Vector3();
  function srgb2lin(hex, out) { out.set(hex); out.r = Math.pow(out.r, 2.2); out.g = Math.pow(out.g, 2.2); out.b = Math.pow(out.b, 2.2); return out; }
  function placePiece(t, target) {
    const p = pose(t);
    const fit = c.size / 100 * Math.min(1 / Math.max(geoInfo.h, 1e-3), A * 0.96 / Math.max(geoInfo.w, 1e-3)) / geoInfo.S;
    target.view.rotation.set(c.pitch * D2R, 0, 0);
    target.spin.rotation.set(p.flip, p.yaw, 0, 'YXZ');
    target.spin.scale.setScalar(fit);
    target.view.position.set(0, p.bob, 0);
    return p;
  }
  function render(t, transparent) {
    allocate();
    if (!mesh) { renderer.setClearColor(0x000000, transparent ? 0 : 1); renderer.clear(); if (!transparent) renderer.render(bgScene, bgCam); return; }
    const fov = 10 + c.lens / 100 * 105, d = 0.5 / Math.tan(fov / 2 * D2R);
    camera.fov = fov; camera.aspect = A; camera.position.set(0, 0, d); camera.near = d * 0.05; camera.far = d * 10; camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    const p = placePiece(t, { view, spin });
    scene.updateMatrixWorld(true);

    // lights
    const ph = TAU * t / c.T, rig = lights();
    let env = c.lAz + p.envOff / D2R;
    if (c.lMove === 'sweep') env += c.lAmp * Math.sin(c.lLaps * ph);
    else if (c.lMove === 'orbit') env += (+c.dir || 1) * c.lLaps * 360 * (t / c.T);
    for (let i = 0; i < 5; i++) {
      const L = rig[i];
      U.uL.value[i].set((L[0] + env) * D2R, (L[1] + c.lEl) * D2R, Math.min(170, L[2] * c.lW / 100) * D2R, L[3] * D2R); U.uI.value[i] = L[4]; U.uS.value[i] = L[5] * D2R;
    }
    U.uI.value[5] = 0; U.uS.value[5] = 1.5 * D2R; lightNow.env = env; lightNow.shine = null;
    if (c.shine > 0) {   // a tall bright bar crossing the studio, c.shine times per loop
      const s = frac(c.shine * t / c.T), dur = c.shineD / 100;
      if (s < dur) {
        const q = s / dur, x = q + (bez(q) - q) * 0.3;   // close to constant speed, so the bar reads as it crosses the piece
        U.uL.value[5].set((-80 + 160 * x + c.lAz) * D2R, (8 + c.lEl) * D2R, c.shineW * 0.5 * D2R, 75 * D2R);
        U.uI.value[5] = c.shineI / 100 * 9 * Math.pow(Math.sin(Math.PI * x), 0.6);
        lightNow.shine = { az: -80 + 160 * x + c.lAz, el: 8 + c.lEl, w: c.shineW * 0.5, h: 75, I: U.uI.value[5] };
      }
    }
    srgb2lin(c.lCol, U.uLc.value);
    U.uFill.value = c.fill / 100;
    U.uExpo.value = c.expo / 100 * 0.9 * (1 + c.pulse / 100 * Math.sin(c.pulseN * ph));
    U.uRough.value = c.rough / 100; U.uBrush.value = c.brush / 100; U.uBDir.value = +c.brushDir;
    srgb2lin(c.tint, U.uF0.value);
    M3.setFromMatrix4(mesh.matrixWorld); const e = M3.elements;   // rotation only (the scale is uniform)
    const sx = Math.hypot(e[0], e[1], e[2]) || 1; for (let i = 0; i < 9; i++) e[i] /= sx; U.uRot.value.copy(M3);

    mirror.visible = false;

    // draw
    renderer.setClearColor(0x000000, 0); renderer.clear();
    if (!transparent) {
      bgMat.uniforms.uBg.value.set(c.bg); bgMat.uniforms.uGlow.value.set(c.glowC); bgMat.uniforms.uA.value = c.glow / 100; bgMat.uniforms.uAsp.value = A;
      renderer.render(bgScene, bgCam);
    }
    renderer.render(scene, camera);
  }

  /* ---------- interface ---------- */
  const NUM = ['size', 'depth', 'bevel', 'bseg', 'rough', 'brush', 'brushDir', 'expo', 'fill', 'lAz', 'lEl', 'lW', 'lAmp', 'lLaps', 'shine', 'shineI', 'shineW', 'shineD', 'pulse', 'pulseN', 'amp', 'laps', 'dir', 'lens', 'yaw', 'pitch', 'T', 'glow', 'quality'];
  const inputs = [...document.querySelectorAll('[data-k]')];
  const read = el => el.type === 'checkbox' ? el.checked : NUM.includes(el.dataset.k) ? +el.value : el.value;
  function sync() { inputs.forEach(el => { const v = c[el.dataset.k]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }); }
  const show = (id, on) => { const b = document.getElementById(id); const bl = b.classList.contains('block') ? b : b.closest('.block'); if (bl.hidden !== !on) bl.hidden = !on; };
  function syncVis() {
    const txt = c.src === 'text';
    show('fileBlock', !txt); show('textBlock', txt); show('fontBlock', txt);
    show('traceBlock', !txt && subject.kind === 'raster');
    show('lAmp', c.lMove === 'sweep'); show('lLaps', c.lMove !== 'fixed');
    show('shineI', c.shine > 0); show('shineW', c.shine > 0); show('shineD', c.shine > 0);
    show('pulseN', c.pulse > 0);
    show('amp', c.move === 'swing' || c.move === 'float' || c.move === 'orbit'); show('laps', c.move === 'turntable' || c.move === 'flip');
    show('glowC', true);
    if (window.ctBalance) window.ctBalance();
  }
  let rebuild = 0;
  inputs.forEach(el => el.addEventListener('input', () => {
    const k = el.dataset.k; c[k] = read(el);
    if (k === 'text' || k === 'font' || k === 'src' || k === 'trace') { clearTimeout(rebuild); rebuild = setTimeout(() => { if (k === 'font') loadFont().then(buildShapes); else buildShapes(); }, k === 'text' ? 250 : 0); }
    if (k === 'depth' || k === 'bevel' || k === 'bseg') { clearTimeout(rebuild); rebuild = setTimeout(buildGeo, 50); }
    if (['tint', 'rough', 'brush', 'brushDir'].includes(k)) markOn('#metals', null);
    if (['fill', 'lW'].includes(k)) markOn('#rigs', null);
    syncVis(); specs();
  }));
  function markOn(sel, val) { document.querySelectorAll(sel + ' button').forEach(b => b.classList.toggle('on', (b.dataset.m || b.dataset.l) === val)); }
  document.querySelectorAll('#metals button').forEach(b => b.onclick = () => { c.metal = b.dataset.m; Object.assign(c, { brushDir: 0 }, METALS[b.dataset.m]); sync(); markOn('#metals', c.metal); syncVis(); ToolPersist.save(); });
  document.querySelectorAll('#rigs button').forEach(b => b.onclick = () => { c.rig = b.dataset.l; c.lights = null; selL = -1; syncSel(); markOn('#rigs', c.rig); ToolPersist.save(); });

  const FONTS = ['Helvetica Neue', 'Archivo Black', 'Anton', 'Syne', 'Unbounded', 'Space Grotesk', 'Montserrat', 'Playfair Display', 'DM Serif Display', 'Bebas Neue', 'Georgia', 'Times New Roman'];
  const SYS = ['Helvetica Neue', 'Georgia', 'Times New Roman'];
  FONTS.forEach(f => $('#font').add(new Option(f, f)));
  function loadFont() {
    const f = c.font;
    if (!SYS.includes(f)) {
      const id = 'gf-' + f.replace(/ /g, '-');
      if (!document.getElementById(id)) { const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + f.replace(/ /g, '+') + ':wght@400;700;900&display=swap'; document.head.appendChild(l); }
    }
    return document.fonts && document.fonts.load ? Promise.race([document.fonts.load(`900 64px "${f}"`, c.text || 'a'), new Promise(r => setTimeout(r, 2500))]).catch(() => {}) : Promise.resolve();
  }

  const FMT = {
    selW: v => Math.round(v) + '°', selH: v => Math.round(v) + '°', selI: v => (+v).toFixed(1),
    size: v => Math.round(v) + '%', depth: v => Math.round(v) + '%', bevel: v => (+v).toFixed(1) + '%', bseg: v => Math.round((v - 1) / 11 * 100) + '%', rough: v => Math.round(v) + '%', brush: v => Math.round(v) + '%',
    expo: v => Math.round(v) + '%', fill: v => Math.round(v) + '%', lAz: v => Math.round(v) + '°', lEl: v => Math.round(v) + '°', lW: v => Math.round(v) + '%', lAmp: v => '±' + Math.round(v) + '°', lLaps: v => Math.round(v),
    shine: v => +v ? Math.round(v) + '×' : 'Off', shineI: v => Math.round(v) + '%', shineW: v => Math.round(v) + '°', shineD: v => Math.round(v) + '% of loop', pulse: v => Math.round(v) + '%', pulseN: v => Math.round(v),
    amp: v => '±' + Math.round(v) + '°', laps: v => Math.round(v), lens: v => Math.round(10 + v / 100 * 105) + '°', yaw: v => Math.round(v) + '°', pitch: v => Math.round(v) + '°', T: v => (+v).toFixed(1) + ' s', glow: v => Math.round(v) + '%'
  };
  const readouts = [...document.querySelectorAll('.menu input[type=range]')].map(r => [r, r.closest('.block').querySelector('output')]);
  function paintReadouts() { readouts.forEach(([r, o]) => { if (o && FMT[r.id]) { const s = String(FMT[r.id](+r.value)).replace(/^-/, '−'); if (o.textContent !== s) o.textContent = s; } }); }
  const menu = document.querySelector('.menu');
  menu.addEventListener('input', paintReadouts); menu.addEventListener('change', paintReadouts); setInterval(paintReadouts, 400);
  function specs() { const fps = +$('#fps').value; $('#specs').textContent = `Loop: ${c.T.toFixed(1)} s · ${Math.round(c.T * fps)} frames at ${fps} fps · ${W} × ${H} px.`; }
  $('#fps').addEventListener('change', specs);

  const ev2 = v => Math.min(4096, Math.max(64, 2 * Math.round((+v || 1080) / 2)));
  const ratioBtns = [...document.querySelectorAll('#ratios button')];
  function syncFormat() { ratioBtns.forEach(b => b.classList.toggle('on', b.dataset.r === c.ratio)); const on = c.ratio === 'custom'; $('#customSize').hidden = !on; $('#quality').disabled = on; $('#cw').value = c.cw; $('#ch').value = c.ch; if (window.ctBalance) window.ctBalance(); }
  ratioBtns.forEach(b => b.onclick = () => { c.ratio = b.dataset.r; allocate(); syncFormat(); specs(); ToolPersist.save(); });
  ['cw', 'ch'].forEach(id => $('#' + id).addEventListener('change', () => { $('#' + id).value = ev2($('#' + id).value); c.cw = +$('#cw').value; c.ch = +$('#ch').value; allocate(); specs(); ToolPersist.save(); }));

  /* logo file: SVG text is kept as is; PNG / JPG as a copy no bigger than 1600 px */
  async function loadFile(f) {
    if (!f) return;
    try {
      if (/svg/.test(f.type) || /\.svg$/i.test(f.name)) { const t = await f.text(); await svgPrep(t); subject = { kind: 'svg', text: t, url: null }; }
      else {
        const im = await decode(URL.createObjectURL(f)), k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight)), cc = document.createElement('canvas');
        cc.width = Math.round(im.naturalWidth * k); cc.height = Math.round(im.naturalHeight * k); cc.getContext('2d').drawImage(im, 0, 0, cc.width, cc.height);
        subject = { kind: 'raster', text: null, url: cc.toDataURL('image/png') };
      }
      forceTrace = false;
      c.src = 'file'; sync(); $('#logofile').dataset.empty = ''; syncVis();
      status('Building the piece…'); await buildShapes(); ToolPersist.save();
    } catch (e) { status('Could not read that file. Use an SVG, PNG or JPG.'); }
  }
  $('#logofile').addEventListener('change', e => loadFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(t => art.addEventListener(t, e => { e.preventDefault(); art.classList.add('drop'); }));
  ['dragleave', 'drop'].forEach(t => art.addEventListener(t, e => { e.preventDefault(); art.classList.remove('drop'); }));
  art.addEventListener('drop', e => loadFile(e.dataTransfer.files[0]));
  async function useDefault() {
    const before = subject;
    try { const r = await fetch('../../shared/logo-ss.svg'), t = await r.text(); if (subject !== before) return; subject = { kind: 'svg', text: t, url: null, nudge: 0.03 }; }   /* a file loaded meanwhile wins */
    catch (e) { subject = { kind: 'svg', text: null, url: null }; c.src = 'text'; }
    forceTrace = false; $('#logofile').value = ''; $('#logofile').dataset.empty = 'Shake & Settle logo'; sync(); syncVis(); await buildShapes(); ToolPersist.save();
  }
  $('#useDefault').onclick = () => { c.src = 'file'; useDefault(); };

  /* drag the preview: turn and tilt the piece */
  let drag = null;
  art.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: c.yaw, pitch: c.pitch }; art.setPointerCapture(e.pointerId); });
  art.addEventListener('pointermove', e => {
    if (!drag) return; const r = art.getBoundingClientRect();
    c.yaw = Math.max(-90, Math.min(90, Math.round(drag.yaw + (e.clientX - drag.x) / r.width * 180)));
    c.pitch = Math.max(-90, Math.min(90, Math.round(drag.pitch + (e.clientY - drag.y) / r.height * 140)));
    $('#yaw').value = c.yaw; $('#pitch').value = c.pitch; paintReadouts();
  });
  ['pointerup', 'pointercancel'].forEach(t => art.addEventListener(t, () => { if (drag) ToolPersist.save(); drag = null; }));

  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];
  $('#rand').onclick = () => {   // motion and light only: the logo and the metal stay as you set them
    Object.assign(c, {
      move: pick(['swing', 'swing', 'float', 'turntable', 'orbit', 'still']), amp: Math.round(rnd(12, 35)), dir: pick([1, -1]),
      lMove: pick(['fixed', 'sweep', 'sweep', 'orbit']), lAmp: Math.round(rnd(25, 80)), lAz: Math.round(rnd(-40, 40)), lEl: Math.round(rnd(-10, 20)),
      shine: pick([0, 1, 1, 2]), shineW: Math.round(rnd(4, 14)), shineD: Math.round(rnd(30, 60)), pulse: pick([0, 0, Math.round(rnd(10, 30))]),
      yaw: Math.round(rnd(-25, 25)), pitch: Math.round(rnd(-5, 18))
    });
    c.rig = pick(Object.keys(RIGS)); c.lights = null; selL = -1; syncSel(); markOn('#rigs', c.rig);
    sync(); syncVis(); ToolPersist.save();
  };
  $('#play').onclick = () => { c.playing = !c.playing; $('#play').textContent = c.playing ? 'Pause' : 'Play'; };

  /* ---------- lights on the dome pad (the same control as the Vinyl & CD tool) ----------
     The pad is the dome of the studio seen from the camera: the centre is right behind you, the rim is beside the piece,
     solid dots are lights in front of it and dashed dots are behind it. The dots follow the light animation live;
     drag one to move that light, click it to change its size and strength. */
  const pad = $('#pad'), PAD_R = 0.42;
  let selL = -1;
  const dots = [0, 1, 2, 3, 4].map(k => {
    const d = document.createElement('div'); d.className = 'lp-dot'; d.textContent = k + 1; pad.appendChild(d);
    d.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); selL = k; syncSel(); own(); d.setPointerCapture(e.pointerId); d._drag = true; });
    d.addEventListener('pointermove', e => { if (d._drag) moveDot(k, e); });
    d.addEventListener('pointerup', () => { if (d._drag) ToolPersist.save(); d._drag = false; });
    return d;
  });
  function own() { if (!c.lights) c.lights = lights().map(L => L.slice()); markOn('#rigs', null); }   // your own copy of the rig from now on
  const dirOf = (az, el) => { const a = az * D2R, e2 = el * D2R; return [Math.cos(e2) * Math.sin(a), Math.sin(e2), Math.cos(e2) * Math.cos(a)]; };
  function moveDot(k, e) {
    const r = pad.getBoundingClientRect(), R = r.width * PAD_R;
    let x = (e.clientX - (r.left + r.width / 2)) / R, y = -(e.clientY - (r.top + r.height / 2)) / R;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    const L = c.lights[k], back = dirOf(L[0], L[1])[2] < 0, z = Math.sqrt(Math.max(0, 1 - x * x - y * y)) * (back ? -1 : 1);
    // the dot shows where the light is now (with the animation); you place its resting position
    L[0] = ((Math.atan2(x, z) / D2R - lightNow.env + 180) % 360 + 360) % 360 - 180; L[1] = Math.asin(Math.max(-1, Math.min(1, y))) / D2R - c.lEl;
  }
  function drawPad() {
    lights().forEach((L, k) => {
      const [x, y, z] = dirOf(L[0] + lightNow.env, L[1] + c.lEl), d = dots[k];
      d.style.left = (50 + x * PAD_R * 100) + '%'; d.style.top = (50 - y * PAD_R * 100) + '%';
      d.classList.toggle('back', z < 0); d.classList.toggle('off', L[4] <= 0); d.classList.toggle('sel', k === selL);
    });
  }
  function syncSel() {
    const on = selL >= 0;
    ['selW', 'selH', 'selI'].forEach(id => { $('#' + id).closest('.block').hidden = !on; });
    $('#selBack').closest('.block').hidden = !on;
    if (on) { const L = lights()[selL]; $('#selW').value = L[2]; $('#selH').value = L[3]; $('#selI').value = L[4]; $('#selBack').checked = dirOf(L[0], L[1])[2] < 0; paintReadouts(); }
    $('#padHint').textContent = on ? 'light ' + (selL + 1) : 'drag the dots';
    if (window.ctBalance) window.ctBalance();
  }
  [['selW', 2], ['selH', 3], ['selI', 4]].forEach(([id, k]) => $('#' + id).addEventListener('input', e => {
    e.stopPropagation(); if (selL < 0) return; own(); c.lights[selL][k] = +e.target.value; paintReadouts(); ToolPersist.save();
  }));
  $('#selBack').addEventListener('change', e => {   // move the light to the other side of the piece (mirror front / back)
    e.stopPropagation(); if (selL < 0) return; own(); const L = c.lights[selL];
    if ((dirOf(L[0], L[1])[2] < 0) !== e.target.checked) L[0] = ((180 - L[0]) + 180) % 360 - 180;
    ToolPersist.save();
  });
  pad.addEventListener('pointerdown', e => { if (e.target !== pad || selL < 0) return; own(); moveDot(selL, e); pad._drag = true; pad.setPointerCapture(e.pointerId); });
  pad.addEventListener('pointermove', e => { if (pad._drag) moveDot(selL, e); });
  pad.addEventListener('pointerup', () => { if (pad._drag) ToolPersist.save(); pad._drag = false; });

  /* ---------- preview loop ---------- */
  let last = performance.now(), busy = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (busy) return;
    if (c.playing && !drag) c.tm += dt;
    render(c.tm, false); drawPad();
  }

  /* ---------- export ---------- */
  $('#png').onclick = () => { render(c.tm, false); cv.toBlob(b => VideoExport.save('chrome-logo.png', b)); };
  $('#pngT').onclick = () => { render(c.tm, true); cv.toBlob(b => { VideoExport.save('chrome-logo-transparent.png', b); render(c.tm, false); }); };
  $('#vid').onclick = async () => {
    const btn = $('#vid'), fps = +$('#fps').value;
    btn.disabled = true; busy = true;
    try {
      const out = await VideoExport.run({ canvas: cv, renderAt: t => render(t, false), period: c.T, fps, width: W, height: H, status });
      const r = await VideoExport.save('chrome-logo-loop.' + out.ext, out.blob);
      status(r === 'saved' ? 'Saved · ' + out.note : 'Could not save the file (' + r + ').');
    } catch (e) { status('Video export failed: ' + (e.message || e)); }
    finally { busy = false; btn.disabled = false; }
  };

  /* ---------- start ---------- */
  allocate(); sync(); syncFormat(); syncVis(); paintReadouts(); specs(); markOn('#metals', c.metal); markOn('#rigs', c.rig);
  let restored = false;
  ToolPersist.init('chrome-logo', {
    get: () => ({ ratio: c.ratio, cw: c.cw, ch: c.ch, metal: c.metal, rig: c.rig, lights: c.lights, imgs: { subject } }),
    set: x => {
      if (x.ratio && (/^\d+:\d+$/.test(x.ratio) || x.ratio === 'custom')) Object.assign(c, { ratio: x.ratio, cw: ev2(x.cw), ch: ev2(x.ch) });
      if (x.metal && METALS[x.metal]) c.metal = x.metal; else c.metal = null;
      if (x.rig && RIGS[x.rig]) c.rig = x.rig;
      if (Array.isArray(x.lights) && x.lights.length === 5 && x.lights.every(L => Array.isArray(L) && L.length === 6 && L.every(isFinite))) c.lights = x.lights;
      markOn('#metals', c.metal); markOn('#rigs', c.rig);
      const s = x.imgs && x.imgs.subject;
      if (s && (s.kind === 'svg' && typeof s.text === 'string' || s.kind === 'raster' && typeof s.url === 'string' && s.url.indexOf('data:image/') === 0)) { subject = s; if (s.kind === 'svg' && /^\s*<svg width="26" height="34"/.test(s.text) && s.nudge === undefined) s.nudge = 0.03; restored = true; $('#logofile').dataset.empty = 'Saved logo'; }
      allocate(); syncFormat(); syncVis(); specs();
    }
  });
  (c.src === 'text' ? loadFont() : Promise.resolve()).then(() => restored ? buildShapes() : useDefault());
  requestAnimationFrame(frame);
  window.__metal = { c, render, U };
})();
