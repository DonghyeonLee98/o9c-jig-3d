// O9C jig viewer (three.js 0.160). GLB nodes are p000..; names/kinds/layers/dims come from models/<id>_meta.json.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { INFO, TABS, LAYERS, EXPLODE, LIDSEL, LIDDEF, LIDINFO, VERSEL } from './info.js';

const MAT = {   // physically based look per kind
  pom: { color: 0x17181a, roughness: 0.55 }, pcb: { color: 0x141414, roughness: 0.45, clearcoat: 0.6 },
  ss: { color: 0xc9ccd0, metalness: 1, roughness: 0.38 }, chrome: { color: 0xe8eaec, metalness: 1, roughness: 0.08 },
  black: { color: 0x0d0d0e, roughness: 0.42, clearcoat: 0.3 }, kapton: { color: 0xc8781e, roughness: 0.35, transparent: true, opacity: 0.85 },
  gold: { color: 0xd8b04a, metalness: 1, roughness: 0.28 }, steel: { color: 0xbfc3c8, metalness: 1, roughness: 0.32 },
  brass: { color: 0xc9a45a, metalness: 1, roughness: 0.3 }, tungsten: { color: 0x8d9095, metalness: 1, roughness: 0.25 },
  nickel: { color: 0xd6d6d2, metalness: 1, roughness: 0.22 }, magnet: { color: 0xa0a2a6, metalness: 1, roughness: 0.3 },
  glass: { color: 0xa9d6e6, roughness: 0.05, transparent: true, opacity: 0.35 }, si: { color: 0x2b3240, metalness: 0.4, roughness: 0.25 },
  toggle: { color: 0xc4262b, roughness: 0.5 }, post_red: { color: 0xc01d1d, roughness: 0.4 }, post_black: { color: 0x1b1b1b, roughness: 0.4 }, post_green: { color: 0x1d8a3a, roughness: 0.4 },
  misc: { color: 0x888888, roughness: 0.6 },
};
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef0f2);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(-80, 160, 120); scene.add(key);
const camera = new THREE.PerspectiveCamera(35, 1, 1, 3000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
const cut = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 40);
const root = new THREE.Group(); root.rotation.x = -Math.PI / 2; scene.add(root);   // CAD z-up -> three y-up
const loader = new GLTFLoader();
const cache = {};
let cur = null, curId = null, parts = [];
const state = { ex: 0, open: false, sec: false, layers: Object.fromEntries(LAYERS.map(([k]) => [k, true])) };

