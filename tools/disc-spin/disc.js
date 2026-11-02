const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const linearHex = h => new THREE.Color(h).convertSRGBToLinear();

// Medidas reales en mm (CD: 120 mm, 1,2 mm, agujero 15 mm · LP 12": 300 mm, ~1,5 mm, agujero 7,2 mm, etiqueta ~100 mm)
const CD = {R: 60,  T: 1.2, HOLE: 7.5,  HUB: 11.5, HUB_H: 0.6};
const LP = {R: 150, T: 1.5, HOLE: 3.62, LABEL: 50};
$('specs').textContent = 'Real sizes: CD 120 mm × 1.2 mm (hole 15 mm) · 12" LP 300 mm × ~1.5 mm (hole 7.2 mm, label ~100 mm).';

const RATIOS = {'1:1': [1080,1080], '3:4': [1080,1440], '4:5': [1080,1350], '9:16': [1080,1920], '16:9': [1920,1080]};
const PERIOD = {frontal: 4, girar: 3.5, 'volteo-y': 6, 'volteo-x': 6, balanceo: 5};
let RATIO_KEY = '3:4';
const csz = (v, d) => { v = Math.round(+v || d); return Math.min(4096, Math.max(64, v - v%2)); };   // custom size: even, 64..4096
const customDims = () => [csz($('cw').value, 1080), csz($('ch').value, 1350)];
RATIOS.custom = customDims();

