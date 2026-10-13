/**
 * Layouts and rules of the realistic car (and phone) repair jobs (pure, unit-tested): the OBD-II
 * trouble code, the spark plug job, battery terminal order, the oil filter, the fuse box and the
 * phone battery connector. Positions are stage units (0..1), like ./repair.
 */
import { Rng, hashSeed } from './prng';
import { panelGeom, zonePt, type Pt, type Rig, type TaskSpec } from './repair';

// ---------------------------------------------------------------- diagnosis

export interface TroubleCode {
  code: string;
  /** i18n key of the description, and its parameters. */
  key: string;
  n?: number;
}

/** Which cylinder misfires (0-based), from the item seed. */
export function misfireCylinder(seed: number, cylinders: number): number {
  return hashSeed(seed, 'misfire') % Math.max(1, cylinders);
}

/** The code the scanner reads, from the first fault the job is about. */
export function troubleCode(tasks: TaskSpec[], seed: number): TroubleCode {
  for (const t of tasks) {
    if (t.k === 'plugs') {
      const c = misfireCylinder(seed, t.n);
      return { code: `P030${c + 1}`, key: 'obd.misfire', n: c + 1 };
    }
    if (t.k === 'battery') return { code: 'P0562', key: 'obd.voltage' };
    if (t.k === 'pour' && t.fluid === 'coolant') return { code: 'P0128', key: 'obd.coolant' };
    if (t.k === 'filter' || (t.k === 'pour' && t.fluid === 'oil')) return { code: 'P0521', key: 'obd.oil' };
  }
  return { code: 'P0000', key: 'obd.none' };
}

export interface ObdLayout {
  panel: { c: Pt; w: number; h: number };
  /** The 16-pin port under the dash, and where the scanner's plug waits. */
  port: Pt;
  plug: Pt;
  /** The scanner's screen and its OK button. */
  screen: Pt;
  ok: Pt;
}

export function obdLayout(): ObdLayout {
  const c = { u: 0.5, v: 0.46 };
  return {
    panel: { c, w: 0.38, h: 0.27 },
    port: { u: c.u - 0.2, v: c.v - 0.1 },
    plug: { u: c.u - 0.2, v: c.v + 0.13 },
    screen: { u: c.u + 0.13, v: c.v - 0.04 },
    ok: { u: c.u + 0.13, v: c.v + 0.15 },
  };
}

/** Seconds the scanner takes to read the codes. */
export const OBD_READ_SECONDS = 1;

// ---------------------------------------------------------------- spark plugs

export interface PlugLayout {
  /** Coil (and plug hole) positions on the valve cover. */
  coils: Pt[];
  /** Where a pulled coil rests, and the parts tray (new plug, old plug). */
  rest: Pt;
  tray: Pt;
  /** The gap gauge (feeler gauge). */
  gauge: Pt;
}

/** The plug holes sit on the engine's valve cover (see the engine art). */
export function plugLayout(r: Rig, n: 1 | 4): PlugLayout {
  const g = panelGeom(r);
  const ew = g.rx * 1.05;
  const ex = g.cx - ew * 0.62;
  const v = g.cy - g.ry * 0.247;
  const coils =
    n === 1 ? [{ u: ex + ew * 0.5, v }] : [0, 1, 2, 3].map((i) => ({ u: ex + ew * (0.18 + i * 0.21), v }));
  return {
    coils,
    rest: { u: g.cx - g.rx * 0.2, v: g.cy + g.ry * 0.55 },
    tray: { u: g.cx + g.rx * 0.4, v: g.cy + g.ry * 0.55 },
    gauge: { u: g.cx + g.rx * 0.72, v: g.cy + g.ry * 0.2 },
  };
}

/** Turns (radians of circling) to unscrew or thread a plug. */
export const PLUG_TURNS = Math.PI * 4;
/** Spark plug gap: set it in this band of the feeler gauge (0..1 = 0.4..1.6 mm). */
export const GAP_BAND: [number, number] = [0.4, 0.58];
export const GAP_RATE = 0.4;
/** Plug torque band (the gauge, like the torque wrench). */
export const PLUG_TORQUE: [number, number] = [0.7, 0.88];

// ---------------------------------------------------------------- battery

export interface BatteryLayout {
  /** Battery centre and size, the + and - terminal clamps, the hold-down bolt. */
  c: Pt;
  w: number;
  h: number;
  pos: Pt;
  neg: Pt;
  hold: Pt;
  /** Where the old battery goes, where the new one waits. */
  bin: Pt;
  fresh: Pt;
}

