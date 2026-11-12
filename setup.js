// HOLD4 + jigs + Keithley 2400 connection page (2026-11-12). three.js 0.160, CAD frame z-up (root rotated), units mm.
// Electrical numbers: hold_model.js (01_회로사양.md + sim.py). Computed values only, not measured on hardware.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeBoard, compute, CELLS, SHUNT_TXT, STATE_LABEL, VRAIL } from './hold_model.js';

const MAT = {
  pom: { color: 0x17181a, roughness: 0.55 }, pcb: { color: 0x141414, roughness: 0.45, clearcoat: 0.6 }, ss: { color: 0xc9ccd0, metalness: 1, roughness: 0.38 },
  chrome: { color: 0xe8eaec, metalness: 1, roughness: 0.08 }, black: { color: 0x0d0d0e, roughness: 0.42, clearcoat: 0.3 }, kapton: { color: 0xc8781e, roughness: 0.35, transparent: true, opacity: 0.85 },
  gold: { color: 0xd8b04a, metalness: 1, roughness: 0.28 }, steel: { color: 0xbfc3c8, metalness: 1, roughness: 0.32 }, brass: { color: 0xc9a45a, metalness: 1, roughness: 0.3 },
  tungsten: { color: 0x8d9095, metalness: 1, roughness: 0.25 }, nickel: { color: 0xd6d6d2, metalness: 1, roughness: 0.22 }, magnet: { color: 0xa0a2a6, metalness: 1, roughness: 0.3 },
  glass: { color: 0xa9d6e6, roughness: 0.05, transparent: true, opacity: 0.35 }, si: { color: 0x2b3240, metalness: 0.4, roughness: 0.25 }, toggle: { color: 0xc4262b, roughness: 0.5 },
  post_red: { color: 0xc01d1d, roughness: 0.4 }, post_black: { color: 0x1b1b1b, roughness: 0.4 }, post_green: { color: 0x1d8a3a, roughness: 0.4 }, nylon: { color: 0xe6e1d3, roughness: 0.6 }, misc: { color: 0x888888, roughness: 0.6 },
};
const matFor = (kind) => new THREE.MeshPhysicalMaterial({ ...(MAT[kind] || (kind[0] === '#' ? { color: parseInt(kind.slice(1), 16), roughness: 0.5 } : MAT.misc)), side: THREE.DoubleSide });
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xeef0f2);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-120, 300, 200); scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(150, 100, -200); scene.add(fill);
const camera = new THREE.PerspectiveCamera(35, 1, 5, 6000);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
const root = new THREE.Group(); root.rotation.x = -Math.PI / 2; scene.add(root);   // CAD z-up -> three y-up
const loader = new GLTFLoader();

// ---------- layout (CAD world, mm; z up; desk top z = 0) ----------
const BOARD_Z = 15;                         // 15 mm standoffs under the board (10 doc §6-4)
const BOARD_ORG = [-80, -50, BOARD_Z];      // board-local (kx-30, 130-ky) -> world
const POST_TOP = BOARD_Z + 1.6 + 12;        // assumed model head height 12 mm
const bw = (kx, ky, z = POST_TOP) => [kx - 110, 80 - ky, z];   // KiCad (kx, ky) -> world
const JIG_X = [-190, -90, 10, 110], JIG_Y = 125;                 // jig origin (front-left corner), posts face -y (toward the board)
const KEI = { x0: 175, yc: -60, w: 213, d: 358, h: 89 };         // Keithley 2400 outline (213 x 89 x 358, model), rear panel faces -x
const KJACK = { HI_F: [KEI.x0 - 14, KEI.yc + 30, 50], LO_F: [KEI.x0 - 14, KEI.yc + 8, 50], HI_S: [KEI.x0 - 14, KEI.yc - 14, 50], LO_S: [KEI.x0 - 14, KEI.yc - 36, 50], DIO: [KEI.x0 - 6, KEI.yc - 78, 40] };
const HUB = [-215, -30, 0], PC = [-330, -150, 0];
let FP = null, PATHS = null;
const fp = (ref) => FP[ref];
const fpw = (ref, z) => bw(fp(ref).x, fp(ref).y, z);

// ---------- helpers ----------
function textSprite(txt, { size = 26, color = '#222', bg = 'rgba(255,255,255,.85)' } = {}) {
  const cv = document.createElement('canvas'), g = cv.getContext('2d'); g.font = 'bold 36px Arial, "Malgun Gothic", sans-serif';
  const w = Math.ceil(g.measureText(txt).width) + 20; cv.width = w; cv.height = 56; g.font = 'bold 36px Arial, "Malgun Gothic", sans-serif';
  g.fillStyle = bg; g.fillRect(0, 0, w, 56); g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(txt, 10, 29);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  sp.scale.set(size * w / 56, size, 1); sp.renderOrder = 950; return sp;
}
function label(txt, pos, opt) { const s = textSprite(txt, opt); s.position.set(...pos); root.add(s); return s; }
function box(w, d, h, color, pos, opt = {}) {   // pos = centre x, y, bottom z
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), new THREE.MeshStandardMaterial({ color, roughness: opt.rough ?? 0.6, metalness: opt.metal ?? 0.1, transparent: !!opt.op, opacity: opt.op ?? 1 }));
  m.position.set(pos[0], pos[1], pos[2] + h / 2); root.add(m); return m;
}
function cyl(r, h, color, pos, axis = 'z') {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 }));
  if (axis === 'z') m.rotation.x = Math.PI / 2; else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(...pos); root.add(m); return m;
}

async function loadModel(id) {
  const [gltf, meta] = await Promise.all([loader.loadAsync(`models/${id}.glb`), fetch(`models/${id}_meta.json`).then((r) => r.json())]);
  const by = Object.fromEntries(meta.parts.map((p) => [p.id, p]));
  const matCache = {};
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const as = gltf.parser.associations.get(o), jn = as && as.nodes !== undefined ? gltf.parser.json.nodes[as.nodes] : null;
    const m = by[(jn && jn.name) || o.name]; if (!m) { o.visible = false; return; }
    o.geometry.computeVertexNormals(); o.material = matCache[m.kind] || (matCache[m.kind] = matFor(m.kind)); o.userData = { ...m };
  });
  for (const m of meta.parts.filter((p) => p.tex)) {
    const [x0, y0, x1, y1, zt] = m.rect, tex = await new THREE.TextureLoader().loadAsync(`models/${m.tex}`);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.45, clearcoat: 0.5 }));
    pl.position.set((x0 + x1) / 2, (y0 + y1) / 2, zt + 0.03); if (m.flip) pl.rotation.y = Math.PI; gltf.scene.add(pl);
  }
  return gltf.scene;
}

