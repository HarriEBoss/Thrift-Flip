/**
 * Layouts and rules of the detailed assembly tasks (pure, unit-tested): chip sockets, torque
 * sequences, memory slots, front-panel pins, the serpentine belt, servo centring and the fuel line
 * pressure test. Positions are stage units (0..1), like the rest of ./repair.
 */
import { Rng, hashSeed } from './prng';
import { cableSet, panelGeom, zonePt, type Pt, type Rig, type TorqueAt } from './repair';

// ---------------------------------------------------------------- chip socket

export interface SocketLayout {
  /** Socket centre and size (square). */
  socket: Pt;
  size: number;
  /** Where the new chip waits. */
  tray: Pt;
  /** Lever pivot and handle end when closed / open. */
  lever: { pivot: Pt; closed: Pt; open: Pt };
  /** Rotation steps of a turn: 4 for a square CPU, 2 for a long controller chip. */
  turns: number;
}

export function socketLayout(r: Rig, chip: 'cpu' | 'mcu'): SocketLayout {
  const s = zonePt(r, chip === 'cpu' ? 'tl' : 'c');
  const size = chip === 'cpu' ? 0.12 : 0.1;
  const pivot = { u: s.u + size * 0.7, v: s.v + size * 0.55 };
  return {
    socket: s,
    size,
    tray: zonePt(r, 'br'),
    lever: {
      pivot,
      closed: { u: pivot.u, v: s.v - size * 0.55 },
      open: { u: pivot.u + size * 0.75, v: pivot.v - size * 0.5 },
    },
    turns: chip === 'cpu' ? 4 : 2,
  };
}

/** The chip arrives turned the wrong way (1..turns-1 quarter or half turns), from the item seed. */
export function chipStartTurn(seed: number, turns: number): number {
  return 1 + (hashSeed(seed, 'chipturn') % (turns - 1));
}

// ---------------------------------------------------------------- torque sequences

export interface TorqueLayout {
  /** Bolt positions; `order[k]` is the index of the k-th bolt to tighten. */
  pts: Pt[];
  order: number[];
  /** Stamped number shown next to each bolt (1-based position in the order). */
  labels: number[];
  /** Bolt drawing size (stage units). */
  size: number;
}

/**
 * Real tightening patterns: a cross (opposite corners) for a cooler's four screws, centre-out for
 * an engine's six bolts, a star (opposite pairs) for a nozzle's six bolts round a circle.
 */
export function torqueLayout(r: Rig, at: TorqueAt): TorqueLayout {
  const g = panelGeom(r);
  let pts: Pt[];
  let order: number[];
  let size: number;
  if (at === 'cooler') {
    const c = zonePt(r, 'tl');
    const d = 0.085;
    // TL, TR, BR, BL; cross: TL -> BR -> TR -> BL.
    pts = [
      { u: c.u - d, v: c.v - d },
      { u: c.u + d, v: c.v - d },
      { u: c.u + d, v: c.v + d },
      { u: c.u - d, v: c.v + d },
    ];
    order = [0, 2, 1, 3];
    size = 0.042;
  } else if (at === 'engine') {
    // Two rows of three along the engine; tighten from the middle outwards, alternating sides.
    const y0 = g.cy - g.ry * 0.12;
    const y1 = g.cy + g.ry * 0.3;
    const xs = [g.cx - g.rx * 0.42, g.cx, g.cx + g.rx * 0.42];
    pts = [...xs.map((u) => ({ u, v: y0 })), ...xs.map((u) => ({ u, v: y1 }))];
    order = [1, 4, 0, 5, 2, 3];
    size = 0.06;
  } else {
    // Six bolts round the nozzle flange; star: each next bolt is (about) opposite the last.
    const c = zonePt(r, 'c');
    const rr = 0.15;
    pts = Array.from({ length: 6 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
      return { u: c.u + Math.cos(a) * rr, v: c.v + Math.sin(a) * rr };
    });
    order = [0, 3, 1, 4, 2, 5];
    size = 0.05;
  }
  const labels = pts.map((_, i) => order.indexOf(i) + 1);
  return { pts, order, labels, size };
}

/** Torque gauge: release in the green band; past `strip` the bolt is over-tightened. */
export const TORQUE_BAND: [number, number] = [0.72, 0.88];
export const TORQUE_STRIP = 0.97;
/** Gauge rise per second while holding the wrench in the final pass. */
export const TORQUE_RATE = 0.9;
/** Seconds of holding to snug a bolt in the first pass. */
export const SNUG_SECONDS = 0.35;

// ---------------------------------------------------------------- memory

export interface RamLayout {
  /** The four slots (A1, A2, B1, B2 from the CPU outwards) and their latches. */
  slots: Array<{ id: string; c: Pt; latches: [Pt, Pt] }>;
  /** The slot to use first (dual channel starts with A2). */
  target: number;
  /** Where the stick waits, and its size. */
  tray: Pt;
  w: number;
  h: number;
  /** Notch position along the stick, 0..1 (off-centre, so the stick fits only one way). */
  notch: number;
}

export function ramLayout(r: Rig): RamLayout {
  const z = zonePt(r, 'tr');
  const w = 0.26;
  const h = 0.024;
  const ids = ['A1', 'A2', 'B1', 'B2'];
  const slots = ids.map((id, i) => {
    const c = { u: z.u, v: z.v - 0.05 + i * 0.045 + 0.007 };
    return {
      id,
      c,
      latches: [
        { u: c.u - w / 2 - 0.012, v: c.v },
        { u: c.u + w / 2 + 0.012, v: c.v },
      ] as [Pt, Pt],
    };
  });
  return { slots, target: 1, tray: zonePt(r, 'br'), w, h, notch: 0.42 };
}

// ---------------------------------------------------------------- front-panel header

