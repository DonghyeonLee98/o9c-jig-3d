// Static model of the HOLD4 board + Keithley 2400 hand-over (2026-11-12).
// Numbers follow 01_회로사양.md (§3 channel circuit, §5 hand-over, §7 faults, §14 PC rules) and sw_hold4/hold4/sim.py (single-diode cell,
// 220k discharge resistor, shunt 110 / 10.11 / 2.38 ohm, V_cell = 2.5 V - V_DAC clamped between "FET fully on" and Voc).
// Computed values only, not measured on hardware. No DOM here: the same file runs in node for the self-check.
export const R_DIS = 220e3, VRAIL = 2.5, R_WIRE = 0.1;   // R{k}25 ; LM4040 rail ; 1 m banana wire (sim_loop_v2: 0.1 ohm)

export class Cell {
  constructor(p) { Object.assign(this, p); this.light = 1; this.i0 = this.isc / Math.expm1(this.voc / this.nvt); }
  current(v) {   // current leaving the + terminal at terminal voltage v (bisection on the series-resistance diode equation, as sim.py)
    const iph = this.isc * this.light; let lo = -1, hi = iph + 1;
    for (let n = 0; n < 55; n++) {
      const i = 0.5 * (lo + hi), vd = v + i * this.rs;
      const f = iph - this.i0 * Math.expm1(Math.min(vd / this.nvt, 700)) - vd / this.rsh - i;
      if (f > 0) lo = i; else hi = i;
    }
    return 0.5 * (lo + hi);
  }
  vAtLoad(g) {   // terminal voltage with a conductance g (S) in parallel with the 220k
    const gg = g + 1 / R_DIS; let lo = 0, hi = 3.5;
    for (let n = 0; n < 45; n++) { const v = 0.5 * (lo + hi); if (this.current(v) - v * gg > 0) lo = v; else hi = v; }
    return 0.5 * (lo + hi);
  }
  vmpp() {
    const save = this.light; this.light = 1; let best = 0, bv = 0;
    const voc = this.vAtLoad(0);
    for (let v = 0; v < voc; v += 0.002) { const p = v * this.current(v); if (p > best) { best = p; bv = v; } }
    this.light = save; return bv;
  }
}
export const CELLS = {
  T2P: { name: 'KIER 탠덤 (sim.py: Voc 1.90 V, Isc 20 mA)', voc: 1.90, isc: 20e-3, nvt: 0.077, rs: 3, rsh: 5e3, rsh_mode: 'B', short_mode: 'C', wires: 4, vmpp: 1.627 },
  S22: { name: '싱글셀 화소 1개 (sim.py: Voc 1.20 V, Isc 1.35 mA)', voc: 1.20, isc: 1.35e-3, nvt: 0.045, rs: 40, rsh: 1e7, rsh_mode: 'A', short_mode: 'B', wires: 2, vmpp: 1.021 },
};
// shunt chain (§3): A 110 ohm, B 10 + 0.11 (bypass FET on), C = B || (3 + 0.11) (both bypass FETs on)
export const SHUNT = { A: 110, B: 10.11, C: 10.11 * 3.11 / (10.11 + 3.11) };
export const SHUNT_TXT = { A: 'A 110 Ω', B: 'B 10.1 Ω', C: 'C 2.4 Ω' };

export const STATES = ['open', 'hold', 'handover', 'gap', 'short'];
export const STATE_LABEL = { open: '전부 꺼짐(개방)', hold: '4채널 MPP 유지', handover: 'CH k 인계 · J–V', gap: '인계 전환 중(빈 시간)', short: '단락 노화' };