// ---------- flows: cables and current paths with moving dots ----------
const flows = [];          // {id, group, visible(), getI(), curve, dots, info()}
const pickables = [];
const NETCOL = { 'F+': 0xe53935, 'F−': 0x111111, 'S+': 0xff9800, 'S−': 0x9aa3ad, 'OE': 0x2e7d32, 'USB': 0x1565c0 };
const DOT = new THREE.SphereGeometry(1, 10, 8);
let flowGroup = new THREE.Group(); root.add(flowGroup);
function addFlow(o) {   // o: { pts[], net, r, overlay, poly, getI(), show(), dots, a, b, name }
  const pts = o.pts.map(V3);
  let curve;
  if (o.poly) { curve = new THREE.CurvePath(); for (let i = 1; i < pts.length; i++) if (pts[i].distanceTo(pts[i - 1]) > 1e-6) curve.add(new THREE.LineCurve3(pts[i - 1], pts[i])); }
  else curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
  const L = curve.getLength(); if (!(L > 0)) return null;
  const col = NETCOL[o.net] ?? 0x555555;
  const mat = o.overlay ? new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false })
                        : new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05, emissive: o.net === 'F−' ? 0x222222 : 0x000000 });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, Math.round(L / 6)), o.r, 8, false), mat);
  if (o.overlay) tube.renderOrder = 900;
  const grp = new THREE.Group(); grp.add(tube);
  const pickTube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, Math.round(L / 10)), Math.max(o.r * 2.2, 4), 5, false), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  grp.add(pickTube);
  const n = o.dots === false ? 0 : Math.max(3, Math.round(L / (o.overlay ? 14 : 24)));
  let inst = null;
  if (n) {
    inst = new THREE.InstancedMesh(DOT, new THREE.MeshBasicMaterial({ color: 0xffe14a, depthTest: false, depthWrite: false, transparent: true, opacity: 0.98 }), n);
    inst.frustumCulled = false; inst.renderOrder = 960; grp.add(inst);
  }
  flowGroup.add(grp);
  const f = { ...o, curve, L, n, inst, grp, tube, pickTube, rd: o.overlay ? o.r * 2.6 : o.r * 1.7, phase: 0 };
  pickTube.userData.flow = f; tube.userData.flow = f; flows.push(f); pickables.push(pickTube);
  return f;
}
function clearFlows() {
  for (const f of flows) { f.tube.geometry.dispose(); f.pickTube.geometry.dispose(); if (f.inst) f.inst.dispose(); }
  flows.length = 0; pickables.length = 0; flowGroup.removeFromParent(); flowGroup = new THREE.Group(); root.add(flowGroup);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function tickFlows(dt) {
  for (const f of flows) {
    const vis = f.show ? f.show() : true; f.grp.visible = vis; if (!vis || !f.inst) continue;
    const I = f.getI ? f.getI() : 0; const a = Math.abs(I);
    if (a < 5e-8) { f.inst.count = 0; continue; }
    f.inst.count = f.n;
    const v = (30 + 70 * Math.min(1, Math.log10(1 + a * 1e4) / 2.4)) / f.L;   // mm/s -> fraction/s, grows with |I| (log)
    f.phase = (f.phase + Math.sign(I) * v * dt + 1) % 1;
    for (let j = 0; j < f.n; j++) {
      let u = (f.phase + j / f.n) % 1; if (u < 0) u += 1;
      f.curve.getPointAt(u, _p); _s.set(f.rd, f.rd, f.rd); _m.compose(_p, _q, _s); f.inst.setMatrixAt(j, _m);
    }
    f.inst.instanceMatrix.needsUpdate = true;
  }
}

// ---------- state ----------
const st = { mode: 'open', k: 0, kind: 'T2P', light: 1, faults: [], req: null, t: 0, step: null, vForce: null };
let bd = makeBoard('T2P'), res = compute(bd, st);
const lampOn = () => (st.step !== null && st.step < 4 ? 0 : st.light);
function recompute() { bd = bd.kind === st.kind ? bd : makeBoard(st.kind); const sv = st.light; st.light = lampOn(); res = compute(bd, st); st.light = sv; }
const nets = ['F+', 'S+', 'F−', 'S−'];

// ---------- scene content ----------
let boardGrp, jigProto = {}, jigGroups = [], lampBoxes = [], faultMarks = [];
function buildStatic() {
  // desk + grid
  box(1100, 760, 8, 0xd9d2c4, [90, -20, -8], { rough: 0.9 });
  // Keithley 2400 (box model) with rear terminals and DB-9
  const kb = box(KEI.d, KEI.w, KEI.h, 0xcfd3d6, [KEI.x0 + KEI.d / 2, KEI.yc, 0], { rough: 0.5, metal: 0.3 });
  box(6, KEI.w - 10, KEI.h - 10, 0x2b2f33, [KEI.x0 + KEI.d + 0.5, KEI.yc, 5]);                 // front panel plate
  box(4, 90, 30, 0x0f1d12, [KEI.x0 + KEI.d + 3, KEI.yc + 30, 45]);                              // display
  [['HI_F', 0xc01d1d], ['LO_F', 0x1b1b1b], ['HI_S', 0xc01d1d], ['LO_S', 0x1b1b1b]].forEach(([n, c]) => { const p = KJACK[n]; cyl(5.5, 14, c, [p[0] + 7, p[1], p[2]], 'x'); });
  box(8, 38, 14, 0x555a60, [KEI.x0 - 4, KEJ_DIO()[1], 33]);                                      // DB-9 (DIGITAL I/O)
  [['FRONT FORCE/SENSE 단자(안 씀)', [KEI.x0 + KEI.d + 24, KEI.yc, 105]]].forEach(([t, p]) => label(t, p, { size: 9, color: '#666' }));
  label('키슬리 2400 (상자 모형, 뒷면 단자 사용)', [KEI.x0 + 170, KEI.yc, 110], { size: 14 });
  label('FORCE HI', [KJACK.HI_F[0] - 24, KJACK.HI_F[1], 62], { size: 7 }); label('FORCE LO', [KJACK.LO_F[0] - 24, KJACK.LO_F[1], 62], { size: 7 });
  label('SENSE HI', [KJACK.HI_S[0] - 24, KJACK.HI_S[1], 62], { size: 7 }); label('SENSE LO', [KJACK.LO_S[0] - 24, KJACK.LO_S[1], 62], { size: 7 });
  label('DIGITAL I/O (DB-9)', [KEI.x0 - 40, KEJ_DIO()[1], 62], { size: 7 });
  // PC + monitor + USB hub (box models)
  box(190, 190, 70, 0x40454b, [PC[0], PC[1], 0]); box(260, 18, 160, 0x20252a, [PC[0], PC[1] - 120, 40]); box(30, 30, 40, 0x40454b, [PC[0], PC[1] - 120, 0]);
  label('PC (상자 모형)', [PC[0], PC[1], 110], { size: 14 });
  box(130, 62, 22, 0x2e3a4a, [HUB[0], HUB[1], 0]); for (let i = 0; i < 4; i++) box(14, 4, 7, 0x111, [HUB[0] - 45 + i * 22, HUB[1] + 31, 8]);
  box(38, 24, 26, 0x222, [HUB[0] - 100, HUB[1] + 70, 0]);
  label('유전원 USB 허브 (상자 모형)', [HUB[0], HUB[1] + 20, 50], { size: 7 });
  label('유지판 O9C_HOLD4 rev C2', [0, -62, 40], { size: 8 });
  // standoffs + acrylic plate under the board (doc §6-4)
  box(164, 104, 3, 0xcfe3ee, [0, 0, 0], { op: 0.55 });
  for (const sx of [-76, 76]) for (const sy of [-46, 46]) cyl(3, BOARD_Z - 3, 0xb0b4b8, [sx, sy, 3 + (BOARD_Z - 3) / 2]);
}
const KEJ_DIO = () => KJACK.DIO;

async function buildBoard() {
  const g = await loadModel('HOLD4'); g.position.set(...BOARD_ORG); root.add(g); boardGrp = g;
}
async function ensureJigProto(kind) {
  if (jigProto[kind]) return jigProto[kind];
  const g = await loadModel(kind === 'T2P' ? 'T2P-L-pin' : 'S22__SC_1p1');
  const bb = new THREE.Box3().setFromObject(g); jigProto[kind] = { g, zoff: -bb.min.z };
  return jigProto[kind];
}
async function buildJigs() {
  for (const j of jigGroups) j.removeFromParent(); jigGroups = []; for (const l of lampBoxes) l.removeFromParent(); lampBoxes = [];
  const { g, zoff } = await ensureJigProto(st.kind);
  JIG_X.forEach((x0, i) => {
    const c = g.clone(true); c.position.set(x0, JIG_Y, zoff); root.add(c); jigGroups.push(c);
    const wl = label(`CH${i + 1} ${st.kind === 'T2P' ? 'T2P' : 'S22'} 지그`, [x0 + 40, JIG_Y + 60, 60], { size: 12 }); jigGroups.push(wl);
    // lamp zone over the cell only (jig side)
    const lb = box(70, 70, 110, 0xffd54a, [x0 + 40, JIG_Y + 94, 24], { op: 0.0 }); lb.material.depthWrite = false; lb.userData.lamp = true; lampBoxes.push(lb);
    const lt = label(i === 0 ? '조명 구역(지그 쪽만)' : '', [x0 + 40, JIG_Y + 94, 150], { size: 11, color: '#8a6d00' }); lampBoxes.push(lt);
  });
  buildJigInfo = { zoff };
}
let buildJigInfo = { zoff: 0 };
const jigPostLocal = { T2P: { FORCE_HI: [10.005, 12.7, 24], FORCE_LO: [29.055, 12.7, 24], SENSE_HI: [48.105, 12.7, 24], SENSE_LO: [67.155, 12.7, 24] },
                       S22: { ANODE: [12.005, 12.7, 24], CATH: [31.055, 12.7, 24] } };
const jigPost = (i, name) => { const p = jigPostLocal[st.kind][name]; return [JIG_X[i] + p[0], JIG_Y + p[1], buildJigInfo.zoff + p[2] - 2]; };

function internalRoute(kind, net, last) {   // copper route from the jig paths file that ends at the given post
  const m = PATHS[kind === 'T2P' ? 'T2P-L-pin' : 'S22__SC_1p1'];
  const post = jigPostLocal[kind][last];
  return m.paths.find((p) => p.net === net && Math.hypot(p.pts[p.pts.length - 1][0] - post[0], p.pts[p.pts.length - 1][1] - post[1]) < 0.5)?.pts;
}

// ---------- build all flows (cables + current paths) for the current kind / faults ----------
function chRes(c) { return res.ch[c]; }
const iSigned = (c) => { const o = chRes(c); return o.mode === 'handover' ? o.i2400 : o.i; };
const wiresOf = (kind) => kind === 'T2P' ? ['F+', 'S+', 'F−', 'S−'] : ['F+', 'F−'];
function visGroup(g) { return () => st.step === null || { usb: st.step >= 1, kei: st.step >= 2, oe: st.step >= 2, jig: st.step >= 3 }[g]; }

function buildFlows() {
  clearFlows(); faultMarks.forEach((m) => m.removeFromParent()); faultMarks = [];
  const kind = st.kind, Z = POST_TOP + 5;
  const boardPost = { 'F+': (k) => `J${k + 1}1`, 'S+': (k) => `J${k + 1}2`, 'F−': (k) => `J${k + 1}3`, 'S−': (k) => `J${k + 1}4` };
  for (let c = 0; c < 4; c++) {
    const rev = st.faults.some((f) => f.ch === c && f.type === 'rev'), smin = st.faults.some((f) => f.ch === c && f.type === 'sminus');
    // jig post used by each board net (REV lever down, doc 10 §6-1): board F+ <- FORCE_LO, S+ <- SENSE_LO, F- <- FORCE_HI, S- <- SENSE_HI; red-to-red swaps F+/F- and S+/S-
    const jigName = kind === 'T2P'
      ? (rev ? { 'F+': 'FORCE_HI', 'S+': 'SENSE_HI', 'F−': 'FORCE_LO', 'S−': 'SENSE_LO' } : { 'F+': 'FORCE_LO', 'S+': 'SENSE_LO', 'F−': 'FORCE_HI', 'S−': 'SENSE_HI' })
      : (rev ? { 'F+': 'CATH', 'F−': 'ANODE' } : { 'F+': 'ANODE', 'F−': 'CATH' });
    for (const net of wiresOf(kind)) {
      if (net === 'S−' && smin) {
        const bp = fpw(boardPost[net](c), POST_TOP); const mk = label('S− 빠짐 ✕', [bp[0], bp[1] - 10, bp[2] + 16], { size: 12, color: '#b71c1c' }); faultMarks.push(mk); continue;
      }
      const a = jigPost(c, jigName[net]), bpt = fpw(boardPost[net](c), POST_TOP - 3);
      const lift = 28 + c * 6 + (net[0] === 'S' ? 10 : 0);
      const mid = [(a[0] + bpt[0]) / 2, (a[1] + bpt[1]) / 2, 6 + (net[0] === 'S' ? 3 : 0)];
      const isF = net[0] === 'F', sign = net === 'F+' ? 1 : (net === 'F−' ? -1 : 0);
      // positive current direction: F+ cable jig -> board, F- cable board -> jig (cell current flows out of the cell + terminal)
      const pts = net === 'F−' ? [bpt, [bpt[0], bpt[1], bpt[2] + 12], mid, [a[0], a[1], a[2] + lift], a] : [a, [a[0], a[1], a[2] + lift], mid, [bpt[0], bpt[1], bpt[2] + 12], bpt];
      const ends = net === 'F−' ? [`유지판 ${boardPost[net](c)} (${net})`, `지그 ${c + 1} ${jigName[net]}`] : [`지그 ${c + 1} ${jigName[net]}`, `유지판 ${boardPost[net](c)} (${net})`];
      addFlow({ pts, net, r: 1.3, a: ends[0], b: ends[1], kind: 'cable', ch: c, show: visGroup('jig'), name: `CH${c + 1} ${net} 선`,
        getI: () => (isF ? iSigned(c) : 0) * (rev && isF ? 1 : 1) });
      void sign;
    }
    // copper route inside the jig (cell terminal -> post), from models/paths.json
    if (kind === 'T2P') {
      const rp = internalRoute('T2P', 'REAR_F', 'FORCE_LO'), fp2 = internalRoute('T2P', 'FRONT_F', 'FORCE_HI');
      const ox = JIG_X[c], oy = JIG_Y, oz = buildJigInfo.zoff;
      if (rp) addFlow({ pts: rp.map((p) => [ox + p[0], oy + p[1], oz + p[2] + 1]), net: 'F+', r: 0.6, overlay: true, poly: true, a: '셀 뒷면(+) 핀 REAR_F', b: `지그 ${c + 1} FORCE_LO`, name: `CH${c + 1} 지그 안 구리 REAR_F`, show: visGroup('jig'), getI: () => iSigned(c) });
      if (fp2) addFlow({ pts: fp2.map((p) => [ox + p[0], oy + p[1], oz + p[2] + 1]).reverse(), net: 'F−', r: 0.6, overlay: true, poly: true, a: `지그 ${c + 1} FORCE_HI`, b: '셀 앞면(−) 바늘 FRONT_F', name: `CH${c + 1} 지그 안 구리 FRONT_F`, show: visGroup('jig'), getI: () => iSigned(c) });
    } else {
      const ox = JIG_X[c], oy = JIG_Y, oz = buildJigInfo.zoff, tr = (p) => [ox + p[0], oy + p[1], oz + p[2] + 1];
      const aNode = internalRoute('S22', 'ANODE', 'ANODE'), cNode = internalRoute('S22', 'CATH', 'CATH');
      const comRoute = PATHS['S22__SC_1p1'].paths.find((p) => p.net === 'COM');
      const p1 = PATHS['S22__SC_1p1'].paths.find((p) => p.net === 'P1');
      if (aNode) addFlow({ pts: [...(comRoute ? comRoute.pts : []), ...aNode].map(tr), net: 'F+', r: 0.6, overlay: true, poly: true, a: '화소 공통 ITO(+) 핀', b: `지그 ${c + 1} Anode`, name: `CH${c + 1} 지그 안 Anode`, show: visGroup('jig'), getI: () => iSigned(c) });
      if (cNode) addFlow({ pts: [...(p1 ? p1.pts : []), ...cNode].map(tr).reverse(), net: 'F−', r: 0.6, overlay: true, poly: true, a: `지그 ${c + 1} Cathode`, b: '화소 핀 P1(−)', name: `CH${c + 1} 지그 안 Cathode`, show: visGroup('jig'), getI: () => iSigned(c) });
    }
    // current paths on the board (schematic polylines at post-head height)
    const P = (ref, z = Z) => fpw(ref, z), j1 = P(`J${c + 1}1`), j3 = P(`J${c + 1}3`), j2 = P(`J${c + 1}2`), j4 = P(`J${c + 1}4`);
    const q1 = P(`Q${c + 1}1`, Z - 2), r1 = P(`R${c + 1}01`, Z - 2), kf = P(`K${c + 1}F`, Z - 2), ks = P(`K${c + 1}S`, Z - 2), kp = P(`K${c + 1}P`, Z - 2);
    const hi = fpw('J3', Z), lo = fpw('J4', Z), shi = fpw('J5', Z), slo = fpw('J6', Z);
    const man = (a, b) => [a, [a[0], b[1], a[2]], b];   // Manhattan leg
    const holdVis = () => { const o = chRes(c); return (o.mode === 'hold' || o.mode === 'short' || o.mode === 'blocked') && (st.step === null || st.step >= 5); };
    addFlow({ pts: [...man(j1, r1), ...man(r1, q1).slice(1), ...man(q1, j3).slice(1)], net: 'F+', r: 0.55, overlay: true, poly: true, dots: true, a: `유지판 J${c + 1}1 (F+, 레일 VP)`, b: `유지판 J${c + 1}3 (F−, N)`,
      name: `CH${c + 1} 유지 고리: F+ → R${c + 1}01·션트 → Q${c + 1}1 FET → F−`, show: holdVis, getI: () => chRes(c).ish, board: true });
    const hoVis = () => chRes(c).mode === 'handover';
    addFlow({ pts: [...man(j1, hi)], net: 'F+', r: 0.55, overlay: true, poly: true, a: `유지판 J${c + 1}1 (F+)`, b: '유지판 J3 (FORCE HI, 레일)', name: `CH${c + 1} 인계: F+ → FORCE HI 포스트`, show: hoVis, getI: () => chRes(c).i2400, board: true });
    addFlow({ pts: [...man(lo, kf), ...man(kf, j3).slice(1)], net: 'F−', r: 0.55, overlay: true, poly: true, a: '유지판 J4 (FORCE LO, KFL)', b: `유지판 J${c + 1}3 (F−, N)`, name: `CH${c + 1} 인계: FORCE LO → K${c + 1}F → F−`, show: hoVis, getI: () => chRes(c).i2400, board: true });
    addFlow({ pts: [...man(shi, kp), ...man(kp, j2).slice(1)], net: 'S+', r: 0.4, overlay: true, poly: true, a: '유지판 J5 (SENSE HI)', b: `유지판 J${c + 1}2 (S+)`, name: `CH${c + 1} 인계: SENSE HI → K${c + 1}P → S+ (감지, 전류 ≈ 0)`, show: hoVis, getI: () => 0, board: true });
    addFlow({ pts: [...man(slo, ks), ...man(ks, j4).slice(1)], net: 'S−', r: 0.4, overlay: true, poly: true, a: '유지판 J6 (SENSE LO)', b: `유지판 J${c + 1}4 (S−)`, name: `CH${c + 1} 인계: SENSE LO → K${c + 1}S → S− (감지, 전류 ≈ 0)`, show: hoVis, getI: () => 0, board: true });
  }
  // terminals you can tap: board posts, jig posts, Keithley jacks
  const addTerm = (pos, name, net, ch) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(...pos); m.userData.flow = { name, net, a: name, b: '', kind: 'term', ch, getI: () => ((net === 'F+' || net === 'F−') ? (ch !== undefined ? iSigned(ch) : (res.glob.sel === null ? 0 : iSigned(res.glob.sel))) : 0) };
    flowGroup.add(m); pickables.push(m);
  };
  for (let c = 0; c < 4; c++) {
    nets.forEach((net, n) => { addTerm(fpw(`J${c + 1}${n + 1}`, POST_TOP), `유지판 J${c + 1}${n + 1} 포스트 CH${c + 1} ${net} (${n < 2 ? 'RED' : 'BLACK'})`, net, c); });
    if (kind === 'T2P') Object.keys(jigPostLocal.T2P).forEach((nm) => addTerm(jigPost(c, nm), `지그 ${c + 1} ${nm} 포스트`, nm.startsWith('FORCE') ? (nm === 'FORCE_LO' ? 'F+' : 'F−') : (nm === 'SENSE_LO' ? 'S+' : 'S−'), c));
    else Object.keys(jigPostLocal.S22).forEach((nm) => addTerm(jigPost(c, nm), `지그 ${c + 1} ${nm === 'ANODE' ? 'Anode(ITO, +)' : 'Cathode(화소, −)'} 포스트`, nm === 'ANODE' ? 'F+' : 'F−', c));
  }
  [['J3', 'FORCE HI (레일)', 'F+'], ['J4', 'FORCE LO (KFL)', 'F−'], ['J5', 'SENSE HI (KSH)', 'S+'], ['J6', 'SENSE LO (KSL)', 'S−']].forEach(([r, nm, net]) => addTerm(fpw(r, POST_TOP), `유지판 ${r} 키슬리 ${nm}`, net));
  Object.entries({ HI_F: ['FORCE HI', 'F+'], LO_F: ['FORCE LO', 'F−'], HI_S: ['SENSE HI', 'S+'], LO_S: ['SENSE LO', 'S−'] }).forEach(([k2, [nm, net]]) => addTerm(KJACK[k2], `2400 뒷면 ${nm} 단자`, net));
  // Keithley cables (rear terminals) and /OE, USB
  const handed = () => res.glob.sel;
  const jk = (n) => KJACK[n];
  const keiPts = (post, jack, dy) => { const a = fpw(post, POST_TOP - 3), b = jack; return [a, [a[0], a[1], a[2] + 14], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + dy, 8], [b[0] - 12, b[1], b[2] + 8], [b[0] - 4, b[1], b[2]]]; };
  const kv = visGroup('kei'), iK = () => (res.glob.sel === null ? 0 : chRes(res.glob.sel).i2400);
  addFlow({ pts: keiPts('J3', jk('HI_F'), 0), net: 'F+', r: 1.3, a: '유지판 J3 FORCE HI(RED)', b: '2400 뒷면 FORCE HI', name: '2400 FORCE HI 선', kind: 'cable', show: kv, getI: iK });
  addFlow({ pts: keiPts('J4', jk('LO_F'), 4).reverse(), net: 'F−', r: 1.3, a: '2400 뒷면 FORCE LO', b: '유지판 J4 FORCE LO(BLACK)', name: '2400 FORCE LO 선', kind: 'cable', show: kv, getI: iK });
  addFlow({ pts: keiPts('J5', jk('HI_S'), 8), net: 'S+', r: 1.1, a: '유지판 J5 SENSE HI(RED)', b: '2400 뒷면 SENSE HI', name: '2400 SENSE HI 선', kind: 'cable', show: kv, getI: () => 0 });
  addFlow({ pts: keiPts('J6', jk('LO_S'), 12), net: 'S−', r: 1.1, a: '2400 뒷면 SENSE LO', b: '유지판 J6 SENSE LO(BLACK)', name: '2400 SENSE LO 선', kind: 'cable', show: kv, getI: () => 0 });
  const j2a = fpw('J2', BOARD_Z + 6), p7 = [fp('J2').x + fp('J2').pads['7'][0] - 110, 80 - (fp('J2').y + fp('J2').pads['7'][1]), BOARD_Z + 4], p8 = [fp('J2').x + fp('J2').pads['8'][0] - 110, 80 - (fp('J2').y + fp('J2').pads['8'][1]), BOARD_Z + 4]; void j2a;
  const dio = KJACK.DIO;
  addFlow({ pts: [p7, [p7[0], p7[1], p7[2] + 10], [(p7[0] + dio[0]) / 2, (p7[1] + dio[1]) / 2 + 3, 6], [dio[0] - 10, dio[1] + 4, dio[2] - 2], [dio[0] - 3, dio[1] + 4, dio[2]]], net: 'OE', r: 0.9, dots: false, a: '유지판 J2 7번 OE_A', b: '2400 DB-9 8번 /OE', name: '/OE 선 (7번 ↔ 8번 핀)', kind: 'oe', show: visGroup('oe'), getI: () => 0 });
  addFlow({ pts: [p8, [p8[0], p8[1], p8[2] + 10], [(p8[0] + dio[0]) / 2, (p8[1] + dio[1]) / 2 - 3, 6], [dio[0] - 10, dio[1] - 4, dio[2] - 2], [dio[0] - 3, dio[1] - 4, dio[2]]], net: 'OE', r: 0.9, dots: false, a: '유지판 J2 8번 OE_B', b: '2400 DB-9 9번 GND', name: '/OE 선 (8번 ↔ 9번 핀)', kind: 'oe', show: visGroup('oe'), getI: () => 0 });
  const usbB = bw(fp('J1').x - 3.65, fp('J1').y, BOARD_Z + 3.4);
  addFlow({ pts: [usbB, [usbB[0] - 14, usbB[1], usbB[2] + 2], [HUB[0] + 50, HUB[1] + 36, 18], [HUB[0] + 40, HUB[1] + 30, 14]], net: 'USB', r: 1.5, dots: true, a: '유지판 USB-C J1', b: 'USB 허브 포트', name: 'USB-C ↔ 허브 (5 V + 데이터)', kind: 'usb', show: visGroup('usb'), getI: () => 0.001 });
  addFlow({ pts: [[HUB[0] - 35, HUB[1] + 31, 8], [HUB[0] - 60, HUB[1] + 70, 12], [PC[0] + 60, PC[1] + 60, 25], [PC[0] + 60, PC[1] + 96, 28]], net: 'USB', r: 1.5, dots: true, a: 'USB 허브 업스트림', b: 'PC USB 포트', name: '허브 ↔ PC (USB)', kind: 'usb', show: visGroup('usb'), getI: () => 0.001 });
}

