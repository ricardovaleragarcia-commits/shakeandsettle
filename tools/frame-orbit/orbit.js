/* Frame Orbit Carousel.
   Frames (your images) travel along a 3D route inside the artwork frame. The route is a closed or open curve in its own
   space (ring, wheel, figure eight, wave, line, helix, deck, or a custom Catmull-Rom curve you drag), then tilted,
   rolled, moved and zoomed. Real perspective (three.js) decides what is in front: frames at the front pass to the back
   as they follow the route. Every motion is a whole number of turns per loop, so frame N equals frame 0 (seamless). */
(function () {
  const TAU = Math.PI * 2;
  const $ = s => document.querySelector(s);
  const cv = $('#cv'), art = $('#art'), gcv = $('#guideCv'), gctx = gcv.getContext('2d');

  const DEF = {
    count: 8, cardAr: 0.75, size: 22, radius: 0, backMode: 0, backCol: '#2e2e2e',
    path: 'ring', pw: 92, ph: 0, pd: 105, waves: 2, tiltX: 9, tiltZ: 0, ox: 0, oy: 0, face: 'out', spin: 0, showPath: false,
    move: 'flow', laps: 1, dir: 1, T: 8, hold: 55, roll: 0,
    overlap: 'layer', persp: 45, front: 0, pulse: 0, pulseN: 1, ripple: false, zoom: 100, fade: 40,
    bg: '#000000', ratio: '3:4', quality: 1080, cw: 1080, ch: 1350, playing: true, tm: 0
  };
  const c = Object.assign({}, DEF);
  let pts = circlePts(6);                         // custom route, in frame units: x, y in -1..1
  function circlePts(n) { const a = []; for (let i = 0; i < n; i++) { const t = i / n * TAU; a.push([-Math.sin(t) * 0.7, Math.cos(t) * 0.45]); } return a; }

  /* ---------- three.js ---------- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true, alpha: false });
  } catch (e) {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:12px;right:12px;bottom:12px;padding:8px;background:rgba(0,0,0,.75);color:#fff;font:700 12px/1.3 system-ui,sans-serif;z-index:9';
    d.textContent = 'This tool needs WebGL. Try Chrome, Edge, Firefox or Safari.'; document.querySelector('.stage').appendChild(d); throw e;
  }
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 0.75, 0.01, 100);
  const root = new THREE.Group(), route = new THREE.Group();
  scene.add(root); root.add(route);

  const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
  const FS = `
precision highp float;
uniform sampler2D map; uniform vec2 uvS; uniform vec2 uvO; uniform float aspect; uniform float rad;
uniform vec3 bg; uniform float dim; uniform float alpha; uniform vec3 backCol; uniform float backMode;
varying vec2 vUv;
float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float r = min(rad, 0.5 * min(aspect, 1.0));
  float d = sdBox(p, vec2(aspect, 1.0) * 0.5, r);
  float w = max(fwidth(d), 1e-5);
  float a = 1.0 - smoothstep(-w, w * 0.5, d);
  vec3 col;
  if (gl_FrontFacing || backMode < 0.5) {
    vec2 uv = vUv; if (!gl_FrontFacing) uv.x = 1.0 - uv.x;      // the back reads the right way round
    vec4 t = texture2D(map, uv * uvS + uvO); col = t.rgb; a *= t.a;
  } else col = backCol;
  col = mix(col, bg, dim);
  gl_FragColor = vec4(col, a * alpha);
  if (gl_FragColor.a < 0.002) discard;
}`;
  const plane = new THREE.PlaneGeometry(1, 1);
  const cards = [];
  function makeCard() {
    const m = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, side: THREE.DoubleSide, depthWrite: true,
      extensions: { derivatives: true },
      uniforms: {
        map: { value: null }, uvS: { value: new THREE.Vector2(1, 1) }, uvO: { value: new THREE.Vector2(0, 0) },
        aspect: { value: 1 }, rad: { value: 0 }, bg: { value: new THREE.Color() }, dim: { value: 0 }, alpha: { value: 1 },
        backCol: { value: new THREE.Color() }, backMode: { value: 0 }
      }
    });
    const mesh = new THREE.Mesh(plane, m); route.add(mesh); return mesh;
  }

  /* ---------- images: yours, or numbered gray placeholders ---------- */
  let imgs = [];                         // { tex, ar, src (data url kept between visits), thumb }
  const ph = [];
  function placeholder(i) {
    if (ph[i]) return ph[i];
    const s = 512, cc = document.createElement('canvas'); cc.width = cc.height = s;
    const x = cc.getContext('2d'), g = [0x9a, 0x7d, 0xb4, 0x6a, 0xc8, 0x88][i % 6];
    x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(0, 0, s, s);
    x.fillStyle = g > 0x96 ? '#1a1a1a' : '#f2f2f2';
    x.font = '500 150px "Helvetica Neue", Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(i + 1).padStart(2, '0'), s / 2, s / 2 + 6);
    const t = new THREE.CanvasTexture(cc); t.anisotropy = 4;
    return (ph[i] = { tex: t, ar: 1 });
  }
  function texFrom(el, w, h) {
    const k = Math.min(1, 1600 / Math.max(w, h)), cc = document.createElement('canvas');
    cc.width = Math.max(1, Math.round(w * k)); cc.height = Math.max(1, Math.round(h * k));
    cc.getContext('2d').drawImage(el, 0, 0, cc.width, cc.height);
    const t = new THREE.CanvasTexture(cc); t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    return { tex: t, ar: w / h, cc };
  }

  /* ---------- size of the artwork ---------- */
  let W = 0, H = 0, A = 0.75;
  const ev = x => 2 * Math.round(x / 2);
  function geometry() {
    if (c.ratio === 'custom') { const cl = (v, d) => Math.min(4096, Math.max(64, ev(+v || d))); return { w: cl(c.cw, 1080), h: cl(c.ch, 1350) }; }
    const r = c.ratio.split(':').map(Number), Q = +c.quality;
    return { w: ev(r[0] >= r[1] ? Q * r[0] / r[1] : Q), h: ev(r[0] >= r[1] ? Q : Q * r[1] / r[0]) };
  }
  function allocate() {
    const g = geometry(); if (g.w === W && g.h === H) return;
    W = g.w; H = g.h; A = W / H;
    renderer.setSize(W, H, false);
    art.style.setProperty('--ar', A);
  }

  /* ---------- the route ---------- */
  const OPEN = { wave: 1, line: 1, helix: 1 };
  let curve = null, curveKey = '';
  function customCurve() {
    const k = JSON.stringify(pts) + A;
    if (k !== curveKey) {
      curveKey = k;
      curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0] * A / 2, -p[1] * 0.5, 0)), true, 'centripetal');
      curve.arcLengthDivisions = 400;
    }
    return curve;
  }
  // u in 0..1 -> local point + the direction a frame looks when it faces "outward"
  const tmp = new THREE.Vector3();
  function local(u, out, nrm) {
    const rx = c.pw / 100 * A / 2, ry = c.ph / 100 * 0.5, rz = c.pd / 100 * 0.5, k = c.waves, th = u * TAU;
    let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 1;
    switch (c.path) {
      case 'ring': x = rx * Math.sin(th); z = rz * Math.cos(th); y = ry * Math.sin(k * th); nx = x; nz = z; break;
      case 'wheel': y = Math.max(ry, 0.001) * Math.sin(th) * -1; z = rz * Math.cos(th); x = rx * Math.sin(k * th) * 0.5; ny = y; nz = z; ny /= Math.max(ry, 1e-3) / Math.max(rz, 1e-3) || 1; break;
      case 'eight': x = rx * Math.sin(th); y = ry * Math.sin(2 * th); z = rz * Math.cos(th); nx = x; nz = z; break;
      case 'wave': x = rx * (2 * u - 1); y = ry * Math.sin(k * th); z = rz * Math.cos(k * th) - rz; break;
      case 'line': x = rx * (2 * u - 1); y = ry * (2 * u - 1); z = -rz * (2 * u - 1); break;
      case 'helix': { const a = k * th; x = rx * Math.sin(a); z = rz * Math.cos(a); y = ry * (2 * u - 1); nx = x; nz = z; break; }
      case 'deck': {
        const N = Math.max(2, c.count), a = 1 - 1 / N;
        if (u <= a) { const s = u / a; z = rz * (2 * s - 1); y = ry * (1 - s); x = 0; }
        else { const s = (u - a) / (1 - a), e = s * Math.PI; x = 0; z = rz * Math.cos(e); y = ry * s - ry * 1.3 * Math.sin(e); }   // the front frame drops down and slides behind the stack
        break;
      }
      case 'custom': { const p = customCurve().getPointAt(((u % 1) + 1) % 1, tmp); x = p.x; y = p.y; z = rz * Math.cos(th); nx = x; nz = z; break; }
    }
    out.set(x, y, z);
    if (nrm) {
      if (c.path === 'custom' || c.path === 'ring' || c.path === 'eight' || c.path === 'helix') { nx = x; ny = 0; nz = z; }
      if (c.path === 'wheel') { nx = 0; ny = y; nz = z; }
      const l = Math.hypot(nx, ny, nz); if (l < 1e-5) nrm.set(0, 0, 1); else nrm.set(nx / l, ny / l, nz / l);
    }
    return out;
  }

  /* ---------- time: continuous, or step & hold with an S-curve ---------- */
  function bez(x) {   // cubic-bezier(.65, 0, .35, 1), the site's easing
    const p1 = 0.65, p2 = 0.35;
    let t = x; for (let i = 0; i < 6; i++) { const bx = 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t - x; const d = 3 * (1 - t) * (1 - t) * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (1 - p2); if (Math.abs(d) < 1e-6) break; t -= bx / d; t = Math.min(1, Math.max(0, t)); }
    return 3 * (1 - t) * t * t + t * t * t;
  }
  function progress(t) {
    const N = Math.max(1, c.count), p = (+c.dir || 1) * c.laps * (t / c.T);
    if (c.move !== 'step') return p;
    const s = p * N, k = Math.floor(s + 1e-9), f = s - k, h = c.hold / 100;
    const g = f < h ? 0 : bez((f - h) / Math.max(1e-6, 1 - h));
    return (k + g) / N;
  }
  const frac = x => x - Math.floor(x);

  /* ---------- one frame ---------- */
  const P = new THREE.Vector3(), Nr = new THREE.Vector3(), Wv = new THREE.Vector3(), bx = new THREE.Vector3(), by = new THREE.Vector3(), up = new THREE.Vector3();
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qs = new THREE.Quaternion(), Qi = new THREE.Quaternion(), Yax = new THREE.Vector3(0, 1, 0);
  const bgCol = new THREE.Color(), backC = new THREE.Color();
  function place(t) {
    allocate();
    const fov = 8 + c.persp / 100 * 67, d = 0.5 / Math.tan(fov / 360 * Math.PI);
    camera.fov = fov; camera.aspect = A; camera.position.set(0, 0, d); camera.near = d * 0.02; camera.far = d * 20;
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    const z = c.zoom / 100;
    root.position.set(c.ox / 100 * A / 2, c.oy / 100 * 0.5, 0); root.scale.setScalar(z);
    route.rotation.set(c.tiltX * Math.PI / 180, 0, c.tiltZ * Math.PI / 180 + TAU * c.roll * (t / c.T), 'XYZ');
    scene.updateMatrixWorld(true);
    return d;
  }
  function render(t) {
    place(t);
    bgCol.set(c.bg); backC.set(c.backCol); renderer.setClearColor(bgCol, 1);
    const N = Math.max(1, Math.round(c.count));
    while (cards.length < N) cards.push(makeCard());
    cards.forEach((m, i) => { m.visible = i < N; });

    // depth range of the whole route right now: "front" and "back" for fade and scale
    let zmin = Infinity, zmax = -Infinity;
    for (let s = 0; s < 64; s++) { local(s / 64, P); route.localToWorld(P); if (P.z < zmin) zmin = P.z; if (P.z > zmax) zmax = P.z; }
    const zr = zmax - zmin;

    const prog = progress(t), front0 = c.path === 'deck' ? N - 1 : OPEN[c.path] ? Math.round(N / 2) : 0;
    const h = c.size / 100, ar = +c.cardAr, open = !!OPEN[c.path];
    route.getWorldQuaternion(Qi); Qi.invert();
    for (let i = 0; i < N; i++) {
      const m = cards[i], u = frac(i / N + prog);
      local(u, P, Nr); m.position.copy(P);
      // orientation
      if (c.face === 'camera') m.quaternion.copy(Qi);
      else {
        const n = c.face === 'in' ? Nr.clone().negate() : Nr;
        if (c.path === 'wheel') { bx.set(1, 0, 0); by.crossVectors(n, bx).normalize(); bx.crossVectors(by, n).normalize(); }
        else { up.set(0, 1, 0); bx.crossVectors(up, n); if (bx.lengthSq() < 1e-8) bx.set(1, 0, 0); bx.normalize(); by.crossVectors(n, bx).normalize(); }
        M4.makeBasis(bx, by, n); m.quaternion.setFromRotationMatrix(M4);
      }
      if (c.spin) { Qs.setFromAxisAngle(Yax, TAU * c.spin * (t / c.T)); m.quaternion.multiply(Qs); }
      // front / back
      Wv.copy(P); route.localToWorld(Wv);
      const fr = zr > 1e-5 ? (Wv.z - zmin) / zr : 1;
      let s = Math.pow(2, c.front / 100 * (2 * fr - 1));
      if (c.pulse) s *= 1 + c.pulse / 100 * Math.sin(TAU * (c.pulseN * t / c.T - (c.ripple ? u : 0)));
      m.scale.set(h * ar * s, h * s, 1);
      // image
      const M = imgs.length, idx = (((front0 - i) % N) + N) % N, src = M ? imgs[idx % M] : placeholder(idx);
      const U = m.material.uniforms;
      U.map.value = src.tex; U.aspect.value = ar; U.rad.value = c.radius / 100;
      if (src.ar > ar) { U.uvS.value.set(ar / src.ar, 1); U.uvO.value.set((1 - ar / src.ar) / 2, 0); }    // cover: crop the sides
      else { U.uvS.value.set(1, src.ar / ar); U.uvO.value.set(0, (1 - src.ar / ar) / 2); }               // or top and bottom
      U.bg.value.copy(bgCol); U.backCol.value.copy(backC); U.backMode.value = +c.backMode;
      U.dim.value = c.fade / 100 * (1 - fr);
      U.alpha.value = open ? sstep(0, 0.07, u) * sstep(1, 0.93, u) : 1;   // open routes: frames fade in and out at the ends
      m.userData.dist = Wv.distanceTo(camera.position);
    }
    // Overlap. "Front covers back": every frame is a flat layer drawn from the farthest to the nearest, so frames never cut
    // through each other, whatever their size or spin. "Real 3D": the depth buffer decides, pixel by pixel (frames can intersect).
    const layer = c.overlap !== '3d';
    cards.slice(0, N).sort((a, b) => b.userData.dist - a.userData.dist).forEach((m, k) => {
      m.renderOrder = k; m.material.depthTest = !layer; m.material.depthWrite = !layer;
    });
    renderer.render(scene, camera);
  }
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* ---------- guide: the route and, for Custom, its points (separate canvas, never exported) ---------- */
  const proj = new THREE.Vector3();
  function toScreen(v, k) { proj.copy(v); route.localToWorld(proj); proj.project(camera); return [(proj.x + 1) / 2 * k[0], (1 - proj.y) / 2 * k[1]]; }
  let handles = [];
  function handleZ(k) {   // where control point k sits along the arc length (for its depth)
    const cu = customCurve(), L = cu.getLengths(400), n = pts.length;
    return c.pd / 100 * 0.5 * Math.cos(TAU * L[Math.round(400 * k / n)] / L[400]);
  }
  function drawGuide() {
    const dpr = devicePixelRatio || 1, cw = Math.round(cv.clientWidth * dpr), ch = Math.round(cv.clientHeight * dpr);
    if (gcv.width !== cw || gcv.height !== ch) { gcv.width = cw; gcv.height = ch; }
    gctx.clearRect(0, 0, cw, ch); handles = [];
    const custom = c.path === 'custom';
    if (!c.showPath && !custom) return;
    place(c.tm);
    const k = [cw, ch];
    gctx.save(); gctx.globalCompositeOperation = 'difference'; gctx.strokeStyle = '#fff'; gctx.fillStyle = '#fff'; gctx.lineWidth = Math.max(1.5, cw / 600);
    gctx.setLineDash([cw / 120, cw / 160]); gctx.beginPath();
    for (let s = 0; s <= 240; s++) { local(Math.min(s / 240, 0.99999), P); const q = toScreen(P, k); s ? gctx.lineTo(q[0], q[1]) : gctx.moveTo(q[0], q[1]); }
    if (!OPEN[c.path]) gctx.closePath();
    gctx.stroke(); gctx.setLineDash([]);
    if (custom) {
      const r = Math.max(5, cw / 90);
      pts.forEach((p, i) => {
        P.set(p[0] * A / 2, -p[1] * 0.5, handleZ(i)); const q = toScreen(P, k);
        handles.push([q[0] / dpr, q[1] / dpr]);
        gctx.beginPath(); gctx.rect(q[0] - r, q[1] - r, 2 * r, 2 * r);
        i === sel ? gctx.fill() : gctx.stroke();
      });
    }
    gctx.restore();
  }

  /* custom points: drag them on the preview */
  let sel = -1, drag = -1;
  const ray = new THREE.Raycaster(), pl = new THREE.Plane(), hit = new THREE.Vector3();
  function pointer(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r]; }
  art.addEventListener('pointerdown', e => {
    if (c.path !== 'custom') return;
    const [x, y] = pointer(e); let best = -1, bd = 22;
    handles.forEach((h, i) => { const dd = Math.hypot(h[0] - x, h[1] - y); if (dd < bd) { bd = dd; best = i; } });
    if (best < 0) return;
    sel = drag = best; art.setPointerCapture(e.pointerId); e.preventDefault();
  });
  art.addEventListener('pointermove', e => {
    if (c.path !== 'custom') { art.classList.remove('editing', 'grab'); return; }
    art.classList.add('editing');
    const [x, y, r] = pointer(e);
    art.classList.toggle('grab', drag >= 0 || handles.some(h => Math.hypot(h[0] - x, h[1] - y) < 22));
    if (drag < 0) return;
    place(c.tm);
    const z = handleZ(drag), a = new THREE.Vector3(0, 0, z), b = new THREE.Vector3(1, 0, z), d = new THREE.Vector3(0, 1, z);
    [a, b, d].forEach(v => route.localToWorld(v));
    pl.setFromCoplanarPoints(a, b, d);
    ray.setFromCamera({ x: x / r.width * 2 - 1, y: 1 - y / r.height * 2 }, camera);
    if (!ray.ray.intersectPlane(pl, hit)) return;
    route.worldToLocal(hit);
    pts[drag] = [Math.max(-1.6, Math.min(1.6, hit.x / (A / 2))), Math.max(-1.6, Math.min(1.6, -hit.y / 0.5))];
    ToolPersist.save();
  });
  ['pointerup', 'pointercancel'].forEach(t => art.addEventListener(t, () => { drag = -1; }));
  $('#ptAdd').onclick = () => {   // a new point halfway between the selected one and the next
    const i = sel >= 0 ? sel : pts.length - 1, j = (i + 1) % pts.length;
    pts.splice(i + 1, 0, [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2]); sel = i + 1; ToolPersist.save();
  };
  $('#ptDel').onclick = () => { if (pts.length <= 3) return; pts.splice(sel >= 0 ? sel : pts.length - 1, 1); sel = -1; ToolPersist.save(); };
  $('#ptReset').onclick = () => { pts = circlePts(6); sel = -1; ToolPersist.save(); };

  /* ---------- interface ---------- */
  const NUM = ['count', 'cardAr', 'size', 'radius', 'backMode', 'pw', 'ph', 'pd', 'waves', 'tiltX', 'tiltZ', 'ox', 'oy', 'spin', 'laps', 'dir', 'T', 'hold', 'roll', 'persp', 'front', 'pulse', 'pulseN', 'zoom', 'fade', 'quality'];
  const inputs = [...document.querySelectorAll('[data-k]')];
  const read = el => el.type === 'checkbox' ? el.checked : NUM.includes(el.dataset.k) ? +el.value : el.value;
  function sync() { inputs.forEach(el => { const v = c[el.dataset.k]; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }); }
  function setBlock(id, show) { const b = document.getElementById(id).closest('.block'); if (b.hidden === !show) return; b.hidden = !show; }
  function syncVis() {
    const p = c.path, custom = p === 'custom';
    $('#customBlock').hidden = !custom;
    setBlock('pw', !custom); setBlock('ph', !custom);
    setBlock('waves', p === 'ring' || p === 'wheel' || p === 'wave' || p === 'helix');
    setBlock('hold', c.move === 'step');
    setBlock('backCol', +c.backMode === 1);
    if (window.ctBalance) window.ctBalance();
  }
  inputs.forEach(el => el.addEventListener('input', () => {
    c[el.dataset.k] = read(el);
    if (['ratio', 'quality'].includes(el.dataset.k)) allocate();
    syncVis(); specs();
  }));

  const FMT = {
    count: v => Math.round(v), size: v => Math.round(v) + '%', radius: v => Math.round(v) + '%', pw: v => Math.round(v) + '%', ph: v => Math.round(v) + '%',
    pd: v => Math.round(v) + '%', waves: v => Math.round(v), tiltX: v => Math.round(v) + '°', tiltZ: v => Math.round(v) + '°', ox: v => Math.round(v) + '%', oy: v => Math.round(v) + '%',
    spin: v => (v > 0 ? '+' : '') + Math.round(v), laps: v => Math.round(v), T: v => (+v).toFixed(1) + ' s', hold: v => Math.round(v) + '%', roll: v => (v > 0 ? '+' : '') + Math.round(v),
    persp: v => Math.round(v) + '%', front: v => '×' + Math.pow(2, v / 100).toFixed(2), pulse: v => Math.round(v) + '%', pulseN: v => Math.round(v), zoom: v => Math.round(v) + '%', fade: v => Math.round(v) + '%'
  };
  const readouts = [...document.querySelectorAll('.menu input[type=range]')].map(r => [r, r.closest('.block').querySelector('output')]);
  function paintReadouts() { readouts.forEach(([r, o]) => { if (o && FMT[r.id]) { const s = String(FMT[r.id](+r.value)).replace('-', '−'); if (o.textContent !== s) o.textContent = s; } }); }
  const menu = document.querySelector('.menu');
  menu.addEventListener('input', paintReadouts); menu.addEventListener('change', paintReadouts); setInterval(paintReadouts, 400);
  function specs() { const fps = +$('#fps').value; $('#specs').textContent = `Loop: ${c.T.toFixed(1)} s · ${Math.round(c.T * fps)} frames at ${fps} fps · ${W} × ${H} px.`; }
  $('#fps').addEventListener('change', specs);

  /* format */
  const ev2 = v => Math.min(4096, Math.max(64, 2 * Math.round((+v || 1080) / 2)));
  const ratioBtns = [...document.querySelectorAll('#ratios button')];
  function syncFormat() {
    ratioBtns.forEach(b => b.classList.toggle('on', b.dataset.r === c.ratio));
    const on = c.ratio === 'custom'; $('#customSize').hidden = !on; $('#quality').disabled = on;
    $('#cw').value = c.cw; $('#ch').value = c.ch; if (window.ctBalance) window.ctBalance();
  }
  ratioBtns.forEach(b => b.onclick = () => { c.ratio = b.dataset.r; allocate(); syncFormat(); specs(); ToolPersist.save(); });
  ['cw', 'ch'].forEach(id => $('#' + id).addEventListener('change', () => { $('#' + id).value = ev2($('#' + id).value); c.cw = +$('#cw').value; c.ch = +$('#ch').value; allocate(); specs(); ToolPersist.save(); }));

  /* presets: a starting point for each kind of motion (your frames, count, colors and format stay) */
  const PRESETS = {
    carousel: { path: 'ring', pw: 92, ph: 0, pd: 105, tiltX: 9, tiltZ: 0, face: 'out', move: 'flow', laps: 1, front: 0, persp: 50, fade: 40, size: 22, spin: 0, roll: 0, pulse: 0, zoom: 100, ox: 0, oy: 0 },
    wheel: { path: 'wheel', pw: 0, ph: 70, pd: 90, waves: 2, tiltX: 0, tiltZ: 0, face: 'out', move: 'flow', laps: 1, front: 0, persp: 50, fade: 45, size: 28, spin: 0, roll: 0, pulse: 0, zoom: 100, ox: 0, oy: 0 },
    infinity: { path: 'eight', pw: 82, ph: 50, pd: 90, tiltX: 0, tiltZ: 0, face: 'camera', move: 'flow', laps: 1, front: 35, persp: 45, fade: 45, size: 19, spin: 0, roll: 0, pulse: 0, zoom: 100, ox: 0, oy: 0 },
    slides: { path: 'ring', pw: 100, ph: 0, pd: 70, tiltX: 0, tiltZ: 0, face: 'camera', move: 'step', hold: 60, laps: 1, front: 55, persp: 40, fade: 60, size: 34, spin: 0, roll: 0, pulse: 0, zoom: 100, ox: 0, oy: 0 },
    deck: { path: 'deck', pw: 95, ph: 85, pd: 90, tiltX: 0, tiltZ: 0, face: 'camera', move: 'step', hold: 50, laps: 1, front: 0, persp: 50, fade: 55, size: 44, spin: 0, roll: 0, pulse: 0, zoom: 100, ox: 0, oy: -12 },
    marquee: { path: 'line', pw: 230, ph: 0, pd: 0, tiltX: 0, tiltZ: 0, face: 'camera', move: 'flow', laps: 1, front: 0, persp: 20, fade: 0, size: 30, spin: 0, roll: 0, pulse: 0, zoom: 100, ox: 0, oy: 0 },
    helix: { path: 'helix', pw: 62, ph: 175, pd: 75, waves: 2, tiltX: 6, tiltZ: 0, face: 'out', move: 'flow', laps: 1, front: 0, persp: 50, fade: 50, size: 20, spin: 0, roll: 0, pulse: 0, zoom: 100, ox: 0, oy: 0 },
    orbit: { path: 'ring', pw: 88, ph: 0, pd: 95, tiltX: 35, tiltZ: -15, face: 'camera', move: 'flow', laps: 1, front: 45, persp: 55, fade: 45, size: 19, spin: 0, roll: 0, pulse: 10, pulseN: 2, ripple: true, zoom: 100, ox: 0, oy: 14 }
  };
  document.querySelectorAll('#presets button').forEach(b => b.onclick = () => {
    Object.assign(c, PRESETS[b.dataset.p]); sync(); syncVis(); specs(); ToolPersist.save();
    document.querySelectorAll('#presets button').forEach(x => x.classList.toggle('on', x === b));
  });
  menu.addEventListener('input', e => { if (!e.target.closest('#presets')) document.querySelectorAll('#presets button').forEach(x => x.classList.remove('on')); });

  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.random() * a.length | 0];
  $('#rand').onclick = () => {
    const p = pick(['ring', 'ring', 'wheel', 'eight', 'wave', 'helix', 'deck']);
    Object.assign(c, {
      path: p, pw: Math.round(rnd(50, 95)), ph: p === 'ring' ? pick([0, 0, 20]) : Math.round(rnd(30, p === 'helix' ? 180 : 80)),
      pd: Math.round(rnd(40, 110)), waves: Math.round(rnd(1, 3)), tiltX: Math.round(rnd(-10, 40)), tiltZ: pick([0, 0, Math.round(rnd(-25, 25))]),
      face: pick(['camera', 'out', 'out']), move: pick(['flow', 'step']), hold: Math.round(rnd(35, 70)), laps: pick([1, 1, 2]),
      dir: pick([1, -1]), front: Math.round(rnd(0, 90)), fade: Math.round(rnd(20, 60)), persp: Math.round(rnd(30, 70)),
      pulse: pick([0, 0, Math.round(rnd(5, 20))]), pulseN: pick([1, 2, 3]), ripple: Math.random() < 0.5, spin: pick([0, 0, 0, 1, -1]), roll: 0
    });
    if (p === 'wave') c.pw = Math.round(rnd(150, 230));
    sync(); syncVis(); ToolPersist.save();
  };
  $('#saveSet').onclick = () => { ToolPersist.download('frame-orbit-settings.json'); status('Settings saved as a file.'); };
  $('#loadSet').onclick = () => $('#setFile').click();
  $('#setFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const msg = await ToolPersist.load(f); status(msg || 'Settings loaded.');
  });
  $('#play').onclick = () => { c.playing = !c.playing; $('#play').textContent = c.playing ? 'Pause' : 'Play'; };

  /* images: pick or drop several; reorder by dragging the thumbnails; × removes one */
  const status = t => { $('#status').textContent = t; };
  async function decode(url) { const el = new Image(); el.src = url; await (el.decode ? el.decode() : new Promise((ok, no) => { el.onload = ok; el.onerror = no; })); return el; }
  async function svgImage(file) {   // SVGs need an explicit size to be drawn on a canvas
    const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml'), s = doc.documentElement;
    if (!s || s.nodeName.toLowerCase() !== 'svg') throw new Error('svg');
    doc.querySelectorAll('script, foreignObject').forEach(n => n.remove());
    const vb = (s.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    let w = vb.length === 4 && vb[2] > 0 ? vb[2] : parseFloat(s.getAttribute('width')) || 1000, h = vb.length === 4 && vb[3] > 0 ? vb[3] : parseFloat(s.getAttribute('height')) || 1000;
    const k = 1600 / Math.max(w, h); s.setAttribute('width', w * k); s.setAttribute('height', h * k);
    if (!s.getAttribute('xmlns')) s.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return decode(URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(s)], { type: 'image/svg+xml' })));
  }
  function keepCopy(cc) {   // what is remembered between visits: a copy no bigger than 900 px
    const k = Math.min(1, 900 / Math.max(cc.width, cc.height)), s = document.createElement('canvas');
    s.width = Math.round(cc.width * k); s.height = Math.round(cc.height * k); s.getContext('2d').drawImage(cc, 0, 0, s.width, s.height);
    let u = s.toDataURL('image/webp', 0.85); if (u.indexOf('data:image/webp') !== 0) u = s.toDataURL('image/png');
    return u;
  }
  async function addFiles(list) {
    const files = [...list].filter(f => /^image\//.test(f.type) || /\.(svg|png|jpe?g|webp|gif)$/i.test(f.name));
    if (!files.length) return;
    const fresh = !imgs.length;
    status('Loading ' + files.length + ' image' + (files.length > 1 ? 's' : '') + '…');
    for (const f of files) {
      try {
        const el = /svg/.test(f.type) || /\.svg$/i.test(f.name) ? await svgImage(f) : await decode(URL.createObjectURL(f));
        const t = texFrom(el, el.naturalWidth || el.width, el.naturalHeight || el.height);
        t.src = keepCopy(t.cc); imgs.push(t);
      } catch (e) { status('Could not read ' + f.name + '.'); }
    }
    if (fresh || imgs.length > c.count) { c.count = Math.min(30, Math.max(imgs.length, fresh ? Math.max(imgs.length, 3) : c.count)); sync(); }
    status(''); thumbs(); ToolPersist.save();
  }
  $('#files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(t => art.addEventListener(t, e => { e.preventDefault(); art.classList.add('drop'); }));
  ['dragleave', 'drop'].forEach(t => art.addEventListener(t, e => { e.preventDefault(); art.classList.remove('drop'); }));
  art.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  $('#clearImgs').onclick = () => { imgs.forEach(i => i.tex.dispose()); imgs = []; thumbs(); ToolPersist.save(); };
  $('#shuffleImgs').onclick = () => { for (let i = imgs.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [imgs[i], imgs[j]] = [imgs[j], imgs[i]]; } thumbs(); ToolPersist.save(); };
  let dragI = -1;
  function thumbs() {
    const box = $('#thumbs'); box.textContent = '';
    imgs.forEach((im, i) => {
      const b = document.createElement('div'); b.className = 'thumb'; b.draggable = true; b.style.backgroundImage = `url(${im.src})`; b.title = 'Frame ' + (i + 1) + ' · drag to reorder';
      const x = document.createElement('span'); x.className = 'x'; x.textContent = '×'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', 'Remove image ' + (i + 1));
      x.onclick = e => { e.stopPropagation(); imgs[i].tex.dispose(); imgs.splice(i, 1); thumbs(); ToolPersist.save(); };
      b.appendChild(x);
      b.addEventListener('dragstart', () => { dragI = i; b.classList.add('dragging'); });
      b.addEventListener('dragend', () => b.classList.remove('dragging'));
      b.addEventListener('dragover', e => e.preventDefault());
      b.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); if (dragI < 0 || dragI === i) return; const [m] = imgs.splice(dragI, 1); imgs.splice(i, 0, m); dragI = -1; thumbs(); ToolPersist.save(); });
      box.appendChild(b);
    });
    $('#files').dataset.empty = imgs.length ? imgs.length + ' image' + (imgs.length > 1 ? 's' : '') : 'Placeholders';
  }

  /* ---------- preview loop ---------- */
  let last = performance.now(), busy = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (busy) return;
    if (c.playing) c.tm = (c.tm + dt) % (c.T * 1000);
    render(c.tm); drawGuide();
  }

  /* ---------- export ---------- */
  $('#png').onclick = () => { render(c.tm); cv.toBlob(b => VideoExport.save('frame-orbit.png', b)); };
  $('#vid').onclick = async () => {
    const btn = $('#vid'), fps = +$('#fps').value;
    btn.disabled = true; busy = true;
    try {
      const out = await VideoExport.run({ canvas: cv, renderAt: render, period: c.T, fps, width: W, height: H, status });
      const r = await VideoExport.save('frame-orbit-loop.' + out.ext, out.blob);
      status(r === 'saved' ? 'Saved · ' + out.note : 'Could not save the file (' + r + ').');
    } catch (e) { status('Video export failed: ' + (e.message || e)); }
    finally { busy = false; btn.disabled = false; }
  };

  /* ---------- start ---------- */
  allocate(); sync(); syncVis(); syncFormat(); paintReadouts(); thumbs();
  ToolPersist.init('frame-orbit', {
    get: () => ({ ratio: c.ratio, cw: c.cw, ch: c.ch, pts, imgs: imgs.map(i => i.src) }),
    set: async x => {
      if (x.ratio && (/^\d+:\d+$/.test(x.ratio) || x.ratio === 'custom')) Object.assign(c, { ratio: x.ratio, cw: ev2(x.cw), ch: ev2(x.ch) });
      if (Array.isArray(x.pts) && x.pts.length >= 3 && x.pts.every(p => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))) pts = x.pts;
      allocate(); syncFormat(); syncVis(); specs();
      if (Array.isArray(x.imgs) && x.imgs.length) {
        const cnt = c.count;
        for (const u of x.imgs) { if (typeof u !== 'string' || u.indexOf('data:image/') !== 0) continue; try { const el = await decode(u); const t = texFrom(el, el.naturalWidth, el.naturalHeight); t.src = u; imgs.push(t); } catch (e) {} }
        c.count = cnt; sync(); thumbs();
      }
    }
  });
  specs();
  requestAnimationFrame(frame);
  window.__orbit = { c, render };
})();