// ---------- Escena ----------
const viewer = $('viewer'), stage = $('stage'), canvas = $('gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.LinearToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 14);
camera.position.set(0, 0, 5.4);

// Entorno sin rectángulos: los destellos son manchas redondas y suaves (no se ven como cuadrados)
function envCanvas(dark){
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  if(dark){ g.addColorStop(0, '#2a2d35'); g.addColorStop(0.5, '#0c0d11'); g.addColorStop(1, '#050507'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.42, '#dfe4ec'); g.addColorStop(0.55, '#8d939e'); g.addColorStop(1, '#3b3f48'); }
  x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
  for(const u of [0.16, 0.38, 0.62, 0.84]){   // centros a >0.107 del borde: ningún destello queda cortado en la costura del mapa
    const cx = u*1024, cy = 150, rg = x.createRadialGradient(cx, cy, 0, cx, cy, 110);
    const a = dark ? 0.85 : 1;
    rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(0.5, `rgba(255,255,255,${a*0.6})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rg; x.fillRect(cx - 110, cy - 110, 220, 220);
  }
  return c;
}
const pmrem = new THREE.PMREMGenerator(renderer);
function envFrom(dark){
  const t = new THREE.CanvasTexture(envCanvas(dark)); t.mapping = THREE.EquirectangularReflectionMapping;
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
  return {tex: t, map: pmrem.fromEquirectangular(t).texture};
}
const envBright = envFrom(false), envDark = envFrom(true);

// Luces: ambiente, principal, contraluz y dos focales (superior e inferior), ambas con sombra
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(2, 4, 5); scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, 0.4); rim.position.set(-3, 1, -2); scene.add(rim);
function makeSpot(){
  const s = new THREE.SpotLight(0xffffff, 1.5, 0, Math.PI/5, 0.6, 1);
  scene.add(s); scene.add(s.target); s.target.position.set(0, 0, 0);
  return s;
}
const spots = [makeSpot(), makeSpot(), makeSpot()];

// ---------- Texturas ----------
function placeholderCover(back){
  // same grays as the plain-colors disc: #d9d9d9 body, #eaeaea label, gray SIDE A / SIDE B text
  const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
  x.clearRect(0,0,1024,1024);
  x.fillStyle = '#cdcdcd'; x.beginPath(); x.arc(512,512,505,0,Math.PI*2); x.fill();
  x.fillStyle = '#dedede'; x.beginPath(); x.arc(512,512,0.35*512,0,Math.PI*2); x.fill();
  x.fillStyle = '#929292'; x.font = 'bold 76px "Helvetica Neue", Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(back ? 'SIDE B' : 'SIDE A', 512, 650);   // below the hub (drawn a touch darker: the lights brighten it ~5%)
  return c;
}
function placeholderLabel(back){
  // drawn darker on purpose: the default lights brighten it by ~1.42x, so it reads as the plain-colors label gray (#eaeaea) with gray text
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#9e9e9e'; x.beginPath(); x.arc(256,256,250,0,Math.PI*2); x.fill();
  x.fillStyle = '#6c6c6c'; x.font = 'bold 64px "Helvetica Neue", Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(back ? 'SIDE B' : 'SIDE A', 256, 372);   // below the spindle hole
  return c;
}
function grooveCanvas(){
  const c = document.createElement('canvas'); c.width = c.height = 2048; const x = c.getContext('2d');
  x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, 2048, 2048);
  for(let r = 340; r < 1024; r += 0.8){
    const v = Math.round(120 + Math.random()*20);
    x.strokeStyle = `rgb(${v},${v},${v})`; x.lineWidth = 0.5;
    x.beginPath(); x.arc(1024, 1024, r, 0, Math.PI*2); x.stroke();
  }
  return c;
}
// Detalle del vinilo en coordenadas polares (u = ángulo, v = radio), en DOS texturas:
//  - anillos finos (emisiva, suave, iguales en todo el ángulo)
//  - polvo y rayones (capa aparte con su propio deslizador): NO son iguales en todo el ángulo, y por eso se ve girar el disco
// No hay relieve ni mapa de rugosidad: esos dos generaban destellos blancos que dependían del tamaño de pantalla.
function dataTex(data, WT, HT){
  const t = new THREE.DataTexture(data, WT, HT, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.needsUpdate = true;
  return t;
}
function detailTextures(){
  const WT = 1024, HT = 2048, ring = new Uint8Array(WT*HT*4);
  const inner = LP.HOLE, outer = LP.R, r0 = LP.LABEL, r1 = outer - 2, RINGS = 170, mmRow = (outer - inner)/HT;
  const hash = n => { const v = Math.sin(n*127.1 + 311.7)*43758.5453; return v - Math.floor(v); };
  const vnoise = x => { const k = Math.floor(x), f = x - k, w = f*f*(3 - 2*f); return hash(k)*(1 - w) + hash(k + 1)*w; };   // transición suave entre anillos
  let seed = 20261015; const rnd = () => (seed = (seed*1664525 + 1013904223) >>> 0)/4294967296;   // determinista: el disco siempre es el mismo
  // Smooth zones, as on a real record: run-out (dead wax) next to the label, the lead-in at the rim, and smooth bands (track gaps) between songs.
  const SMOOTH = 255*0.03, smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a)/(b - a))); return t*t*(3 - 2*t); };
  const DEAD = 7, LEAD = 3.5;
  function paintRing(gaps){
    const gs = [];
    const a0 = r0 + DEAD + 10, a1 = r1 - LEAD - 10;
    for(let k = 0; k < gaps; k++) gs.push([a0 + (k + 0.5 + (hash(k*7.7 + 3.1) - 0.5)*0.5)/gaps*(a1 - a0), 0.6 + 0.9*hash(k*3.3 + 9.2)]);
    for(let j = 0; j < HT; j++){
      const r = inner + (j + 0.5)*mmRow; let v = 0;
      if(r > r0 && r < r1){
        const q = (r - r0)/(r1 - r0); v = 255*(0.06 + 0.18*(0.65*vnoise(q*RINGS) + 0.35*vnoise(q*RINGS/4 + 91.7)));
        let f = 1 - smoothstep(r0 + DEAD - 0.4, r0 + DEAD + 0.4, r);          // run-out
        f = Math.max(f, smoothstep(r1 - LEAD - 0.4, r1 - LEAD + 0.4, r));      // lead-in
        for(const [c, w] of gs) f = Math.max(f, 1 - smoothstep(w/2 - 0.3, w/2 + 0.3, Math.abs(r - c)));   // track gaps
        v = v + (SMOOTH - v)*f;
      }
      for(let i = 0; i < WT; i++){ const o = (j*WT + i)*4; ring[o] = ring[o+1] = ring[o+2] = v; ring[o+3] = 255; }
    }
  }
  paintRing(+$('gaps').value);

  // Wear is drawn on flat canvases (disc seen from above, 1 mm = PX px) and then unrolled into polar textures.
  //  tex1: R = dust specks + fibers · G = circular hairlines (follow the grooves) · B = soft smudges / fingerprints
  //  tex2: R, G, B = scratches crossing the grooves, in three orientations (0°, 60°, 120°); the shader lights each by its own direction
  const SIZE = 2048, PX = SIZE/(2*outer), C = SIZE/2, TAU = Math.PI*2;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = SIZE; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, SIZE, SIZE); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round'; x.lineJoin = 'round'; return {c, x}; };
  const A = mk(), B = mk();
  const clipRing = x => { x.save(); x.beginPath(); x.arc(C, C, r1*PX, 0, TAU); x.arc(C, C, r0*PX, 0, TAU, true); x.clip('evenodd'); };
  const col = (ch, a) => `rgba(${ch === 0 ? 255 : 0},${ch === 1 ? 255 : 0},${ch === 2 ? 255 : 0},${a})`;
  const ringPoint = () => { const r = r0 + 2 + rnd()*(r1 - r0 - 4), a = rnd()*TAU; return [C + Math.cos(a)*r*PX, C + Math.sin(a)*r*PX, r, a]; };
  // 1) dust: many tiny specks, few big ones, irregular (1-3 overlapping blobs)
  clipRing(A.x);
  for(let n = 0; n < 3200; n++){
    const [x, y] = ringPoint(), s = (0.04 + 0.35*Math.pow(rnd(), 5))*PX, al = 0.25 + 0.75*rnd();
    A.x.fillStyle = col(0, al);
    for(let k = 0, m = 1 + Math.floor(rnd()*3); k < m; k++){
      A.x.beginPath(); A.x.ellipse(x + (rnd() - 0.5)*s, y + (rnd() - 0.5)*s, Math.max(0.45, s*(0.4 + rnd()*0.7)), Math.max(0.45, s*(0.3 + rnd()*0.6)), rnd()*Math.PI, 0, TAU); A.x.fill();
    }
  }
  // 2) fibers: short curly threads
  A.x.lineWidth = 0.8;
  for(let n = 0; n < 110; n++){
    let [x, y] = ringPoint(), dir = rnd()*TAU; const segs = 3 + Math.floor(rnd()*4), step = (0.3 + rnd()*1.2)*PX;
    A.x.strokeStyle = col(0, 0.35 + 0.5*rnd()); A.x.beginPath(); A.x.moveTo(x, y);
    for(let k = 0; k < segs; k++){ dir += (rnd() - 0.5)*2.2; x += Math.cos(dir)*step; y += Math.sin(dir)*step; A.x.lineTo(x, y); }
    A.x.stroke();
  }
  // 3) hairlines along the grooves: a lot, mostly short and faint, a few long
  for(let n = 0; n < 1100; n++){
    const r = (r0 + 1 + rnd()*(r1 - r0 - 2))*PX, a0 = rnd()*TAU, L = 0.03 + 1.3*Math.pow(rnd(), 3);
    A.x.lineWidth = 0.5 + rnd()*0.7; A.x.strokeStyle = col(1, 0.06 + 0.45*Math.pow(rnd(), 2));
    A.x.beginPath(); A.x.arc(C, C, r + (rnd() - 0.5)*0.6, a0, a0 + L); A.x.stroke();
  }
  A.x.restore();
  // 4) scratches across the grooves, three orientations
  clipRing(B.x);
  for(let n = 0; n < 190; n++){
    const [x, y] = ringPoint(), bucket = Math.floor(rnd()*3), ang = bucket*Math.PI/3 + (rnd() - 0.5)*0.25;
    const L = (3 + 55*Math.pow(rnd(), 2.2))*PX, bend = (rnd() - 0.5)*L*0.12, dx = Math.cos(ang)*L/2, dy = Math.sin(ang)*L/2;
    B.x.lineWidth = 0.5 + rnd()*0.5; B.x.strokeStyle = col(bucket, 0.08 + 0.55*Math.pow(rnd(), 2));
    B.x.beginPath(); B.x.moveTo(x - dx, y - dy); B.x.quadraticCurveTo(x - dy/L*bend*2, y + dx/L*bend*2, x + dx, y + dy); B.x.stroke();
  }
  B.x.restore();
  // 5) smudges / fingerprints: soft blobs and a few oval ridged prints
  const sm = document.createElement('canvas'); sm.width = sm.height = 512; const sx = sm.getContext('2d'); sx.fillStyle = '#000'; sx.fillRect(0, 0, 512, 512); sx.globalCompositeOperation = 'lighter';
  for(let n = 0; n < 55; n++){
    const x = rnd()*512, y = rnd()*512, rr = 14 + rnd()*70, g = sx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(255,255,255,${0.05 + 0.18*rnd()})`); g.addColorStop(1, 'rgba(255,255,255,0)'); sx.fillStyle = g; sx.fillRect(x - rr, y - rr, rr*2, rr*2);
  }
  for(let n = 0; n < 5; n++){                                   // fingerprint: concentric ovals, partly worn
    const x = 120 + rnd()*280, y = 120 + rnd()*280, tilt = rnd()*Math.PI, a0 = rnd()*TAU;
    for(let k = 3; k < 26; k++){ sx.strokeStyle = `rgba(255,255,255,${0.05 + 0.07*rnd()})`; sx.lineWidth = 1.3; sx.beginPath(); sx.ellipse(x, y, k*1.7, k*2.3, tilt, a0 + rnd(), a0 + 2 + rnd()*3.5); sx.stroke(); }
  }
  const da = A.x.getImageData(0, 0, SIZE, SIZE).data, db = B.x.getImageData(0, 0, SIZE, SIZE).data, ds = sx.getImageData(0, 0, 512, 512).data;
  const t1 = new Uint8Array(WT*HT*4), t2 = new Uint8Array(WT*HT*4);
  for(let j = 0; j < HT; j++){
    const r = (inner + (j + 0.5)*mmRow)*PX;
    for(let i = 0; i < WT; i++){
      const a = (i + 0.5)/WT*TAU, cx = Math.min(SIZE - 1, Math.max(0, Math.round(C + Math.cos(a)*r))), cy = Math.min(SIZE - 1, Math.max(0, Math.round(C + Math.sin(a)*r)));
      const o = (j*WT + i)*4, s = (cy*SIZE + cx)*4, sm2 = (Math.min(511, Math.round(cy/4))*512 + Math.min(511, Math.round(cx/4)))*4;
      t1[o] = da[s]; t1[o+1] = da[s+1]; t1[o+2] = ds[sm2]; t1[o+3] = 255;
      t2[o] = db[s]; t2[o+1] = db[s+1]; t2[o+2] = db[s+2]; t2[o+3] = 255;
    }
  }
  const ringT = dataTex(ring, WT, HT);
  return {ring: ringT, t1: dataTex(t1, WT, HT), t2: dataTex(t2, WT, HT), repaint: n => { paintRing(n); ringT.needsUpdate = true; }};
}
const detailTexs = detailTextures(), detailTex = detailTexs.ring;
const coverFrontTex = new THREE.CanvasTexture(placeholderCover(false));
const coverBackTex  = new THREE.CanvasTexture(placeholderCover(true));
function labelTex(back){ const t = new THREE.CanvasTexture(placeholderLabel(back)); t.encoding = THREE.sRGBEncoding; return t; }
function loadTexture(file, done, srgb){
  const r = new FileReader();
  r.onload = () => { const img = new Image(); img.onload = () => { const t = new THREE.Texture(img); if(srgb) t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; done(t); }; img.src = r.result; };
  r.readAsDataURL(file);
}

// ---------- CD: plata con arcoíris difractivo ----------
const U = {
  uEnv: {value: envBright.tex}, uIri: {value: 0.9}, uTrans: {value: 0.3}, uExp: {value: 1},
  uLight: {value: new THREE.Vector3(2, 4, 5).normalize()}, uLightK: {value: 1}, uLightCol: {value: new THREE.Color(1, 1, 1)}, uCam: {value: new THREE.Vector3()}
};
const FACE_VS = `
  varying vec2 vUv; varying vec2 vL; varying vec3 vN; varying vec3 vW;
  void main(){
    vUv = uv; vL = position.xy;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FACE_FS = `
  uniform sampler2D uMap; uniform sampler2D uEnv;
  uniform float uIri, uTrans, uExp; uniform vec3 uLight, uCam, uLightCol; uniform float uLightK;
  varying vec2 vUv; varying vec2 vL; varying vec3 vN; varying vec3 vW;
  vec3 pal(float t){ return 0.5 + 0.5*cos(6.28318*(t + vec3(0.0, 0.33, 0.67))); }
  vec3 env(vec3 r){
    float u = atan(r.z, r.x)/6.28318 + 0.5;
    float v = asin(clamp(r.y, -1.0, 1.0))/3.14159 + 0.5;
    return texture2D(uEnv, vec2(u, v)).rgb;
  }
  void main(){
    vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
    vec3 V = normalize(uCam - vW);
    vec3 R = reflect(-V, n);
    float nv = clamp(dot(n, V), 0.0, 1.0);
    float rn = clamp(length(vL)/60.0, 0.0, 1.0);
    float ang = atan(vL.y, vL.x);
    float ph = ang*0.95 + nv*1.1 + R.x*0.9 + R.y*0.35 + rn*0.35;
    float streak = 0.6 + 0.4*pow(abs(cos(3.0*ang + 2.0*R.y)), 3.0);
    vec3 film = mix(pal(ph), vec3(1.0), 0.32);
    vec3 e = env(R);
    vec3 silver = vec3(0.72, 0.75, 0.80) * (0.5 + 0.45*e);
    vec3 foil = mix(silver, film*streak*(0.8 + 0.35*e), uIri*0.7);
    float spec = pow(max(dot(R, uLight), 0.0), 40.0)*uLightK;
    // the artwork is scaled to fit inside 96% of the radius: a thin outer ring always stays bare, so the rainbow shows
    vec4 t = texture2D(uMap, (vUv - 0.5)/0.96 + 0.5);
    t.a *= 1.0 - smoothstep(0.956, 0.964, rn);
    vec3 cover = t.rgb*(0.9 + 0.2*e) + uLightCol*spec*0.3;
    float fres = pow(1.0 - nv, 2.0);
    vec3 col = mix(foil + uLightCol*spec*0.6, cover, t.a);
    float alpha = mix(1.0 - uTrans*(1.0 - fres), 1.0, t.a);
    gl_FragColor = vec4(col*uExp, alpha);
  }`;
function faceMat(map){
  return new THREE.ShaderMaterial({
    uniforms: {...U, uMap: {value: map}}, side: THREE.DoubleSide,
    transparent: true, vertexShader: FACE_VS, fragmentShader: FACE_FS
  });
}
const cdFrontMat = faceMat(coverFrontTex), cdBackMat = faceMat(coverBackTex);
const cdBodyMat = new THREE.MeshStandardMaterial({color: 0xdfe3ea, metalness: 1, roughness: 0.2, envMap: envBright.map, side: THREE.DoubleSide});

// ---------- Vinilo ----------
const vColorLin = linearHex($('vColor').value);
const vinylBodyMat = new THREE.MeshPhysicalMaterial({color: vColorLin, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMap: envDark.map, envMapIntensity: 1.0, side: THREE.DoubleSide});
const vinylFaceMat = new THREE.MeshPhysicalMaterial({color: vColorLin, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMap: envDark.map, envMapIntensity: 1.0, emissive: new THREE.Color(1, 1, 1), emissiveMap: detailTex, emissiveIntensity: 0.05, bumpMap: detailTex, bumpScale: 0.003, side: THREE.DoubleSide});
// Wear layer: additive, lit by the first light. Scratches flash depending on the angle between their direction and the light/camera,
// so they glint and fade as the disc or the light moves, like real marks on a record.
const DUST_VS = `
  varying vec2 vUv; varying vec2 vL; varying vec3 vN; varying vec3 vW; varying vec3 vAx; varying vec3 vAy;
  void main(){
    vUv = uv; vL = position.xy;
    vN = normalize(mat3(modelMatrix) * normal);
    vAx = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0)); vAy = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const DUST_FS = `
  uniform sampler2D uT1, uT2, uRing; uniform vec3 uLight, uCam, uLightCol; uniform float uAmt, uLightK;
  varying vec2 vUv; varying vec2 vL; varying vec3 vN; varying vec3 vW; varying vec3 vAx; varying vec3 vAy;
  float aniso(vec3 T, vec3 H){ float d = dot(normalize(T), H); return pow(max(1.0 - d*d, 0.0), 6.0); }
  void main(){
    vec4 a = texture2D(uT1, vUv), b = texture2D(uT2, vUv);
    vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
    vec3 V = normalize(uCam - vW), H = normalize(normalize(uLight) + V);
    float ang = atan(vL.y, vL.x);
    vec3 Tc = -sin(ang)*vAx + cos(ang)*vAy;
    float nh = max(dot(n, H), 0.0);
    float gz = smoothstep(0.035, 0.07, texture2D(uRing, vUv).r);   // no hairlines on smooth zones
    float scr = a.g*gz*aniso(Tc, H) + b.r*aniso(vAx, H) + b.g*aniso(0.5*vAx + 0.866*vAy, H) + b.b*aniso(-0.5*vAx + 0.866*vAy, H);
    float dust = a.r*(0.45 + 0.55*pow(nh, 4.0));
    float smudge = a.b*(0.25 + 0.75*pow(nh, 10.0));
    float v = (scr*1.5 + dust*0.6 + smudge*0.45)*uAmt*uLightK*0.35;
    gl_FragColor = vec4(uLightCol*v, 1.0);
  }`;