// ---------- DOM: tables ----------
const $ = (id) => document.getElementById(id);
const f2 = (x, d = 2) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : x.toFixed(d));
const mA = (i) => `${f2(i * 1e3, Math.abs(i) < 5e-3 ? 3 : 2)}`;
const FETTXT = { off: '꺼짐', reg: '조절 중', on: '완전 켜짐' };
const MODE_TXT = { open: '개방', hold: '유지', handover: '2400 인계', short: '단락', blocked: '켜지 않음' };
function renderTable() {
  const g = res.glob;
  const gl = `<div class="g">SEL_EN <b>${g.selEn}</b> · 디코더 ${g.sel === null ? '선택 없음(SELG 모두 L)' : `<b>SELG${g.sel + 1}</b>만 H`} · K0(/OE 접점) <b>${g.k0 ? '닫힘' : '열림'}</b> → 2400 /OE = ${g.oe} · 2400 출력 <b>${g.out2400 ? '켜짐 (J–V 중)' : '꺼짐'}</b></div>`;
  let h = gl + '<table class="t"><tr><th>CH</th><th>상태</th><th>K·F</th><th>K·S</th><th>K·P</th><th>Q1 FET</th><th>적분기</th><th>션트</th><th>DAC 목표</th><th>V_cell</th><th>I (mA)</th><th>P (mW)</th><th>ADC V쌍</th><th>ADC I쌍</th></tr>';
  for (const o of res.ch) {
    const cl = (b) => (b ? '<b class="on">닫힘</b>' : '열림');
    const ih = o.mode === 'handover' ? `${mA(o.i2400)}<small> (2400)</small>` : mA(o.i);
    const adcI = o.mode === 'handover' ? '0 (FET 꺼짐)' : `${f2(o.adcIm, 1)} mV → ${mA(o.ish)} mA`;
    h += `<tr class="${o.mode}"><td><b>${o.c + 1}</b>${o.faults.length ? ' ⚠' : ''}</td><td>${MODE_TXT[o.mode]}</td><td>${cl(o.relays.F)}</td><td>${cl(o.relays.S)}</td><td>${cl(o.relays.P)}</td>
      <td>${FETTXT[o.fet]}</td><td>${o.integ === 'stop' ? '정지' : '동작'}</td><td>${SHUNT_TXT[o.shunt]}</td>
      <td>${f2(o.dacV, 3)} V<small> /${o.dacCode}${o.gain === 2 ? ' ×2' : ''}</small></td><td>${f2(o.v, 3)} V</td><td>${ih}</td><td>${f2(o.p * 1e3, 2)}</td><td>${f2(o.adcV, 3)} V</td><td>${adcI}</td></tr>`;
  }
  $('tab').innerHTML = h + '</table>';
  const gn = new Map(); for (const o of res.ch) { const k2 = o.note + (o.mode === 'blocked' ? '#b' : ''); if (!gn.has(k2)) gn.set(k2, []); gn.get(k2).push(o); }
  $('note').innerHTML = [...gn.values()].map((os) => `<div class="n${os[0].mode === 'blocked' ? ' bad' : ''}"><b>CH${os.map((o) => o.c + 1).join('·')}</b> ${os[0].note}</div>`).join('') +
    `<div class="n">V_cell = ${VRAIL} V − V_DAC (유지 목표 ${f2(VRAIL - bd.dacMpp, 3)} V = Vmpp, 빛 세기와 무관). ${bd.cp.name}. 감지선(S+·S−) 전류 ≈ 0.</div>`;
  const parts = [st.mode === 'handover' ? `CH${g.sel + 1} 인계 · J–V (스윕 V ${f2(res.ch[g.sel].v, 2)} V)` : STATE_LABEL[st.mode]];
  if (g.ignored !== null && g.ignored !== undefined) parts.push(`CH${g.ignored + 1} 요청은 무시됨(디코더 한 채널만)`);
  $('stat').textContent = parts.join(' · ') + `  |  빛 ${Math.round(lampOn() * 100)} %`;
}
function faultMsg() {
  const out = [];
  for (const f of st.faults) {
    const o = res.ch[f.ch];
    if (f.type === 'rev') out.push(`CH${f.ch + 1} 빨강–빨강(REV 레버 아래, 극성 반대): Voc 창 검사에서 V 쌍 ${f2(o.adcV, 2)} V < 0 → "극성 반대" 경보, 채널을 켜지 않음(FET 꺼짐·DAC 0). 셀은 FET 몸체 다이오드로만 닫혀 0.5–0.7 V 부하, 바이어스 없음(01 §7). 선을 바꿔 꽂으면 해결.`);
    if (f.type === 'sminus') out.push(`CH${f.ch + 1} S− 빠짐: 감지선이 R${f.ch + 1}05 1 kΩ으로 보드 N 마디에 대체 연결 → 유지 계속(2선 값). ADC V 쌍에 F− 선 강하(0.1 Ω × I = ${f2(0.1 * Math.abs(o.i) * 1e3, 1)} mV)가 포함돼 읽음 ${f2(o.adcV, 3)} V (01 §3).`);
  }
  if (st.req) out.push(`CH${st.req[0] + 1}·CH${st.req[1] + 1} 동시 인계 요청: 74HC238 디코더는 SELG 한 개만 H → 마지막으로 쓴 주소(CH${st.req[1] + 1})만 연결, CH${st.req[0] + 1}은 유지 그대로. SEL_EN을 끄고 주소를 바꾸는 5 ms 빈 시간이 겹침을 막음(01 §5-3, §7).`);
  $('fault').innerHTML = out.join('<br>');
  $('fault').classList.toggle('hide', !out.length);
}

