// Electrical-path overlay for the O9C jig viewer (2026-11-12).
// models/paths.json: per model (GLB id) the routes contact -> PCB copper (KiCad files as routed) -> connector, in the CAD frame
// of the GLBs (main board x = kx, y = 130.13 - ky; lid boards placed on the lid PCB part). Drawn on top of see-through parts.
import * as THREE from 'three';

const NETCOL = {
  FRONT_F: 0xff4d1a, FRONT_S: 0xffa36b, MID_F: 0xb04dff, MID_S: 0xd7a8ff, REAR_F: 0x1d5cff, REAR_S: 0x7aa7ff,
  P1: 0xff5e57, P2: 0xff9f43, P3: 0xf5b700, P4: 0xff6fa8, PIX: 0xe84118, COM: 0x1e90ff, ANODE: 0xc0392b, CATH: 0x0652dd,
  AG1: 0xff5e57, AG2: 0xff7f50, AG3: 0xff9f43, AG4: 0xf5b700, AG5: 0xff6fa8, AG6: 0xe8590c, TBUS: 0xd63031,
  BL1: 0x00a8ff, BL2: 0x0abde3, BL3: 0x3867d6, BL4: 0x4bcffa, BL5: 0x5f27cd, BL6: 0x2e86de, BBUS: 0x0652dd,
  SRC: 0xc0392b, MEAS: 0x8e44ad, LO: 0x2d3436, GUARD: 0x20bf6b, GUARD_OUT: 0x0b8a4a,
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const MEANING = {
  FRONT_F: '앞(위) 전극 Force', FRONT_S: '앞(위) 전극 Sense', MID_F: '중간 전극 Force (MF)', MID_S: '중간 전극 Sense (MS)',
  REAR_F: '뒤(아래) 전극 Force', REAR_S: '뒤(아래) 전극 Sense', PIX: '화소 공통 (SW1–4 → SW5)', COM: '공통 전극(ITO) 핀', ANODE: 'SW5 뒤 + 쪽', CATH: 'SW5 뒤 − 쪽',
  TBUS: '위 줄 공통 (T1–6 → FWD)', BBUS: '아래 줄 공통 (B1–6 → FWD)', SRC: '전원 쪽', MEAS: '측정 쪽', LO: 'LO', GUARD: '가드 (안 쓰는 줄)', GUARD_OUT: '가드 출력',
};
const NOTES = {
  T2P: 'T2P 공통 보드: FORCE_HI = FRONT_F, FORCE_LO = REAR_F, SENSE_HI = FRONT_S, SENSE_LO = REAR_S, BNC FORCE = 중심 FRONT_F / 실드 REAR_F, BNC SENSE = 중심 FRONT_S / 실드 REAR_S (KiCad 넷 그대로).',
  'T2P-L3': '3단자 측정: SMU-A FRONT–MID, SMU-B MID–REAR (설계안 §26). 뚜껑 PCB(O9C_T2P_LID3) 배선 → 연결 기둥 LK → 아래 PCB W 패드.',
  'T2P-L': '뚜껑 PCB(O9C_T2P_LID, 주문 전) 배선 → 연결 기둥 LK → 아래 PCB W 패드.',
  'T2P-P': '앞: 바늘 → 황동 팔 판 → 스탠드오프 → 아래 PCB (납땜·전선 없음).',
  'T2P-N': '앞: 바늘 → SUS 와셔 → 링 단자 → AWG24 선 → W 패드 (선 모양은 CAD 부품 위치 기준 개략).',
  S22: '핀 → 화소 토글 SW1–4 → 공통 PIX → SW5(극성 바꿈 DPDT) → 포스트·BNC. 토글 안쪽 연결(젖힌 방향)은 그리지 않음.',
  SB4: '핀 → 화소 토글 SW1–4 → 공통 PIX → SW5(극성 바꿈 DPDT) → 포스트·BNC. 토글 안쪽 연결(젖힌 방향)은 그리지 않음.',
  MEM: '핀 → 줄 토글 T1–6 / B1–6 → TBUS / BBUS → FWD 토글 → SRC·MEAS → 포스트·BNC. 토글·점퍼(JP1·JP2) 안쪽 연결은 그리지 않음.',
  MEMA: 'MEMA는 MEM 보드 배선으로 그림(이 페이지 모델과 같음). MEMA 전용 보드의 USB-C·DB9·절연 회로 경로는 미확인이라 그리지 않음.',
};

export async function initPaths(ctx) {   // ctx: { root, getParts, camera, exploded, btnHost, legend }
  const data = await fetch('models/paths.json').then((r) => r.json());
  const grp = new THREE.Group(); grp.visible = false; ctx.root.add(grp);
  let on = false, cur = null, tracks = [], fold = innerWidth <= 600;
  const sphere = new THREE.SphereGeometry(0.42, 10, 8);
  const mats = new Map();
  function xray(x) {
    for (const o of ctx.getParts()) {
      const mt = o.material; if (!mats.has(mt)) mats.set(mt, { t: mt.transparent, o: mt.opacity, d: mt.depthWrite });
      const s = mats.get(mt);
      if (x) { mt.transparent = true; mt.opacity = Math.min(s.o, 0.25); mt.depthWrite = false; } else { mt.transparent = s.t; mt.opacity = s.o; mt.depthWrite = s.d; }
      mt.needsUpdate = true;
    }
  }
  function build(id) {
    for (const t of tracks) { t.tube.geometry.dispose(); }
    grp.clear(); tracks = [];
    const m = data[id]; if (!m) return;
    for (const p of m.paths) {
      const c = NETCOL[p.net] ?? 0x333333, v = p.pts.map((q) => new THREE.Vector3(...q));
      const cum = [0]; for (let i = 1; i < v.length; i++) cum.push(cum[i - 1] + v[i].distanceTo(v[i - 1]));
      const L = cum[cum.length - 1]; if (!(L > 0)) continue;
      const cp = new THREE.CurvePath(); for (let i = 1; i < v.length; i++) if (v[i].distanceTo(v[i - 1]) > 1e-6) cp.add(new THREE.LineCurve3(v[i - 1], v[i]));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(cp, Math.max(8, v.length * 6), 0.28, 6, false),
        new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
      tube.renderOrder = 900;
      const n = Math.max(2, Math.round(L / 5));
      const inst = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95 }), n);
      inst.renderOrder = 901; inst.frustumCulled = false; grp.add(tube, inst);
      tracks.push({ v, cum, L, n, inst, tube });
    }
  }
  function legend() {
    const el = ctx.legend;
    if (!on || !cur || !data[cur]) { el.classList.add('hide'); return; }
    el.classList.remove('hide');
    const m = data[cur], fam = cur.split('__')[0].replace(/-(pin|measuring|lifted|swung18)(_open)?$/, '');
    let h = `<div class="lh"><b>전기 경로 · Electrical paths</b><button class="lx">${fold ? '펼치기' : '접기'}</button></div><div class="lb">`;
    h += `<div class="ln">PCB 구리 = KiCad ${m.board}${m.lid ? ' + ' + m.lid : ''} 트랙 그대로. 점이 접점 → 커넥터 쪽으로 흐름.</div>`;
    for (const l of m.legend) {
      h += `<div class="lr"><i class="sw" style="background:${hex(NETCOL[l.net] ?? 0x333333)}"></i><span><b>${l.net}</b>${MEANING[l.net] ? ' ' + MEANING[l.net] : ''} — ${l.src.join(', ')} → ${l.dst.join(', ')}</span></div>`;
    }
    const notes = [];
    if (fam.startsWith('T2P')) notes.push(NOTES.T2P);
    if (NOTES[fam]) notes.push(NOTES[fam]);
    if (/_open$|lifted|swung18/.test(cur)) notes.push('이 상태에서는 앞 접점이 떨어져 있음(경로는 이어서 그림).');
    notes.push('미확인: 계측기 쪽 배선(케이블·HI/LO를 어느 계측기 단자에 꽂는지)은 파일에 없음.');
    h += notes.map((x) => `<div class="ln">${x}</div>`).join('') + '</div>';
    el.innerHTML = h;
    el.classList.toggle('fold', fold);
    el.querySelector('.lx').onclick = () => { fold = !fold; legend(); };
  }
  const b = document.createElement('button'); b.id = 'pathBtn'; b.textContent = '전기 경로 · Electrical paths';
  b.onclick = () => { on = !on; b.classList.toggle('on', on); if (on) ctx.beforeOn(); xray(on); legend(); };
  ctx.btnHost.append(b);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
  let time = 0, prev = performance.now();
  return {
    on: () => on, toggle: () => b.click(),
    setModel(id, oldParts) {   // called after the viewer swapped the model
      if (on && oldParts) for (const o of oldParts) { const s = mats.get(o.material); if (s) { o.material.transparent = s.t; o.material.opacity = s.o; o.material.depthWrite = s.d; o.material.needsUpdate = true; } }
      if (id !== cur) { cur = id; build(id); }
      xray(on); legend();
    },
    tick() {
      const now = performance.now(), dt = Math.min(0.1, (now - prev) / 1000); prev = now; time += dt;
      grp.visible = on && !ctx.exploded();
      if (!grp.visible) return;
      for (const t of tracks) {
        const off = (time * 10) % (t.L / t.n);
        for (let k = 0; k < t.n; k++) {
          const s = (off + k * t.L / t.n) % t.L;
          let i = 1; while (i < t.cum.length - 1 && t.cum[i] < s) i++;
          const seg = t.cum[i] - t.cum[i - 1]; _p.lerpVectors(t.v[i - 1], t.v[i], seg > 0 ? (s - t.cum[i - 1]) / seg : 0);
          _m.compose(_p, _q, _s); t.inst.setMatrixAt(k, _m);
        }
        t.inst.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