const dustMat = new THREE.ShaderMaterial({
  uniforms: {uT1: {value: detailTexs.t1}, uT2: {value: detailTexs.t2}, uRing: {value: detailTex}, uAmt: {value: 0.5}, uLight: U.uLight, uCam: U.uCam, uLightCol: U.uLightCol, uLightK: U.uLightK},
  vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide
});

// Groove layer: darkens grooves, hairlines, scratches and specks. Additive light is invisible on a light vinyl, so this one
// multiplies instead; it scales with the vinyl's lightness (nothing on a black record, strong on a white one).
const GRV_FS = `
  uniform sampler2D uT1, uT2, uRing; uniform float uAmt, uLum;
  varying vec2 vUv;
  void main(){
    vec4 a = texture2D(uT1, vUv), b = texture2D(uT2, vUv); float g = texture2D(uRing, vUv).r;
    float band = clamp((g - 0.06)/0.18, 0.0, 1.0);
    float d = 0.5*band + 0.9*a.g*smoothstep(0.035, 0.07, g) + 0.8*max(b.r, max(b.g, b.b)) + 0.35*a.r + 0.2*a.b;
    float k = uAmt*smoothstep(0.08, 0.55, uLum);
    gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(d*k*0.55, 0.0, 0.8));
  }`;
const grooveMat = new THREE.ShaderMaterial({
  uniforms: {uT1: {value: detailTexs.t1}, uT2: {value: detailTexs.t2}, uRing: {value: detailTex}, uAmt: {value: 0.5}, uLum: {value: 0}},
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: GRV_FS, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, side: THREE.DoubleSide
});
const lumOf = hex => { const c = new THREE.Color(hex); return 0.2126*c.r + 0.7152*c.g + 0.0722*c.b; };   // sRGB lightness 0..1
grooveMat.uniforms.uLum.value = lumOf($('vColor').value);

// ---------- Vinyl finish: solid / marble / splatter / half & half, glitter, transparency ----------
const GLIT_FS = `
  uniform vec3 uLight, uCam, uCol; uniform float uAmt, uLightK, uDens;
  varying vec2 vUv; varying vec2 vL; varying vec3 vN; varying vec3 vW; varying vec3 vAx; varying vec3 vAy;
  float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
  float layer(vec2 q, vec3 n0, vec3 H, vec3 ax, vec3 ay, float seed){
    vec2 cell = floor(q), f = fract(q);
    float hb = h1(cell + seed), hx = h1(cell + seed*1.7), hy = h1(cell + seed*2.9), hs = h1(cell + seed*4.1);
    if(hb < 1.0 - uAmt) return 0.0;                                                  // not every cell holds a flake
    vec2 c = 0.5 + (vec2(hx, hy) - 0.5)*0.55;                                         // flake sits anywhere in its cell
    float rad = 0.10 + 0.13*hs;                                                       // flakes differ in size
    float shape = smoothstep(rad, rad*0.55, length(f - c));
    vec3 n = normalize(n0 + ((hx - 0.5)*ax + (hy - 0.5)*ay)*1.4);                      // every flake is tilted its own way
    float sp = pow(max(dot(n, H), 0.0), 70.0);
    return shape*(sp*3.2 + 0.10*hb);
  }
  void main(){
    vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
    vec3 V = normalize(uCam - vW), H = normalize(normalize(uLight) + V);
    mat2 R = mat2(0.80, 0.60, -0.60, 0.80);                                            // second layer on a rotated grid: no visible lattice
    float v = layer(vL*uDens, n, H, vAx, vAy, 7.3) + layer(R*vL*uDens*1.37, n, H, vAx, vAy, 31.9);
    gl_FragColor = vec4(uCol*v*uLightK, 1.0);
  }`;