// ---------- UI wiring ----------
const STEPTXT = ['', '① USB: 자체 전원 허브를 켠 뒤 허브 ↔ 유지판 USB-C, PC ↔ 허브. 전원 LED만 켜짐(채널 LED는 꺼짐).',
  '② 2400 출력은 꺼 둔 채: 뒷면 FORCE·SENSE 4선 → J3–J6, DB-9 8·9번 /OE → J2 7·8번.',
  '③ 지그 4선(채널마다): 지그 FORCE_LO → F+, SENSE_LO → S+, FORCE_HI → F−, SENSE_HI → S− (REV 레버 아래, 빨강-빨강 아님).',
  '④ 조명 켬(지그 쪽만): 셀에 Voc가 생김. 아직 개방(DAC 0).',
  '⑤ 프로그램 시작: Voc 창 검사 통과 → DAC를 내려 4채널 모두 Vmpp 유지.'];
function setMode(m, k = st.k) {
  st.mode = m; st.k = k; st.step = null; st.req = null; recompute(); refresh();
  document.querySelectorAll('#states button').forEach((b) => b.classList.toggle('on', b.dataset.m === m && (m !== 'handover' || +b.dataset.k === k)));
  document.querySelectorAll('#steps button').forEach((b) => b.classList.remove('on')); $('steptext').textContent = '';
}
function setStep(n) {
  st.step = n; st.req = null; st.faults = st.faults; st.mode = n >= 5 ? 'hold' : 'open';
  recompute(); refresh(); buildFlows();
  document.querySelectorAll('#states button').forEach((b) => b.classList.remove('on'));
  document.querySelectorAll('#steps button').forEach((b) => b.classList.toggle('on', +b.dataset.n === n));
  $('steptext').textContent = STEPTXT[n];
}
function refresh() { renderTable(); faultMsg(); lampUpdate(); }
function lampUpdate() { const l = lampOn(); for (const b of lampBoxes) if (b.userData.lamp) b.material.opacity = l > 0 ? 0.04 + 0.12 * Math.min(1.2, l) / 1.2 : 0; }