export function batteryLayout(r: Rig): BatteryLayout {
  const g = panelGeom(r);
  // In an empty bay it sits in the corner; under a hood, beside the engine (clear of the caps).
  const bay = r.inside === 'bay';
  const c = bay ? zonePt(r, 'tr') : { u: g.cx + g.rx * 0.75, v: g.cy - g.ry * 0.02 };
  const w = 0.2;
  const h = 0.15;
  return {
    c,
    w,
    h,
    pos: { u: c.u - w * 0.3, v: c.v - h * 0.42 },
    neg: { u: c.u + w * 0.3, v: c.v - h * 0.42 },
    hold: { u: c.u, v: c.v + h * 0.62 },
    bin: zonePt(r, 'bl'),
    fresh: bay ? zonePt(r, 'br') : { u: c.u, v: g.cy + g.ry * 0.6 },
  };
}

/** The safe order: negative off first, positive on first. */
export const BATTERY_STEPS = [
  'negOff',
  'posOff',
  'holdOff',
  'out',
  'in',
  'holdOn',
  'posOn',
  'negOn',
] as const;
export type BatteryStep = (typeof BATTERY_STEPS)[number];

export function batterySteps(fit: boolean): BatteryStep[] {
  return fit ? ['in', 'holdOn', 'posOn', 'negOn'] : [...BATTERY_STEPS];
}

/** Seconds of holding the spanner on a terminal or the hold-down bolt. */
export const TERMINAL_SECONDS = 0.45;

// ---------------------------------------------------------------- oil filter

export interface FilterLayout {
  c: Pt;
  r: number;
  /** Where the new filter waits (its seal is oiled there), and the old one goes. */
  fresh: Pt;
  bin: Pt;
}

export function filterLayout(r: Rig): FilterLayout {
  const g = panelGeom(r);
  return {
    c: { u: g.cx + g.rx * 0.14, v: g.cy + g.ry * 0.78 },
    r: 0.055,
    fresh: { u: g.cx - g.rx * 0.12, v: g.cy + g.ry * 0.88 },
    bin: zonePt(r, 'bl'),
  };
}

/** Turns to spin a filter off, and on until hand-tight. */
export const FILTER_TURNS = Math.PI * 4;

// ---------------------------------------------------------------- fuse box

export interface Circuit {
  id: string;
  amps: 5 | 10 | 15 | 20 | 30;
}

/** The fuse box legend (the sticker on the lid), slot by slot. */
export const CIRCUITS: Circuit[] = [
  { id: 'horn', amps: 10 },
  { id: 'radio', amps: 10 },
  { id: 'lights', amps: 15 },
  { id: 'wipers', amps: 20 },
  { id: 'fan', amps: 30 },
  { id: 'dash', amps: 5 },
  { id: 'pump', amps: 15 },
  { id: 'socket', amps: 20 },
];

/** Standard blade fuse colours by rating. */
export const FUSE_COLOUR: Record<Circuit['amps'], number> = {
  5: 0xc9a46a,
  10: 0xd8352a,
  15: 0x2f6fd0,
  20: 0xf2c12e,
  30: 0x3fae49,
};

export interface FuseLayout {
  panel: { c: Pt; w: number; h: number };
  slots: Pt[];
  /** The blown one (index into CIRCUITS / slots). */
  blown: number;
  /** Spare fuses in the tray (ratings), and where they sit. */
  spares: Circuit['amps'][];
  trays: Pt[];
  bin: Pt;
}

export function fuseLayout(seed: number): FuseLayout {
  const c = { u: 0.42, v: 0.44 };
  const slots = CIRCUITS.map((_, i) => ({
    u: c.u - 0.15 + (i % 4) * 0.1,
    v: c.v - 0.06 + Math.floor(i / 4) * 0.13,
  }));
  const blown = hashSeed(seed, 'fuse') % CIRCUITS.length;
  // Four spares of different ratings; one matches the blown fuse.
  const rng = new Rng(hashSeed(seed, 'spares'));
  const all: Circuit['amps'][] = [5, 10, 15, 20, 30];
  const want = CIRCUITS[blown].amps;
  const others = rng.shuffle(all.filter((a) => a !== want)).slice(0, 3);
  const spares = rng.shuffle([want, ...others]);
  const trays = spares.map((_, i) => ({ u: c.u - 0.15 + i * 0.1, v: c.v + 0.2 }));
  return {
    panel: { c: { u: 0.5, v: 0.46 }, w: 0.42, h: 0.3 },
    slots,
    blown,
    spares,
    trays,
    bin: { u: 0.84, v: 0.62 },
  };
}

// ---------------------------------------------------------------- phone battery connector

/** Where the phone's battery flex connector is (on the logic board, by the battery). */
export function batteryConnector(r: Rig): Pt {
  const g = panelGeom(r);
  return { u: g.cx - g.rx * 0.42, v: g.cy + g.ry * 0.05 };
}