const glitterMat = new THREE.ShaderMaterial({
  uniforms: {uAmt: {value: 0}, uCol: {value: new THREE.Color(1, 0.95, 0.82)}, uDens: {value: 1.1}, uLight: U.uLight, uCam: U.uCam, uLightK: U.uLightK},
  vertexShader: DUST_VS, fragmentShader: GLIT_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide
});
let patSeed = 1, patTex = null;
function buildPattern(kind, c1, c2, seed){
  const N = 768, cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d');
  let sd = Math.imul(seed|0, 0x9E3779B1) >>> 0; const rnd = () => (sd = (sd*1664525 + 1013904223) >>> 0)/4294967296;
  const col1 = new THREE.Color(c1), col2 = new THREE.Color(c2), css = c => '#' + c.getHexString();
  if(kind === 'marble'){
    const off = [rnd()*100, rnd()*100, rnd()*100, rnd()*100];
    const hs = (i, j) => { const v = Math.sin(i*127.1 + j*311.7 + off[0])*43758.5453; return v - Math.floor(v); };
    const vn = (px, py) => { const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j, u = fx*fx*(3 - 2*fx), w = fy*fy*(3 - 2*fy);
      return hs(i, j)*(1 - u)*(1 - w) + hs(i + 1, j)*u*(1 - w) + hs(i, j + 1)*(1 - u)*w + hs(i + 1, j + 1)*u*w; };
    const fbm = (px, py) => vn(px, py)*0.5 + vn(px*2, py*2)*0.25 + vn(px*4, py*4)*0.125 + vn(px*8, py*8)*0.0625;
    const im = x.createImageData(N, N);
    for(let j = 0; j < N; j++) for(let i = 0; i < N; i++){
      const px = i/N*3 + off[1], py = j/N*3 + off[2];
      const wx = fbm(px*1.3 + 5.2, py*1.3), wy = fbm(px*1.3, py*1.3 + 1.7);
      const t = fbm(px + 2.6*wx, py + 2.6*wy), m = Math.min(1, Math.max(0, (t - 0.36)/0.28)), mm = m*m*(3 - 2*m), o = (j*N + i)*4;
      im.data[o] = (col1.r*(1 - mm) + col2.r*mm)*255; im.data[o+1] = (col1.g*(1 - mm) + col2.g*mm)*255; im.data[o+2] = (col1.b*(1 - mm) + col2.b*mm)*255; im.data[o+3] = 255;
    }
    x.putImageData(im, 0, 0);
  } else if(kind === 'splatter'){
    // real splatter: the base colour, then a spray of dots: a few clusters, lots of tiny drops, a few bigger ones, no tails or streaks
    x.fillStyle = css(col1); x.fillRect(0, 0, N, N); x.fillStyle = css(col2);
    const TAUX = Math.PI*2;
    const drop = (cx, cy, r) => {                                       // one drop: slightly irregular, hard edge
      const n = r > 6 ? 16 + Math.floor(rnd()*8) : 8 + Math.floor(rnd()*4), ph = rnd()*TAUX, w1 = rnd()*TAUX, w2 = 0.5 + rnd()*0.5; x.beginPath();   // bigger drops get more vertices: round, not polygonal
      for(let k = 0; k <= n; k++){ const an = ph + k/n*TAUX, rr = r*(1 + 0.12*Math.sin(3*an + w1) + 0.06*Math.sin(5*an + w2)); const px = cx + Math.cos(an)*rr, py = cy + Math.sin(an)*rr*0.92;
        k ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.closePath(); x.fill();
    };
    const centres = Array.from({length: 7}, () => [rnd()*N, rnd()*N, 60 + rnd()*120]);   // clusters where the spray is denser
    for(let n = 0, total = 2600; n < total; n++){
      let cx, cy;
      if(rnd() < 0.55){ const c = centres[Math.floor(rnd()*centres.length)], an = rnd()*TAUX, d = c[2]*Math.pow(rnd(), 0.7); cx = c[0] + Math.cos(an)*d; cy = c[1] + Math.sin(an)*d; }
      else { cx = rnd()*N; cy = rnd()*N; }
      const r = 0.7 + 9*Math.pow(rnd(), 7);                               // mostly tiny, rarely big
      drop(((cx % N) + N) % N, ((cy % N) + N) % N, r);
    }
    for(let n = 0; n < 16; n++) drop(rnd()*N, rnd()*N, 14 + 18*rnd());   // a few bigger splashes
  } else {   // half & half
    const a = rnd()*Math.PI*2, dx = Math.cos(a)*N/2, dy = Math.sin(a)*N/2, g = x.createLinearGradient(N/2 - dx, N/2 - dy, N/2 + dx, N/2 + dy);
    g.addColorStop(0, css(col1)); g.addColorStop(0.45, css(col1)); g.addColorStop(0.55, css(col2)); g.addColorStop(1, css(col2));
    x.fillStyle = g; x.fillRect(0, 0, N, N);
  }
  // unroll to the polar texture the vinyl faces use (u = angle, v = radius from the hole to the rim)
  const src = x.getImageData(0, 0, N, N).data, WT = 1024, HT = 512, out = new Uint8Array(WT*HT*4);
  for(let j = 0; j < HT; j++){
    const r = (LP.HOLE + (j + 0.5)/HT*(LP.R - LP.HOLE))/LP.R*(N/2);
    for(let i = 0; i < WT; i++){
      const a = (i + 0.5)/WT*Math.PI*2, px = Math.min(N - 1, Math.max(0, Math.round(N/2 + Math.cos(a)*r))), py = Math.min(N - 1, Math.max(0, Math.round(N/2 + Math.sin(a)*r)));
      const o = (j*WT + i)*4, sI = (py*N + px)*4; out[o] = src[sI]; out[o+1] = src[sI+1]; out[o+2] = src[sI+2]; out[o+3] = 255;
    }
  }
  const t = new THREE.DataTexture(out, WT, HT, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true;
  return t;
}
let finTimer = 0;
function refreshFinish(now){
  clearTimeout(finTimer);
  const go = () => {
    const kind = $('vFinish').value, c1 = $('vColor').value, c2 = $('vColor2').value;
    if(patTex){ patTex.dispose(); patTex = null; }
    if(kind === 'solid'){ vinylFaceMat.map = null; vinylFaceMat.color.copy(linearHex(c1)); }
    else { patTex = buildPattern(kind, c1, c2, patSeed); vinylFaceMat.map = patTex; vinylFaceMat.color.setRGB(1, 1, 1); }
    vinylFaceMat.needsUpdate = true;
    if(kind !== 'solid') grooveMat.uniforms.uLum.value = Math.max(lumOf(c1), lumOf(c2)) * 0.5 + Math.min(lumOf(c1), lumOf(c2)) * 0.5;
    else grooveMat.uniforms.uLum.value = lumOf(c1);
  };
  if(now) go(); else finTimer = setTimeout(go, 160);
}
function applyTrans(t){
  for(const m of [vinylBodyMat, vinylFaceMat]){ m.transparent = t > 0; m.opacity = 1 - t; m.depthWrite = t === 0; m.needsUpdate = true; }
}
const labelFrontMat = new THREE.MeshStandardMaterial({map: labelTex(false), transparent: false, alphaTest: 0.5, roughness: 0.55, metalness: 0, envMap: envDark.map, envMapIntensity: 0.5, side: THREE.DoubleSide});
const labelBackMat  = new THREE.MeshStandardMaterial({map: labelTex(true),  transparent: false, alphaTest: 0.5, roughness: 0.55, metalness: 0, envMap: envDark.map, envMapIntensity: 0.5, side: THREE.DoubleSide});

// Safari (and phones) can drop the WebGL context when memory is tight or the tab was in the background. three.js restores its own state,
// but the reflection maps were rendered into GPU targets that are gone: rebuild them and hand them to the materials again.
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); canvas.dataset.lost = '1'; });
canvas.addEventListener('webglcontextrestored', () => {
  const nb = envFrom(false), nd = envFrom(true);
  envBright.map = nb.map; envDark.map = nd.map;
  cdBodyMat.envMap = nb.map;
  for(const m of [vinylBodyMat, vinylFaceMat, labelFrontMat, labelBackMat]) m.envMap = nd.map;
  for(const m of [cdBodyMat, vinylBodyMat, vinylFaceMat, labelFrontMat, labelBackMat]) m.needsUpdate = true;
  delete canvas.dataset.lost;
});