const sel = $('chsel');
$('states').innerHTML = [['open', '개방'], ['hold', '4채널 MPP 유지'], ['handover', '1', 0], ['handover', '2', 1], ['handover', '3', 2], ['handover', '4', 3], ['gap', '인계 전환 중'], ['short', '단락 노화']]
  .map(([m, t, k]) => `<button data-m="${m}" ${k !== undefined ? `data-k="${k}"` : ''}>${k !== undefined ? 'CH' + t + ' 인계·J–V' : t}</button>`).join('');
$('states').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.m === 'handover') st.faults = st.faults; setMode(b.dataset.m, b.dataset.k !== undefined ? +b.dataset.k : st.k); };
$('steps').innerHTML = [1, 2, 3, 4, 5].map((n) => `<button data-n="${n}">${n}</button>`).join('') + '<button data-n="0">전체</button>';
$('steps').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; const n = +b.dataset.n; if (n === 0) { setMode(st.mode === 'open' ? 'hold' : st.mode); buildFlows(); } else setStep(n); };
$('light').oninput = (e) => { st.light = +e.target.value / 100; $('lightv').textContent = e.target.value + ' %'; recompute(); refresh(); };
$('kind').onclick = async (e) => { const b = e.target.closest('button'); if (!b) return; st.kind = b.dataset.k; document.querySelectorAll('#kind button').forEach((x) => x.classList.toggle('on', x === b));
  st.faults = []; await buildJigs(); recompute(); buildFlows(); refresh(); };