function matFor(kind) {
  const p = { ...(MAT[kind] || MAT.misc), clippingPlanes: [], side: THREE.DoubleSide };
  return new THREE.MeshPhysicalMaterial(p);
}
async function loadModel(id) {
  if (cache[id]) return cache[id];
  const [gltf, meta] = await Promise.all([loader.loadAsync(`models/${id}.glb`), fetch(`models/${id}_meta.json`).then((r) => r.json())]);
  const by = Object.fromEntries(meta.parts.map((p) => [p.id, p]));
  const g = new THREE.Group(), list = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const as = gltf.parser.associations.get(o), jn = as && as.nodes !== undefined ? gltf.parser.json.nodes[as.nodes] : null;
    const m = by[(jn && jn.name) || o.name];
    if (!m) return;
    o.geometry.computeVertexNormals();
    o.material = matFor(m.kind);
    o.userData = { ...m, base: o.position.clone() };
    list.push(o);
  });
  g.add(gltf.scene);
  for (const m of meta.parts.filter((p) => p.tex)) {   // KiCad top render on the PCB top face
    const [x0, y0, x1, y1, zt] = m.rect;
    const tex = await new THREE.TextureLoader().loadAsync(`models/${m.tex}`);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.45, clearcoat: 0.5, clippingPlanes: [] }));
    pl.position.set((x0 + x1) / 2, (y0 + y1) / 2, zt + 0.03);
    pl.userData = { ...m, name: m.name + ' (KiCad 그림)', base: pl.position.clone() };
    gltf.scene.add(pl); list.push(pl);
  }
  cache[id] = { g, list };
  return cache[id];
}
function apply() {
  if (!cur) return;
  const t2 = curId.startsWith('T2P');
  for (const o of parts) {
    const u = o.userData;
    let dz = (EXPLODE[u.layer] || 0) * state.ex;
    if (!t2 && state.open && u.layer === 'lid') dz += 45;
    o.position.set(u.base.x, u.base.y, u.base.z + dz);
    o.visible = state.layers[u.layer] !== false;
    o.material.clippingPlanes = state.sec ? [cut] : [];
  }
}
let lidSel = {}, verSel = 'pin';
async function show(id) {
  const t2 = id.startsWith('T2P'), hd = id === 'MEMhead';
  const lid = lidSel[id] || LIDDEF[id];
  const realId = t2 ? `${id}-${verSel}${state.open ? '_open' : ''}` : hd ? 'MEMhead' : `${id}__${lid}`;
  const small = id === 'MEM' || id === 'MEMA';   // 261107: small dark block with its own LID_MEM
  document.getElementById('lidrow').classList.toggle('hide', t2 || hd || small);
  document.getElementById('verrow').classList.toggle('hide', !t2 || VERSEL.length < 2);
  document.querySelectorAll('#verrow button').forEach((b) => b.classList.toggle('on', b.dataset.v === verSel));
  document.querySelectorAll('#lidrow button').forEach((b) => b.classList.toggle('on', b.dataset.l === lid));
  const c = await loadModel(realId);
  if (cur) root.remove(cur.g);
  cur = c; curId = realId; parts = c.list; root.add(c.g);
  if (framedFor !== id) { frame(); framedFor = id; }   // 261109: fit the camera to the model (phones showed only a corner)
  document.querySelectorAll('#top button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  const inf = INFO[id];
  document.getElementById('info').innerHTML = `<h4>${inf.title}</h4>${inf.html}${t2 || hd || small ? '' : LIDINFO}`;
  document.getElementById('openl').textContent = inf.open;
  apply();
}
let framedFor = null;
function frame() {   // keep the viewing direction, set distance + target from the model's bounding sphere, aspect-aware
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  const vf = THREE.MathUtils.degToRad(camera.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const dist = (r / Math.sin(Math.min(vf, hf) / 2)) * (innerWidth < 600 ? 1.15 : 1.05);
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (innerWidth < 600) c.y -= r * 0.25;   // phones: the top bar covers the upper part, so look a little lower
  controls.target.copy(c);
  camera.position.copy(c).addScaledVector(dir, dist);
  camera.lookAt(c); controls.update();
}
function fit() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
// UI
const top = document.getElementById('top');
let active = 'S22';
for (const [id, label] of TABS) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.id = id;
  b.onclick = () => { active = id; show(id); }; top.appendChild(b);
}
const lr = document.getElementById('lidrow');
for (const [l, label] of LIDSEL) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.l = l;
  b.onclick = () => { lidSel[active] = l; show(active); }; lr.appendChild(b);
}
const vr = document.getElementById('verrow');
for (const [v, label] of VERSEL) {
  const b = document.createElement('button'); b.textContent = label; b.dataset.v = v;
  b.onclick = () => { verSel = v; show(active); }; vr.appendChild(b);
}
const lay = document.getElementById('layers');
for (const [k, label] of LAYERS) {
  const l = document.createElement('label');
  l.innerHTML = `<input type="checkbox" checked data-k="${k}"> ${label}`;
  l.querySelector('input').onchange = (e) => { state.layers[k] = e.target.checked; apply(); };
  lay.appendChild(l);
}
document.getElementById('ex').oninput = (e) => { state.ex = +e.target.value; apply(); };
document.getElementById('open').onchange = (e) => { state.open = e.target.checked; show(active); };
document.getElementById('sec').onchange = (e) => { state.sec = e.target.checked; document.getElementById('secw').classList.toggle('hide', !state.sec); apply(); };
document.getElementById('secx').oninput = (e) => { cut.constant = +e.target.value; };
document.getElementById('ctlh').onclick = () => document.getElementById('ctl').classList.toggle('min');
document.getElementById('tg').onclick = (e) => { const i = document.getElementById('info'); i.classList.toggle('hide'); e.target.textContent = i.classList.contains('hide') ? '설명 보기' : '설명 숨기기'; };
// picking
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), pick = document.getElementById('pick');
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  let hits = ray.intersectObjects(parts.filter((o) => o.visible), false);
  if (state.sec) hits = hits.filter((h) => cut.distanceToPoint(h.point) >= 0);
  if (!hits.length) { pick.style.display = 'none'; return; }
  const u = hits[0].object.userData;
  pick.textContent = `${u.name} — 외곽 ${u.dims.join(' × ')} mm`;
  pick.style.display = 'block';
});
let userMoved = false;
controls.addEventListener('start', () => { userMoved = true; });
addEventListener('resize', () => { fit(); if (!userMoved && cur) frame(); });   // the pane/phone may resize after load: re-frame until the user takes over
window.__v = { camera, controls, root, scene, frame };   // debugging from the console
fit();
// URL options for sharing a view: ?m=T2P-N&v=ring&open=1&ex=0.6&sec=1
const q = new URLSearchParams(location.search);
if (q.get('m') && INFO[q.get('m')]) active = q.get('m');
if (q.get('lid')) lidSel[active] = q.get('lid');
if (q.get('v') === 'pin' || q.get('v') === 'ring') verSel = q.get('v');
if (q.get('open') === '1') { state.open = true; document.getElementById('open').checked = true; }
if (q.get('ex')) { state.ex = +q.get('ex'); document.getElementById('ex').value = state.ex; }
if (q.get('sec') === '1') { state.sec = true; document.getElementById('sec').checked = true; document.getElementById('secw').classList.remove('hide'); }
const small = innerWidth < 600;
if (small) document.getElementById('ctl').classList.add('min');
if (small) { document.getElementById('info').classList.add('hide'); document.getElementById('tg').textContent = '설명 보기'; }   // phones: model first, text on tap
camera.position.set(40 + (small ? 95 : 115), small ? 215 : 170, -75 + (small ? 230 : 215));
controls.target.set(40, small ? -20 : 0, -78);
camera.lookAt(controls.target);
await show(active);
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();