// ---------- Geometría ----------
function lathe(profile){
  const g = new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(p[0], p[1])), 192);
  g.rotateX(Math.PI/2);
  return g;
}
function annulus(inner, outer, seg = 256, mirror = false, polar = false){
  const pos = [], uv = [], idx = [];
  for(let i = 0; i <= seg; i++){
    const a = i/seg*Math.PI*2, c = Math.cos(a), s2 = Math.sin(a);
    pos.push(inner*c, inner*s2, 0, outer*c, outer*s2, 0);
    const u1 = (inner*c/outer + 1)/2, v1 = (inner*s2/outer + 1)/2, u2 = (c + 1)/2, v2 = (s2 + 1)/2;
    if(polar) uv.push(i/seg, 0, i/seg, 1); else uv.push(mirror ? 1-u1 : u1, v1, mirror ? 1-u2 : u2, v2);
  }
  for(let i = 0; i < seg; i++){ const a = i*2, b = a+1, c2 = a+2, d = a+3; idx.push(a, b, c2, b, d, c2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function face(geo, mat, z, back){
  const m = new THREE.Mesh(geo, mat); m.position.z = z; if(back) m.rotation.y = Math.PI; return m;
}
function buildCD(){
  const g = new THREE.Group(), {R, T, HOLE, HUB, HUB_H} = CD, h = T/2;
  g.add(new THREE.Mesh(lathe([[R, -h], [R, h]]), cdBodyMat));
  g.add(new THREE.Mesh(lathe([[HUB, h], [HUB, h + HUB_H], [HOLE, h + HUB_H]]), cdBodyMat));
  g.add(new THREE.Mesh(lathe([[HOLE, -h - HUB_H], [HUB, -h - HUB_H], [HUB, -h]]), cdBodyMat));
  g.add(face(annulus(HUB, R), cdFrontMat, h + 0.02, false));
  g.add(face(annulus(HUB, R, 256, false), cdBackMat, -h - 0.02, true));
  g.scale.setScalar(1/R);
  return g;
}
function buildVinyl(){
  const g = new THREE.Group(), {R, T, HOLE, LABEL} = LP, h = T/2;
  g.add(new THREE.Mesh(lathe([[R, -h], [R, h]]), vinylBodyMat));
  g.add(face(annulus(HOLE, R, 256, false, true), vinylFaceMat, h + 0.02, false));
  g.add(face(annulus(HOLE, R, 256, false, true), vinylFaceMat, -h - 0.02, true));
  g.add(face(annulus(HOLE, R, 256, false, true), grooveMat, h + 0.04, false));
  g.add(face(annulus(HOLE, R, 256, false, true), grooveMat, -h - 0.04, true));
  g.add(face(annulus(LABEL, R, 256, false, true), glitterMat, h + 0.05, false));   // glitter only on the vinyl, not on the label
  g.add(face(annulus(LABEL, R, 256, false, true), glitterMat, -h - 0.05, true));
  g.add(face(annulus(HOLE, R, 256, false, true), dustMat, h + 0.06, false));
  g.add(face(annulus(HOLE, R, 256, false, true), dustMat, -h - 0.06, true));
  g.add(face(annulus(HOLE, LABEL), labelFrontMat, h + 0.2, false));
  g.add(face(annulus(HOLE, LABEL, 256, false), labelBackMat, -h - 0.2, true));
  g.scale.setScalar(1/R);
  return g;
}
// Plain colors: flat, unlit, same colors as the cover of this tool (disc + lighter label, hole through)
const plainBodyMat = new THREE.MeshBasicMaterial({color: linearHex('#ffffff'), side: THREE.DoubleSide, toneMapped: false});
const plainEdgeMat = new THREE.MeshBasicMaterial({color: linearHex('#ffffff'), side: THREE.DoubleSide, toneMapped: false});
const plainLabelFrontMat = new THREE.MeshBasicMaterial({color: linearHex('#ffffff'), side: THREE.DoubleSide, toneMapped: false});
const plainLabelBackMat = new THREE.MeshBasicMaterial({color: linearHex('#ffffff'), side: THREE.DoubleSide, toneMapped: false});
function buildPlain(T, R, holeF, labelF, labelIn = holeF){
  const g = new THREE.Group(), h = T/R/2;
  g.add(new THREE.Mesh(lathe([[1, -h], [1, h]]), plainEdgeMat));
  g.add(face(annulus(holeF, 1), plainBodyMat, h + 0.002, false));
  g.add(face(annulus(holeF, 1), plainBodyMat, -h - 0.002, true));
  g.add(face(annulus(labelIn, labelF), plainLabelFrontMat, h + 0.004, false));
  g.add(face(annulus(labelIn, labelF), plainLabelBackMat, -h - 0.004, true));
  // spin marker: a short dark tick on the top face, shown only in "Playing" and only while the front label has no image (a plain blank disc turning on its own axis would look still otherwise)
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.26), new THREE.MeshBasicMaterial({color: linearHex(getComputedStyle(document.documentElement).getPropertyValue('--dark').trim() || '#806532'), toneMapped: false}));   // the panel's dark tone, so it follows the palette
  mark.position.set(0, 0.7, h + 0.006); mark.visible = false; g.add(mark); g.userData.mark = mark;
  return g;
}
// same geometry as the realistic discs: vinyl hole + label; CD hole, clear hub ring, and the printed face out to the rim
const plainVinyl = buildPlain(LP.T, LP.R, LP.HOLE/LP.R, LP.LABEL/LP.R), plainCD = buildPlain(CD.T, CD.R, CD.HOLE/CD.R, 1, CD.HUB/CD.R);
const cdGroup = buildCD(), vinylGroup = buildVinyl();
const disc = new THREE.Group();
disc.add(cdGroup, vinylGroup, plainVinyl, plainCD);
scene.add(disc);

// ---------- Estado ----------
let mode = 'vinyl', style = 'plain', animName = 'frontal', spinOn = false, animPlaying = true, tAnim = 0, lastT = performance.now(), exporting = false;
let userRx = 0, userRy = 0, dragging = false, lx = 0, ly = 0, recenter = false;
const BASE = {x: 0, y: 0};   // always seen from the front

function setOff(id, off){
  const g = $(id); g.classList.toggle('off', off);
  g.querySelectorAll('input, select, button').forEach(el => el.disabled = off);
}
function refresh(){
  const real = style === 'real';
  cdGroup.visible = real && mode === 'cd'; vinylGroup.visible = real && mode === 'vinyl';
  plainCD.visible = !real && mode === 'cd'; plainVinyl.visible = !real && mode === 'vinyl';
  $('tCD').classList.toggle('on', mode === 'cd'); $('tVN').classList.toggle('on', mode === 'vinyl');
  $('sReal').classList.toggle('on', real); $('sPlain').classList.toggle('on', !real);
  $('optCD').hidden = mode !== 'cd'; $('optVN').hidden = mode !== 'vinyl';   // by disc type
  // the options of the style that is not active stay visible but switched off
  $('offNote').hidden = real;
  setOff('optCD', !real); setOff('optVN', !real); setOff('optLights', !real); setOff('optPlain', real);
}
const setMode = m => { mode = m; refresh(); };
$('tCD').onclick = () => setMode('cd');
$('tVN').onclick = () => setMode('vinyl');
$('sReal').onclick = () => { style = 'real'; refresh(); };
$('sPlain').onclick = () => { style = 'plain'; refresh(); };
$('pBody').oninput = e => { const c = linearHex(e.target.value); plainBodyMat.color.copy(c); plainEdgeMat.color.copy(c); };
$('pLabel').oninput = e => { for(const m of [plainLabelFrontMat, plainLabelBackMat]) if(!m.map) m.color.copy(linearHex(e.target.value)); };   // the color is only for labels without an image
refresh();

// Cada animación es periódica: su último fotograma enlaza con el primero
// "Playing" (spinOn) turns the disc on its own axis and stacks on top of Flip / Sway / Vertical flip (two turns per cycle, so it still loops);
// on its own it has its own period. Front, still never spins.
function curPeriod(){ return animName === 'frontal' ? (spinOn ? PERIOD.girar : 4) : (PERIOD[animName] || 4); }
function pose(name, t){
  const P = PERIOD[name] || 4, ph = 2*Math.PI*(t/P);
  let r;
  switch(name){
    case 'volteo-y': r = {x: BASE.x, y: BASE.y + ph, z: 0}; break;
    case 'volteo-x': r = {x: BASE.x + ph, y: BASE.y, z: 0}; break;
    case 'balanceo': r = {x: BASE.x + 0.12*Math.sin(ph*2), y: BASE.y + 0.8*Math.sin(ph), z: 0}; break;
    default:         r = {x: BASE.x, y: BASE.y, z: 0};
  }
  if(spinOn) r.z = -(name === 'frontal' ? 2*Math.PI*(t/PERIOD.girar) : 2*ph);   // negative z = clockwise seen from the front, like a real record
  return r;
}
function syncAnimUI(){
  document.querySelectorAll('#anims button').forEach(x => {
    const a = x.dataset.a;
    x.classList.toggle('on', a === 'girar' ? spinOn : a === 'frontal' ? (animName === 'frontal' && !spinOn) : a === animName);
  });
}
document.querySelectorAll('#anims button').forEach(b => b.onclick = () => {
  const a = b.dataset.a;
  if(a === 'girar') spinOn = !spinOn;                       // Playing is a switch: it adds the spin to whatever movement is chosen
  else if(a !== 'frontal' && a === animName) animName = 'frontal';   // clicking the active movement again switches it off (back to Playing alone, or still)
  else { animName = a; if(a === 'frontal') spinOn = false; } // Front, still holds the disc: no spin either
  tAnim = 0;
  if(animName !== 'frontal' || spinOn){ animPlaying = true; $('pause').textContent = 'Pause'; }   // picking a moving animation always plays it (Front, still just holds)
  syncAnimUI();
});
document.querySelectorAll('#ratios button').forEach(b => b.onclick = () => {
  RATIO_KEY = b.dataset.r;
  if(RATIO_KEY === 'custom') RATIOS.custom = customDims();
  $('customSize').hidden = RATIO_KEY !== 'custom'; $('res').disabled = RATIO_KEY === 'custom';
  document.querySelectorAll('#ratios button').forEach(x => x.classList.toggle('on', x === b));
  layoutStage();
});
for(const id of ['cw', 'ch']){
  $(id).addEventListener('input', () => { if(RATIO_KEY === 'custom'){ RATIOS.custom = customDims(); layoutStage(); } });
  $(id).addEventListener('change', () => { $(id).value = customDims()[id === 'cw' ? 0 : 1]; if(RATIO_KEY === 'custom'){ RATIOS.custom = customDims(); layoutStage(); } });
}
$('center').onclick = () => {   // ease back to the front, taking the shortest way round
  userRy = ((userRy + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI; recenter = true;
};
$('pause').onclick = () => { animPlaying = !animPlaying; $('pause').textContent = animPlaying ? 'Pause' : 'Resume'; };


// Ajustes
$('vColor').oninput = e => { const c = linearHex(e.target.value); vinylBodyMat.color.copy(c); refreshFinish(); };
$('vColor2').oninput = () => refreshFinish();
$('vFinish').onchange = () => { $('vColor2').closest('.block').style.opacity = $('vFinish').value === 'solid' ? .35 : 1; $('vSeed').disabled = $('vFinish').value === 'solid'; refreshFinish(true); };
$('vSeed').onclick = () => { patSeed = (patSeed*7 + 13) % 1000003; refreshFinish(true); ToolPersist.save(); };
$('glit').oninput = e => { $('glitv').textContent = (+e.target.value).toFixed(2); glitterMat.uniforms.uAmt.value = +e.target.value; };
$('glitC').oninput = e => glitterMat.uniforms.uCol.value.set(e.target.value);
$('vTr').oninput = e => { $('vtrv').textContent = (+e.target.value).toFixed(2); applyTrans(+e.target.value); };
$('gaps').oninput = e => { $('gapsv').textContent = e.target.value; detailTexs.repaint(+e.target.value); };
// reflectividad: más alta = más brillo de entorno y barniz; más baja = superficie mate
function applyGloss(v){
  for(const m of [vinylBodyMat, vinylFaceMat]){
    m.envMapIntensity = v*1.67;
    m.clearcoat = Math.min(1, v*1.4);
  }
  vinylBodyMat.roughness = 0.5 - 0.25*v;
  vinylFaceMat.roughness = 0.45 - 0.25*v;
  for(const m of [labelFrontMat, labelBackMat]){ m.envMapIntensity = 0.1 + v*0.6; m.roughness = 0.75 - 0.2*v; m.needsUpdate = true; }
  vinylBodyMat.needsUpdate = vinylFaceMat.needsUpdate = true;
}
// ---------- Label paper: fine fibre relief on the vinyl label (bump map; size and strength adjustable) ----------
const lpBump = new THREE.CanvasTexture(document.createElement('canvas'));
function paintPaper(size){   // grain size 0 = the finest grain the texture can hold (same as 0.5)
  const N = size < 1 ? 2048 : 1024, K = N/1024, c = lpBump.image, g = Math.max(size, 0.5); c.width = c.height = N; const x = c.getContext('2d');   // below 1 the grain needs a finer texture
  x.fillStyle = '#808080'; x.fillRect(0, 0, N, N);
  const layer = (cell, alpha) => {                                   // random noise at low resolution, smoothly enlarged = grain of that size
    const n = Math.max(8, Math.round(N/cell)), t = document.createElement('canvas'); t.width = t.height = n;
    const tx = t.getContext('2d'), d = tx.createImageData(n, n);
    for(let i = 0; i < n*n; i++){ const v = 128 + (Math.random() - 0.5) * 176 * 0.12; d.data[i*4] = d.data[i*4+1] = d.data[i*4+2] = v; d.data[i*4+3] = 255; }   // 0.22 = very soft, like the almost smooth paper of a real label
    tx.putImageData(d, 0, 0); x.globalAlpha = alpha; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(t, 0, 0, N, N);
  };
  layer(g*K, 1); layer(g*2.6*K, 0.3);
  x.globalAlpha = 1;
  // Embossed ring around the spindle area, as on a real label: ONE thin soft ridge (no hard double line). Lit from above it gets a bright
  // edge on one side and a faint shadow on the other, which is what the real photo shows.
  const mid = N/2, ridge = (r, w, peak) => {
    for(let d = -3.5*w; d <= 3.5*w; d += 0.35*K){
      const a = peak*Math.exp(-(d*d)/(w*w));            // soft bell-shaped profile across the ridge
      x.lineWidth = 0.5*K; x.strokeStyle = `rgba(255,255,255,${a})`;
      x.beginPath(); x.arc(mid, mid, r + d, 0, Math.PI*2); x.stroke();
    }
  };
  const rw = +$('lpw').value;                              // ring width slider
  ridge(0.31*mid, rw*K, Math.min(0.5, 0.32*Math.sqrt(rw/1.4)));   // the pressed ring (a wider ridge gets a touch more height so it stays visible)
  ridge(LP.HOLE/LP.LABEL*mid + 2*K, 1.1*K, 0.14);         // faint lip where the paper meets the spindle hole
  lpBump.needsUpdate = true;
}
function applyPaper(){
  $('lpwv').textContent = (+$('lpw').value).toFixed(1);
  const a = +$('lp').value; $('lpv').textContent = a.toFixed(2); $('lpsv').textContent = (+$('lps').value).toFixed(1);
  for(const m of [labelFrontMat, labelBackMat]){ if(m.bumpMap !== lpBump){ m.bumpMap = lpBump; m.needsUpdate = true; } m.bumpScale = a*PAPER_K; }
}
const PAPER_K = 0.1;
paintPaper(+$('lps').value); applyPaper();
$('lp').oninput = applyPaper;
$('lps').oninput = () => { paintPaper(+$('lps').value); applyPaper(); };
$('lpw').oninput = () => { $('lpwv').textContent = (+$('lpw').value).toFixed(1); paintPaper(+$('lps').value); applyPaper(); };
$('dust').oninput = e => { $('dustv').textContent = (+e.target.value).toFixed(2); dustMat.uniforms.uAmt.value = +e.target.value; };
$('grv').oninput = e => { $('grvv').textContent = (+e.target.value).toFixed(2); grooveMat.uniforms.uAmt.value = +e.target.value; };
$('refl').oninput = e => { $('reflv').textContent = (+e.target.value).toFixed(2); applyGloss(+e.target.value); };
applyGloss(0.5);
$('vFinish').onchange();
$('iri').oninput = e => U.uIri.value = +e.target.value;
$('trans').oninput = e => U.uTrans.value = +e.target.value;
function setBg(hex){ if(window.setFrameBg) window.setFrameBg(hex); renderer.setClearColor(new THREE.Color(hex), 1); }
$('bg').oninput = e => setBg(e.target.value);
setBg($('bg').value);
let bgTex = null, bgImgEl = null;
function fitBg(){
  if(!bgTex || !bgImgEl) return;
  const ia = bgImgEl.width/bgImgEl.height, va = camera.aspect;     // "cover": fill the frame, crop the excess
  if(ia > va){ bgTex.repeat.set(va/ia, 1); bgTex.offset.set((1 - va/ia)/2, 0); } else { bgTex.repeat.set(1, ia/va); bgTex.offset.set(0, (1 - ia/va)/2); }
}
function setBgImage(url){
  labelImgs.BG = url || null;
  $('bgImg').dataset.empty = url ? 'Saved image' : '';
  if(!url){ scene.background = null; bgTex = bgImgEl = null; $('bgClear').hidden = true; ToolPersist.save(); return; }
  const img = new Image();
  img.onload = () => { bgImgEl = img; bgTex = new THREE.Texture(img); bgTex.encoding = THREE.sRGBEncoding; bgTex.needsUpdate = true;
    scene.background = bgTex; fitBg(); $('bgClear').hidden = false; ToolPersist.save(); };
  img.src = url;
}
$('bgImg').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => {
    const k = Math.min(1, 1600/Math.max(im.width, im.height)), c = document.createElement('canvas');
    c.width = Math.round(im.width*k); c.height = Math.round(im.height*k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    setBgImage(c.toDataURL('image/jpeg', 0.85));
  }; im.src = r.result; };
  r.readAsDataURL(f);
};
$('bgClear').onclick = () => { $('bgImg').value = ''; setBgImage(null); };

// Luces
$('bright').oninput = e => $('brv').textContent = (+e.target.value).toFixed(2);
// ---------- Lights: up to 3, placed on a "dome" pad ----------
// A light is a point (x, y) inside the unit circle as seen from the camera; z comes from the sphere, in front of the disc or behind it.
const LIGHT_DIST = 7;   // reference distance: intensity is the same as before when a light sits here
const mkLight = (x, y, back, i, dist, on) => ({x, y, back: !!back, i, dist, on: on !== false, color: '#ffffff'});
const PRESETS = {
  studio: [mkLight(.5, .6, 0, 1.5, 7), mkLight(-.7, -.1, 0, .7, 9), mkLight(0, .2, 1, 1.2, 8)],
  top:    [mkLight(0, .9, 0, 2, 6), mkLight(0, 0, 0, 1, 7, false), mkLight(0, 0, 1, 1, 7, false)],
  side:   [mkLight(.9, .1, 0, 2, 6), mkLight(0, 0, 0, 1, 7, false), mkLight(0, 0, 1, 1, 7, false)],
  rim:    [mkLight(-.5, .3, 1, 2.5, 8), mkLight(.5, .3, 1, 2.5, 8), mkLight(0, 0, 0, 1, 7, false)],
  drama:  [mkLight(.85, -.3, 0, 3, 4), mkLight(0, 0, 0, 1, 7, false), mkLight(-.6, .3, 1, 1, 8)]
};
const lights = [mkLight(.52, .68, 0, 1.5, 7), mkLight(-.52, -.68, 1, 1, 7, false), mkLight(-.7, .1, 0, 1, 7, false)];
let sel = 0, aimMode = false;
const pad = $('pad'), PAD_R = 0.42;   // the unit circle has a radius of 42% of the pad width
const lz = l => Math.sqrt(Math.max(0, 1 - l.x*l.x - l.y*l.y))*(l.back ? -1 : 1);
const dots = lights.map((l, k) => {
  const d = document.createElement('div'); d.className = 'lp-dot'; d.textContent = k + 1; pad.appendChild(d);
  d.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); selectLight(k); d.setPointerCapture(e.pointerId); d._drag = true; });
  d.addEventListener('pointermove', e => { if(d._drag) moveDot(k, e); });
  d.addEventListener('pointerup', () => { d._drag = false; ToolPersist.save(); });
  return d;
});
function moveDot(k, e){
  const r = pad.getBoundingClientRect(), R = r.width*PAD_R;
  let x = (e.clientX - (r.left + r.width/2))/R, y = -(e.clientY - (r.top + r.height/2))/R;
  const m = Math.hypot(x, y); if(m > 1){ x /= m; y /= m; }
  lights[k].x = x; lights[k].y = y; drawPad();
}
function drawPad(){
  lights.forEach((l, k) => {
    const d = dots[k];
    d.style.left = (50 + l.x*PAD_R*100) + '%'; d.style.top = (50 - l.y*PAD_R*100) + '%';
    d.style.background = l.color; d.classList.toggle('back', l.back); d.classList.toggle('off', !l.on); d.classList.toggle('sel', k === sel);
  });
}
function syncLightUI(){
  const l = lights[sel];
  $('lOn').checked = l.on; $('lBack').checked = l.back; $('lColor').value = l.color;
  $('lInt').value = l.i; $('liv').textContent = l.i.toFixed(2); $('lDist').value = l.dist; $('ldv').textContent = l.dist.toFixed(1);
  document.querySelectorAll('#lsel button').forEach((b, k) => b.classList.toggle('on', k === sel));
  drawPad();
}
function selectLight(k){ sel = k; syncLightUI(); }
document.querySelectorAll('#lsel button').forEach(b => b.onclick = () => selectLight(+b.dataset.l));
document.querySelectorAll('#lpre button').forEach(b => b.onclick = () => { PRESETS[b.dataset.p].forEach((l, k) => Object.assign(lights[k], l)); syncLightUI(); });
$('lOn').onchange = e => { lights[sel].on = e.target.checked; drawPad(); };
$('lBack').onchange = e => { lights[sel].back = e.target.checked; drawPad(); };
$('lColor').oninput = e => { lights[sel].color = e.target.value; drawPad(); };
$('lInt').oninput = e => { lights[sel].i = +e.target.value; $('liv').textContent = lights[sel].i.toFixed(2); };
$('lDist').oninput = e => { lights[sel].dist = +e.target.value; $('ldv').textContent = lights[sel].dist.toFixed(1); };
// dragging on the empty pad moves the selected light there
pad.addEventListener('pointerdown', e => { if(e.target !== pad && !e.target.classList.contains('lp-disc')) return; moveDot(sel, e); pad._drag = true; pad.setPointerCapture(e.pointerId); });
pad.addEventListener('pointermove', e => { if(pad._drag) moveDot(sel, e); });
pad.addEventListener('pointerup', () => { pad._drag = false; ToolPersist.save(); });