$('faults').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return; const c = +sel.value, t = b.dataset.f; st.step = null;
  document.querySelectorAll('#steps button').forEach((x) => x.classList.remove('on')); $('steptext').textContent = '';
  if (t === 'clear') { st.faults = []; st.req = null; if (st.mode === 'handover') st.mode = 'hold'; }
  else if (t === 'double') { const a = c, bb = (c + 1) % 4; st.req = [a, bb]; st.mode = 'handover'; st.k = bb; }
  else if (st.kind === 'S22' && t === 'sminus') { st.req = null; recompute(); refresh(); $('fault').innerHTML = 'S22·SB4 수동판은 S 선이 없음(2선): S+·S−는 항상 R×06·R×05 1 kΩ으로 보드 N·VP에 대체 연결되어 있고, ADC 읽음에 F 선 강하가 들어간다(01 §3). 4선 T2P로 바꾸면 S− 빠짐을 볼 수 있음.'; $('fault').classList.remove('hide'); return; }
  else { st.req = null; if (!st.faults.some((f) => f.ch === c && f.type === t)) st.faults.push({ ch: c, type: t }); if (st.mode === 'open') st.mode = 'hold'; }
  if (st.kind === 'S22' && t === 'sminus') { /* S22 has no S wires */ }
  recompute(); buildFlows(); refresh();
  document.querySelectorAll('#states button').forEach((x) => x.classList.toggle('on', x.dataset.m === st.mode && (st.mode !== 'handover' || +x.dataset.k === st.k)));
};
['ctlh', 'tabh'].forEach((id) => { $(id).onclick = () => $(id).parentElement.classList.toggle('min'); });
$('views').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; view(b.dataset.v); };
const VIEWS = { all: [[40, -820, 760], [40, 60, 10]], board: [[0, -230, 250], [0, 0, 25]], jig: [[0, -60, 380], [0, 190, 20]], kei: [[330, -330, 260], [330, -60, 30]], pc: [[-260, -330, 220], [-250, -60, 20]] };
function view(v) { const [p, t] = VIEWS[v]; camera.position.set(...p).applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2)); controls.target.set(...t).applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2)); camera.lookAt(controls.target); controls.update(); }