// st = { mode, k (0-3 handed channel), kind: 'T2P'|'S22', light (0..1.2), faults: [ {ch, type:'rev'|'sminus'} ], req: [a, b] | null, t (s) }
export function makeBoard(kind) {
  const cp = CELLS[kind];
  const cells = [0, 1, 2, 3].map(() => new Cell(cp));
  const vm = cp.vmpp;   // hold target = Vmpp of the 01 doc (§5-4: tandem 1.627 V, pixel 1.021 V), fixed when the light changes
  return { kind, cp, cells, vmpp: vm, dacMpp: VRAIL - vm };
}
export function compute(bd, st) {
  const { cp } = bd, mode = st.mode, faults = st.faults || [];
  // two channels requested at the same time: the decoder drives one SELG only; the address written last wins
  let k = st.k, ignored = null;
  if (mode === 'handover' && st.req && st.req.length === 2) { k = st.req[1]; ignored = st.req[0]; }
  const glob = { selEn: mode === 'handover' ? 1 : 0, sel: mode === 'handover' ? k : null, k0: mode === 'handover', out2400: mode === 'handover', ignored,
                 oe: mode === 'handover' ? 'L (출력 허용)' : 'H (출력 꺼짐)' };
  let vsweep = null;
  const ch = bd.cells.map((cell, c) => {
    cell.light = st.light;
    const f = faults.filter((x) => x.ch === c).map((x) => x.type);
    const rev = f.includes('rev'), sminus = f.includes('sminus');
    const o = { c, cell, faults: f, mode: null, relays: { F: false, S: false, P: false }, fet: 'off', integ: 'run', led: false, dacV: 0, gain: 1,
                shunt: cp.rsh_mode, rsh: SHUNT[cp.rsh_mode], v: 0, i: 0, ish: 0, i2400: 0, vOpen: cell.vAtLoad(0), note: '' };
    const handed = mode === 'handover' && c === k && !rev;
    // reversed cell (red to red): Voc window check reads a negative voltage -> channel is not switched on
    if (rev) {
      o.mode = 'blocked'; o.v = -Math.min(o.vOpen, 0.6); o.ish = -cell.current(0.6); o.i = o.ish;
      o.note = 'Voc 창 검사: V 쌍이 음수 → 극성 반대, FET 켜지 않음(DAC 0)';
    } else if (handed) {
      o.mode = 'handover'; o.relays = { F: true, S: true, P: true }; o.fet = 'off'; o.integ = 'stop'; o.led = true;
      o.dacV = bd.dacMpp;   // integrator frozen at the last hold value
      if (vsweep === null) {   // 2400 forces V: slow triangle 0 -> Voc -> 0, 8 s per cycle
        const ph = (st.t % 8) / 8; vsweep = o.vOpen * (1 - Math.cos(2 * Math.PI * ph)) / 2;
      }
      o.v = (st.vForce != null) ? st.vForce : vsweep;
      o.i2400 = cell.current(o.v) - o.v / R_DIS; o.i = o.i2400; o.ish = 0;
      o.note = '2400이 V를 걸고 J–V 스윕(셀 전류는 2400으로, 유지 FET 꺼짐)';
    } else if (mode === 'open') {
      o.mode = 'open'; o.v = o.vOpen; o.dacV = 0; o.note = 'DAC 0 → 목표 2.5 V ≥ Voc → FET 꺼짐, 셀 개방';
    } else if (mode === 'short') {
      o.mode = 'short'; o.shunt = cp.short_mode; o.rsh = SHUNT[o.shunt]; o.fet = 'on'; o.gain = 2; o.dacV = 4.095;
      o.v = cell.vAtLoad(1 / (o.rsh + 0.11)); o.ish = cell.current(o.v) - o.v / R_DIS; o.i = o.ish;
      o.note = 'DAC 이득 ×2·코드 4095 → 목표 −1.6 V → FET 완전 켜짐, 션트 ' + SHUNT_TXT[o.shunt];
    } else {   // hold (also in the gap and for the three channels that are not handed over)
      o.mode = 'hold'; o.dacV = bd.dacMpp; const vt = VRAIL - o.dacV;
      if (vt >= o.vOpen) { o.v = o.vOpen; o.ish = 0; o.fet = 'off'; o.note = '빛이 모자라 Voc가 목표(Vmpp)보다 낮음 → FET 꺼진 채 개방'; }
      else {
        const vmin = cell.vAtLoad(1 / (o.rsh + 0.11)); o.v = Math.max(vt, vmin); o.fet = 'reg';
        o.ish = cell.current(o.v) - o.v / R_DIS; o.note = 'V_cell = 2.5 V − V_DAC 를 유지(연산증폭기가 FET 게이트를 조절)';
      }
      o.i = o.ish;
    }
    if (mode === 'gap') o.note = '빈 시간 5 ms: 광 MOS 전부 열림, /OE = H → 2400 출력 꺼짐. 셀은 유지 쪽이 잡음';
    o.dacCode = o.gain === 2 ? 4095 : Math.round(o.dacV / 2.048 * 4096);
    // ADC: V pair AIN2-AIN3 = SP - SM (S wires), I pair AIN0-AIN1 = shunt drop. A missing S wire is replaced by the 1k to the board node,
    // so the voltage drop of the F wire(s) enters the reading (01 §3: "선 강하가 ADC 기록에 들어감")
    const iw = o.mode === 'handover' ? o.i2400 : o.ish, nDrop = cp.wires === 2 ? 2 : (sminus ? 1 : 0);
    o.adcV = o.v - nDrop * R_WIRE * iw;
    o.adcIm = o.ish * o.rsh * 1e3;   // mV across the shunt
    o.p = o.v * o.i;
    return o;
  });
  return { ch, glob, k, bd };
}