export interface HeaderPlug {
  id: 'pwrsw' | 'rstsw' | 'hdd' | 'pled';
  /** Pins it covers (indices into `pins`), left to right as printed. */
  pins: [number, number];
  /** LEDs have a + pin (the first pin when the plug is the right way round). */
  polar: boolean;
}

export interface HeaderLayout {
  /** The magnified panel (centre and half size). */
  panel: { c: Pt; w: number; h: number };
  /** 2 x 5 pins: top row 0..4, bottom row 5..9 (pin 4 is the missing key pin). */
  pins: Pt[];
  key: number;
  plugs: HeaderPlug[];
  /** Where each plug waits, by plug index. */
  trays: Pt[];
}

/**
 * The standard (Intel style) front-panel header: top row PLED+ PLED- PWR PWR (key), bottom row
 * HDD+ HDD- RST RST NC.
 */
export function headerLayout(): HeaderLayout {
  const c = { u: 0.5, v: 0.44 };
  const pw = 0.4;
  const ph = 0.26;
  const step = 0.1;
  const pins: Pt[] = [];
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 5; i++) pins.push({ u: c.u - 2 * step + i * step, v: c.v - 0.11 + row * 0.1 });
  const plugs: HeaderPlug[] = [
    { id: 'pled', pins: [0, 1], polar: true },
    { id: 'pwrsw', pins: [2, 3], polar: false },
    { id: 'hdd', pins: [5, 6], polar: true },
    { id: 'rstsw', pins: [7, 8], polar: false },
  ];
  const trays = plugs.map((_, i) => ({ u: c.u - 0.3 + i * 0.2, v: c.v + 0.14 }));
  return { panel: { c, w: pw, h: ph }, pins, key: 4, plugs, trays };
}

/** Where a plug sits on its pins (between them). */
export function plugSeat(lay: HeaderLayout, p: HeaderPlug): Pt {
  const a = lay.pins[p.pins[0]];
  const b = lay.pins[p.pins[1]];
  return { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 };
}

/** Which polar plugs arrive flipped (+ on the wrong side), from the item seed. */
export function flippedPlugs(seed: number): boolean[] {
  const rng = new Rng(hashSeed(seed, 'fpflip'));
  return headerLayout().plugs.map((p) => p.polar && rng.next() < 0.5);
}

// ---------------------------------------------------------------- serpentine belt

export interface Pulley {
  id: 'crank' | 'alt' | 'ps' | 'ac' | 'wp' | 'idler' | 'tens';
  c: Pt;
  r: number;
  /** Grooved pulleys take the ribbed side of the belt; smooth idlers its back. */
  grooved: boolean;
}

export interface BeltLayout {
  panel: { c: Pt; w: number; h: number };
  pulleys: Pulley[];
  /** The routing (pulley indices), round from the crankshaft and back to it. */
  route: number[];
  /** Where the routing diagram sticker is. */
  diagram: Pt;
  /** Index of the tensioner (pull it back to fit the last loop). */
  tensioner: number;
}

export function beltLayout(): BeltLayout {
  const c = { u: 0.5, v: 0.46 };
  const P = (du: number, dv: number) => ({ u: c.u + du, v: c.v + dv });
  const pulleys: Pulley[] = [
    { id: 'crank', c: P(0, 0.17), r: 0.055, grooved: true },
    { id: 'ac', c: P(-0.2, 0.12), r: 0.042, grooved: true },
    { id: 'idler', c: P(-0.16, -0.02), r: 0.03, grooved: false },
    { id: 'alt', c: P(-0.22, -0.15), r: 0.036, grooved: true },
    { id: 'ps', c: P(0.02, -0.17), r: 0.042, grooved: true },
    { id: 'wp', c: P(0.17, -0.06), r: 0.04, grooved: true },
    { id: 'tens', c: P(0.13, 0.09), r: 0.03, grooved: false },
  ];
  return {
    panel: { c, w: 0.37, h: 0.3 },
    pulleys,
    route: [0, 1, 2, 3, 4, 5, 6],
    diagram: { u: 0.82, v: 0.2 },
    tensioner: 6,
  };
}

/** Seconds of pulling the tensioner back before the belt slips on. */
export const TENSIONER_SECONDS = 0.6;

// ---------------------------------------------------------------- servo

/** Servo horn angle (0..1 = 0..180 degrees); centre it at 90 degrees, in the band. */
export const SERVO_BAND: [number, number] = [0.46, 0.54];
export const SERVO_RATE = 0.25;

export function servoStart(seed: number): number {
  return 0.08 + (hashSeed(seed, 'servo') % 20) / 100;
}

// ---------------------------------------------------------------- leak test

export interface LeakLayout {
  /** Fittings of the fuel lines (where the hoses were plugged). */
  fittings: Pt[];
  /** The one that bubbles. */
  leak: number;
  /** The test valve and the pressure gauge. */
  valve: Pt;
  gauge: Pt;
}

export function leakLayout(r: Rig, seed: number): LeakLayout {
  const fittings = cableSet(r, 'fuel', seed).map((d) => d.socket);
  const g = panelGeom(r);
  return {
    fittings,
    leak: hashSeed(seed, 'leak') % fittings.length,
    valve: { u: g.cx - g.rx * 0.2, v: g.cy + g.ry * 0.72 },
    gauge: { u: g.cx + g.rx * 0.2, v: g.cy + g.ry * 0.72 },
  };
}

/** Test pressure to reach (gauge 0..1), and how fast it rises / the leak lets it fall. */
export const LEAK_TEST = 0.8;
export const LEAK_PUMP_RATE = 0.7;
export const LEAK_DROP_RATE = 0.12;
/** Seconds of tightening the leaking fitting. */
export const LEAK_FIX_SECONDS = 0.7;