// ---------- picking ----------
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(pickables.filter((p) => p.parent && p.parent.visible), false);
  const pk = $('pick'); if (!hits.length) { pk.style.display = 'none'; return; }
  pk.innerHTML = describe(hits[0].object.userData.flow); pk.style.display = 'block';
});
function describe(f) {
  const I = f.getI ? f.getI() : 0, g = res.glob, ch = f.ch;
  let volt = '';
  const o = ch !== undefined ? res.ch[ch] : (g.sel !== null ? res.ch[g.sel] : null);
  if (f.net === 'F+' || f.net === 'S+') volt = `${f2(VRAIL, 2)} V (레일 VP, 보드 GND 기준)`;
  else if (f.net === 'F−' || f.net === 'S−') volt = o ? `${f2(VRAIL - o.v, 3)} V (N = 2.5 V − V_cell)` : '–';
  if (f.kind === 'oe') volt = '접점(K0, 절연) — 2400 /OE ' + (g.k0 ? '= L 출력 허용' : '= H 출력 꺼짐');
  if (f.kind === 'usb') volt = '+5 V (허브) · USB 데이터';
  const zero = Math.abs(I) < 5e-8;
  const cur = f.kind === 'term' ? (zero ? 'I ≈ 0' : `I = ${mA(Math.abs(I))} mA 흐름`) : f.kind === 'oe' ? '신호 접점(전류 무시)' : f.kind === 'usb' ? '데이터·전원(모형)' : zero ? `I ≈ 0 (감지선 또는 이 상태에서 전류 없음)` : `I = ${mA(Math.abs(I))} mA, 방향 ${I > 0 ? f.a + ' → ' + f.b : f.b + ' → ' + f.a}${I < 0 ? ' (역방향!)' : ''}`;
  const vc = o && f.kind !== 'usb' && f.kind !== 'oe' ? `<br>셀 ${o.c + 1}: V_cell = ${f2(o.v, 3)} V` : '';
  return `<b>${f.name}</b><br>넷 ${f.net} · 양 끝: ${f.a} ↔ ${f.b}<br>${cur}<br>전위 ${volt}${vc}`;
}