// "Place by clicking the disc": the highlight lands where you click (mirror reflection of the camera ray)
$('aim').onclick = () => { aimMode = !aimMode; $('aim').classList.toggle('on', aimMode); stage.style.cursor = aimMode ? 'crosshair' : ''; };
const raycaster = new THREE.Raycaster();
function aimAt(cx, cy){
  const r = stage.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((cx - r.left)/r.width)*2 - 1, -(((cy - r.top)/r.height)*2 - 1)), camera);
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(disc.quaternion), o = raycaster.ray.origin, dir = raycaster.ray.direction;
  const den = dir.dot(n); if(Math.abs(den) < 1e-3) return;
  const P = o.clone().addScaledVector(dir, -o.dot(n)/den);
  const V = camera.position.clone().sub(P).normalize(); if(V.dot(n) < 0) n.negate();
  const L = V.clone().negate().reflect(n).normalize();                    // direction from the disc towards the light
  lights[sel].x = L.x; lights[sel].y = L.y; lights[sel].back = L.z < 0; lights[sel].on = true;
  syncLightUI();
}

// ---------- Zoom (slider, +/- buttons, mouse wheel on the artwork) ----------
let zoomV = 1;
function setZoom(v){ zoomV = clamp(v, 0.3, 2.5); $('zoom').value = zoomV; $('zv').textContent = Math.round(zoomV*100) + '%'; }
$('zoom').oninput = e => setZoom(+e.target.value);
$('zIn').onclick = () => setZoom(zoomV*1.12);
$('zOut').onclick = () => setZoom(zoomV/1.12);
stage.addEventListener('wheel', e => { e.preventDefault(); setZoom(zoomV*Math.exp(-e.deltaY*0.0015)); ToolPersist.save(); }, {passive: false});