// ---------- main ----------
function fit() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight;
  if (innerWidth > 600) camera.setViewOffset(innerWidth, innerHeight, -120, 120, innerWidth, innerHeight); else camera.clearViewOffset();   // keep the model clear of the panels
  camera.updateProjectionMatrix();
}
addEventListener('resize', fit); fit();
let tprev = performance.now(), tacc = 0;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min(0.1, (now - tprev) / 1000); tprev = now; st.t += dt; tacc += dt;
  if (st.mode === 'handover' && tacc > 0.2) { tacc = 0; recompute(); renderTable(); }   // the J-V sweep moves V and I
  tickFlows(dt); controls.update(); renderer.render(scene, camera);
}
async function init() {
  [FP, PATHS] = await Promise.all([fetch('models/setup_layout.json').then((r) => r.json()), fetch('models/paths.json').then((r) => r.json())]);
  buildStatic(); await Promise.all([buildBoard(), buildJigs()]);
  const q = new URLSearchParams(location.search);
  if (q.get('kind') === 'S22') { st.kind = 'S22'; document.querySelectorAll('#kind button').forEach((x) => x.classList.toggle('on', x.dataset.k === 'S22')); await buildJigs(); }
  if (q.get('light')) { st.light = +q.get('light') / 100; $('light').value = q.get('light'); $('lightv').textContent = q.get('light') + ' %'; }
  recompute(); buildFlows();
  if (q.get('step')) setStep(+q.get('step')); else setMode(q.get('s') || 'hold', q.get('k') ? +q.get('k') - 1 : 0);
  if (q.get('fault')) { const [t, c] = q.get('fault').split(':'); sel.value = String((+c || 1) - 1); $('faults').querySelector(`[data-f="${t}"]`).click(); }
  const small = innerWidth < 600;
  if (small) { $('ctl').classList.add('min'); $('tabw').classList.add('min'); }
  view('all'); document.body.classList.add('ready');
  window.__setup = { root, st, get res() { return res; }, setMode, setStep, recompute, flows, camera, controls, view };
  loop();
}
init();