// ---------- Girar manteniendo el clic: se queda donde sueltas ----------
stage.addEventListener('pointerdown', e => {
  if(aimMode && style === 'real'){ dragging = true; aiming = true; aimAt(e.clientX, e.clientY); stage.setPointerCapture(e.pointerId); return; }
  dragging = true; recenter = false; lx = e.clientX; ly = e.clientY; stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', e => {
  if(!dragging) return;
  if(aiming){ aimAt(e.clientX, e.clientY); return; }
  const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
  userRy += dx*0.01;
  userRx = clamp(userRx + dy*0.01, -1.5, 1.5);   // stays exactly where the mouse stopped
});
let aiming = false;
const endDrag = () => { dragging = false; if(aiming){ aiming = false; ToolPersist.save(); } };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

// ---------- Labels: ONE image per side, used by every version (Realistic and Plain, vinyl and CD) ----------
const labelImgs = {F: null, B: null};   // downscaled data URLs, also what gets remembered
function setLabel(side, url){
  labelImgs[side] = url; $(side === 'F' ? 'fLabF' : 'fLabB').dataset.empty = url ? 'Saved image' : '';
  const img = new Image();
  img.onload = () => {
    const tex = srgb => { const t = new THREE.Texture(img); if(srgb) t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; return t; };
    const real = side === 'F' ? labelFrontMat : labelBackMat, plain = side === 'F' ? plainLabelFrontMat : plainLabelBackMat;
    real.map = tex(true); real.needsUpdate = true;                                     // vinyl label
    (side === 'F' ? cdFrontMat : cdBackMat).uniforms.uMap.value = tex(false);          // CD face
    plain.map = tex(true); plain.color.set(0xffffff); plain.transparent = true; plain.needsUpdate = true;   // plain label
    ToolPersist.save();
  };
  img.src = url;
}
function pickLabel(side){
  return e => {
    const f = e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = () => { const im = new Image(); im.onload = () => {
      const k = Math.min(1, 1024/Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width*k); c.height = Math.round(im.height*k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      setLabel(side, c.toDataURL('image/webp', 0.92));   // keeps transparency; small enough to remember
    }; im.src = r.result; };
    r.readAsDataURL(f);
  };
}
$('fLabF').onchange = pickLabel('F');
$('fLabB').onchange = pickLabel('B');

// ---------- Tamaño del escenario según el formato ----------
function layoutStage(){
  const [W, H] = RATIOS[RATIO_KEY], ar = W/H;
  stage.style.setProperty('--ar', ar);              // CSS sizes the artwork frame to fit the panel
  const w = stage.clientWidth, h = stage.clientHeight;
  if(!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = ar;
  // vertical formats: the disc must fit the width, so the camera moves back
  camera.position.z = Math.max(5.4, 1.4/(Math.tan(15*Math.PI/180)*ar));
  camera.updateProjectionMatrix(); fitBg();
}
new ResizeObserver(() => { if(!exporting) layoutStage(); }).observe(viewer);
layoutStage();

// ---------- Renderizado de un fotograma ----------
function applyLights(){
  const bright = style === 'plain' ? 1 : +$('bright').value;
  renderer.toneMappingExposure = bright; U.uExp.value = bright;
  let first = -1;
  lights.forEach((l, k) => {
    const sp = spots[k], d = l.dist || LIGHT_DIST; sp.visible = l.on; sp.color.set(l.color);
    sp.intensity = l.i*LIGHT_DIST/d;                    // farther = dimmer (inverse distance), nearer = brighter and harder
    sp.penumbra = 0.5; sp.angle = Math.PI/4; sp.position.set(l.x*d, l.y*d, lz(l)*d);
    if(l.on && first < 0) first = k;
  });
  // the CD's glint follows the first light that is on (or the key light if none)
  if(first >= 0){
    const l = lights[first]; U.uLight.value.copy(spots[first].position).normalize();
    U.uLightK.value = (l.i/1.5)*LIGHT_DIST/(l.dist || LIGHT_DIST); U.uLightCol.value.set(l.color);   // intensity, distance and color reach the CD glint too
  } else { U.uLight.value.set(2, 4, 5).normalize(); U.uLightK.value = 1; U.uLightCol.value.set(0xffffff); }
}
function renderAt(t){
  const p = pose(animName, t), spinning = spinOn;
  plainVinyl.userData.mark.visible = plainCD.userData.mark.visible = spinning && !plainLabelFrontMat.map;   // only on a blank label: with a front image the turning image already shows the spin
  disc.rotation.set(p.x + userRx, p.y + userRy, p.z);
  disc.scale.setScalar(zoomV);
  U.uCam.value.copy(camera.position);
  applyLights();
  renderer.render(scene, camera);
}

// ---------- Bucle de vista previa ----------
function frame(now){
  const dt = Math.min(0.1, (now - lastT)/1000); lastT = now;
  if(!exporting){
    if(animPlaying) tAnim += dt;
    if(recenter){ userRx *= 0.85; userRy *= 0.85; if(Math.abs(userRx) + Math.abs(userRy) < 0.002){ userRx = userRy = 0; recenter = false; } }
    renderAt(tAnim);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

syncLightUI();

// ---------- Remember the settings and the images between visits ----------
ToolPersist.init('disc-spin', {
  get: () => ({mode, style, anim: animName, spin: spinOn, ratio: RATIO_KEY, imgs: labelImgs, lights, sel, zoom: zoomV, seed: patSeed}),
  set: x => {
    if(x.mode) mode = x.mode; if(x.style) style = x.style; refresh();
    if(x.anim === 'girar'){ animName = 'frontal'; spinOn = true; }            // older saves: Playing was a movement of its own
    else if(x.anim && x.anim !== 'frontal' && PERIOD[x.anim]) animName = x.anim;
    if(x.spin === true) spinOn = true;
    if(x.anim || x.spin){ if(animName !== 'frontal' || spinOn){ animPlaying = true; $('pause').textContent = 'Pause'; } syncAnimUI(); }
    if(x.ratio){ const b = document.querySelector(`#ratios button[data-r="${x.ratio}"]`); if(b) b.click(); }
    if(x.lights){ x.lights.forEach((l, k) => { if(lights[k]) Object.assign(lights[k], l); }); selectLight(x.sel || 0); }
    if(x.zoom) setZoom(x.zoom);
    if(x.seed){ patSeed = (Math.abs(Math.floor(x.seed)) % 1000003) || 1; refreshFinish(true); }
    if(x.imgs){ if(x.imgs.F) setLabel('F', x.imgs.F); if(x.imgs.B) setLabel('B', x.imgs.B); if(x.imgs.BG) setBgImage(x.imgs.BG); }
  }
});

// ---------- Export loop (shared exporter) ----------
$('exp').onclick = async () => {
  if(exporting) return;
  const P = curPeriod(), FPS = +$('fps').value || 60, [W0, H0] = RATIOS[RATIO_KEY], Q = RATIO_KEY === 'custom' ? 1 : (+$('res').value || 1080)/1080, W = Math.round(W0*Q/2)*2, H = Math.round(H0*Q/2)*2, status = t => $('status').textContent = t;
  exporting = true; $('exp').disabled = true;
  try{
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    camera.aspect = W/H; camera.position.z = Math.max(5.4, 1.4/(Math.tan(15*Math.PI/180)*(W/H))); camera.updateProjectionMatrix(); fitBg();
    const out = await VideoExport.run({canvas, renderAt, period: P, fps: FPS, width: W, height: H, status});
    const name = `${mode}-${style}-${animName}${spinOn ? '-spin' : ''}-${RATIO_KEY === 'custom' ? W + 'x' + H : RATIO_KEY.replace(':','x')}.${out.ext}`;
    const result = await VideoExport.save(name, out.blob);
    const msgs = {saved: 'Done', declined: 'Download cancelled', unavailable: 'Downloads are not available in this view', rejected_extension: 'Format not allowed', too_large: 'The file is too large'};
    status(`${msgs[result] || 'Could not save'}: ${name} · ${W}×${H} · ${P} s loop · ${out.note}`);
  }catch(err){ status(err && err.message || 'Export failed'); }
  finally {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); layoutStage();
    exporting = false; $('exp').disabled = false;
  }
};
