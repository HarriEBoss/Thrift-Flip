/**
 * Layouts and rules of the realistic robot and rocket repair jobs (pure, unit-tested): lockout of a
 * robot cell, the serial console fault log, the battery pack (find the dead cell, solder a new one),
 * drone propeller directions; venting and purging a rocket tank, remove-before-flight safing pins,
 * gimbal alignment of an engine and heat shield tiles. Positions are stage units (0..1), like
 * ./repair. Most of these jobs happen in a magnified panel in the middle of the stage.
 */
import { Rng, hashSeed } from './prng';
import { panelGeom, type Pt, type Rig, type TaskSpec } from './repair';

export interface Panel {
  c: Pt;
  w: number;
  h: number;
}

// ---------------------------------------------------------------- lockout / tagout

export interface LockoutLayout {
  panel: Panel;
  /** The red mushroom emergency stop, the key switch, the blue reset button and the status light. */
  estop: Pt;
  key: Pt;
  reset: Pt;
  light: Pt;
  /** The lockout hasp on the key switch, and where your padlock and tag wait. */
  hasp: Pt;
  tray: Pt;
}

export function lockoutLayout(): LockoutLayout {
  const c = { u: 0.5, v: 0.47 };
  return {
    panel: { c, w: 0.36, h: 0.27 },
    estop: { u: c.u - 0.19, v: c.v - 0.06 },
    key: { u: c.u + 0.04, v: c.v - 0.06 },
    hasp: { u: c.u + 0.04, v: c.v + 0.08 },
    reset: { u: c.u + 0.22, v: c.v - 0.06 },
    light: { u: c.u + 0.22, v: c.v - 0.19 },
    tray: { u: c.u - 0.19, v: c.v + 0.17 },
  };
}

/**
 * Before working on a robot: hit the E-stop, turn the key to OFF and hang your own padlock and tag on
 * it (nobody can restart it while you're inside). After: take your lock off, key back to RUN, twist
 * the E-stop to release it, then press reset.
 */
export type LockStep = 'estop' | 'key' | 'lock' | 'unlock' | 'keyOn' | 'release' | 'reset';

export function lockoutSteps(on: boolean): LockStep[] {
  return on ? ['estop', 'key', 'lock'] : ['unlock', 'keyOn', 'release', 'reset'];
}

/** Turning (radians) to twist the E-stop out. */
export const ESTOP_TWIST = Math.PI;

// ---------------------------------------------------------------- serial console

export interface FaultCode {
  code: string;
  /** i18n key of the description, and its parameter. */
  key: string;
  n?: number;
}

/** What the controller logged, from the first fault the job is about. */
export function robotFault(tasks: TaskSpec[], seed: number): FaultCode {
  for (const t of tasks) {
    if ((t.k === 'swap' && t.part === 'servo') || t.k === 'servo') {
      const n = (hashSeed(seed, 'joint') % 4) + 1;
      return { code: `E21-M${n}`, key: 'uart.joint', n };
    }
    if (t.k === 'pack' || (t.k === 'swap' && (t.part === 'cell' || t.part === 'battery')))
      return { code: 'E43', key: 'uart.cell' };
    if (t.k === 'props') return { code: 'E35', key: 'uart.props' };
    if ((t.k === 'swap' && t.part === 'chip') || t.k === 'socket')
      return { code: 'E07', key: 'uart.watchdog' };
    if (t.k === 'cables') return { code: 'E12', key: 'uart.encoder' };
  }
  return { code: 'E00', key: 'uart.none' };
}

/** The pins of the controller's debug header. 3V3 is a power pin: never connect it. */
export type UartPin = 'GND' | 'TX' | 'RX' | '3V3';
/** The USB-serial adapter's three leads. */
export type UartLead = 'GND' | 'TX' | 'RX';
export const UART_LEADS: UartLead[] = ['GND', 'TX', 'RX'];

/** Crossed over: what one side transmits, the other receives. Ground goes to ground. */
export function uartTarget(lead: UartLead): UartPin {
  return lead === 'GND' ? 'GND' : lead === 'TX' ? 'RX' : 'TX';
}

export interface UartLayout {
  panel: Panel;
  /** Header pins, left to right, and what each one is (the order differs per board). */
  pins: Pt[];
  names: UartPin[];
  /** Where each adapter lead waits (by UART_LEADS order). */
  leads: Pt[];
  /** The laptop's terminal and its OK button. */
  screen: Pt;
  ok: Pt;
}

export function uartLayout(seed: number): UartLayout {
  const c = { u: 0.5, v: 0.47 };
  const names = new Rng(hashSeed(seed, 'uart')).shuffle<UartPin>(['GND', 'TX', 'RX', '3V3']);
  return {
    panel: { c, w: 0.38, h: 0.28 },
    pins: names.map((_, i) => ({ u: c.u - 0.27 + i * 0.075, v: c.v - 0.1 })),
    names,
    leads: UART_LEADS.map((_, i) => ({ u: c.u - 0.25 + i * 0.08, v: c.v + 0.16 })),
    screen: { u: c.u + 0.17, v: c.v - 0.05 },
    ok: { u: c.u + 0.17, v: c.v + 0.17 },
  };
}

/** Seconds the controller takes to boot and print its log. */
export const UART_BOOT_SECONDS = 1.2;

// ---------------------------------------------------------------- battery pack

/** A healthy lithium-ion cell rests around 3.6–4.2 V; under 3.0 V it is dead and must be replaced. */
export const DEAD_VOLTS = 3.0;

export interface PackLayout {
  panel: Panel;
  /** The cells in series, left to right, and what each one reads. */
  cells: Pt[];
  volts: number[];
  dead: number;
  /** The nickel strip tabs of a cell (top, bottom). */
  tabs: (i: number) => [Pt, Pt];
  /** Where the new cell waits, its starting polarity (true: + at the top), and the bin. */
  fresh: Pt;
  freshUp: boolean;
  bin: Pt;
}

/** In series the cells alternate: slot 0 has + at the top, slot 1 at the bottom... */
export function cellUp(slot: number): boolean {
  return slot % 2 === 0;
}

export function packLayout(seed: number, n = 4): PackLayout {
  const c = { u: 0.5, v: 0.45 };
  const rng = new Rng(hashSeed(seed, 'pack'));
  const dead = rng.int(0, n - 1);
  const healthy = 3.7 + rng.int(0, 30) / 100;
  const volts = Array.from({ length: n }, (_, i) =>
    i === dead ? 2.1 + rng.int(0, 60) / 100 : Math.round((healthy + rng.int(-4, 4) / 100) * 100) / 100,
  );
  const cells = volts.map((_, i) => ({ u: c.u - 0.24 + i * 0.1, v: c.v - 0.02 }));
  return {
    panel: { c, w: 0.4, h: 0.3 },
    cells,
    volts,
    dead,
    tabs: (i) => [
      { u: cells[i].u, v: cells[i].v - 0.1 },
      { u: cells[i].u, v: cells[i].v + 0.1 },
    ],
    fresh: { u: c.u + 0.26, v: c.v + 0.12 },
    freshUp: rng.chance(0.5),
    bin: { u: c.u + 0.26, v: c.v - 0.12 },
  };
}

/** A good solder joint: hold the iron until the solder flows (green), not so long it cooks the cell. */
export const SOLDER_BAND: [number, number] = [0.6, 0.82];
export const SOLDER_RATE = 0.65;
/** Seconds of iron on a tab to melt the old joint. */
export const DESOLDER_SECONDS = 0.5;

// ---------------------------------------------------------------- drone propellers

export interface PropLayout {
  panel: Panel;
  /** Motors of an X quad (front left, front right, back right, back left) and how each one spins. */
  motors: Pt[];
  spin: Array<1 | -1>;
  /** The four props waiting in the tray, and which way each one is made to spin. */
  props: Pt[];
  propSpin: Array<1 | -1>;
}

export function propLayout(seed: number): PropLayout {
  const c = { u: 0.5, v: 0.43 };
  const d = 0.13;
  const motors = [
    { u: c.u - d, v: c.v - d },
    { u: c.u + d, v: c.v - d },
    { u: c.u + d, v: c.v + d },
    { u: c.u - d, v: c.v + d },
  ];
  // Diagonal motors turn the same way, so the quad doesn't spin round (1 = clockwise).
  const spin: Array<1 | -1> = [1, -1, 1, -1];
  const propSpin = new Rng(hashSeed(seed, 'props')).shuffle<1 | -1>([1, 1, -1, -1]);
  return {
    panel: { c: { u: 0.5, v: 0.47 }, w: 0.36, h: 0.3 },
    motors,
    spin,
    props: propSpin.map((_, i) => ({ u: c.u - 0.24 + i * 0.16, v: c.v + 0.27 })),
    propSpin,
  };
}

// ---------------------------------------------------------------- vent and purge

export interface VentLayout {
  panel: Panel;
  /** The vent valve, the tank pressure gauge, the nitrogen port and its hose, the purge valve and
   * the fuel vapour meter. */
  vent: Pt;
  gauge: Pt;
  port: Pt;
  hose: Pt;
  purge: Pt;
  meter: Pt;
}

export function ventLayout(): VentLayout {
  const c = { u: 0.5, v: 0.47 };
  return {
    panel: { c, w: 0.38, h: 0.28 },
    vent: { u: c.u - 0.2, v: c.v - 0.08 },
    gauge: { u: c.u - 0.2, v: c.v + 0.14 },
    port: { u: c.u + 0.04, v: c.v - 0.08 },
    hose: { u: c.u + 0.04, v: c.v + 0.16 },
    purge: { u: c.u + 0.2, v: c.v - 0.08 },
    meter: { u: c.u + 0.28, v: c.v + 0.12 },
  };
}

/** Turns to open (or close) the vent valve, the tank pressure at the start and how fast it bleeds. */
export const VENT_TURNS = Math.PI * 2;
export const VENT_START = 0.8;
export const VENT_RATE = 0.45;
/** Fuel vapour at the start, how fast nitrogen purges it, and the safe line to get under. */
export const VAPOUR_START = 0.9;
export const PURGE_RATE = 0.45;
export const VAPOUR_SAFE = 0.1;

// ---------------------------------------------------------------- remove before flight

export interface RbfLayout {
  /** The safe-and-arm devices the safing pins go in (clear of the hose sockets and caps). */
  spots: Pt[];
  /** Which way each pin's streamer hangs off it (1: to the right). */
  side: Array<1 | -1>;
  /** The board below the panel where pulled pins hang (one hook each), and its centre. */
  rack: Pt[];
  board: Pt;
}

export function rbfLayout(r: Rig): RbfLayout {
  const g = panelGeom(r);
  const spots = [
    { u: g.cx - g.rx * 0.9, v: g.cy + g.ry * 0.35 },
    { u: g.cx + g.rx * 0.9, v: g.cy + g.ry * 0.35 },
    { u: g.cx - g.rx * 0.9, v: g.cy - g.ry * 0.72 },
  ];
  return {
    spots,
    side: [1, -1, 1],
    rack: spots.map((_, i) => ({ u: 0.4 + i * 0.1, v: 0.915 })),
    board: { u: 0.5, v: 0.93 },
  };
}

// ---------------------------------------------------------------- gimbal alignment

export interface GimbalLayout {
  panel: Panel;
  /** The target the engine's laser dot must hit. */
  target: Pt;
  /** Jackscrew knobs and lock nuts of the pitch and yaw actuators. */
  knobs: [Pt, Pt];
  locks: [Pt, Pt];
  /** Starting misalignment of pitch and yaw, -1..1. */
  start: [number, number];
}

export function gimbalLayout(seed: number): GimbalLayout {
  const c = { u: 0.5, v: 0.47 };
  const rng = new Rng(hashSeed(seed, 'gimbal'));
  const off = () => (rng.chance(0.5) ? 1 : -1) * (0.35 + rng.int(0, 45) / 100);
  return {
    panel: { c, w: 0.38, h: 0.29 },
    target: { u: c.u - 0.1, v: c.v - 0.04 },
    knobs: [
      { u: c.u + 0.23, v: c.v - 0.1 },
      { u: c.u - 0.1, v: c.v + 0.19 },
    ],
    locks: [
      { u: c.u + 0.23, v: c.v + 0.06 },
      { u: c.u + 0.11, v: c.v + 0.19 },
    ],
    start: [off(), off()],
  };
}

/** How far one radian of the jackscrew moves the dot (offset units), and the bullseye. */
export const GIMBAL_RATE = 0.06;
export const GIMBAL_TOL = 0.07;

// ---------------------------------------------------------------- heat shield tiles

export interface TileLayout {
  panel: Panel;
  /** Every tile: where it is and its part number (each tile is cut for its own spot). */
  tiles: Array<{ p: Pt; id: string }>;
  /** The cracked ones (indices into tiles). */
  cracked: number[];
  /** New tiles in the tray (part numbers, the cracked ones' plus look-alikes) and where they sit. */
  spares: string[];
  trays: Pt[];
}

export function tileLayout(seed: number): TileLayout {
  const c = { u: 0.5, v: 0.44 };
  const rng = new Rng(hashSeed(seed, 'tiles'));
  const cols = 4;
  const rows = 3;
  const base = 100 + rng.int(0, 8) * 10;
  const tiles = Array.from({ length: cols * rows }, (_, i) => ({
    p: { u: c.u - 0.21 + (i % cols) * 0.14, v: c.v - 0.13 + Math.floor(i / cols) * 0.115 },
    id: `T${base + i}`,
  }));
  const cracked = rng
    .shuffle(tiles.map((_, i) => i))
    .slice(0, 2)
    .sort((a, b) => a - b);
  // Look-alikes: numbers next to the cracked ones (easy to grab the wrong one).
  const used = new Set(cracked);
  const decoys = cracked.map((i) => {
    const j =
      [1, -1, 2, -2, 3, -3].map((d) => i + d).find((k) => k >= 0 && k < tiles.length && !used.has(k)) ?? i;
    used.add(j);
    return tiles[j].id;
  });
  const spares = rng.shuffle([...cracked.map((i) => tiles[i].id), ...decoys]);
  return {
    panel: { c: { u: 0.5, v: 0.47 }, w: 0.38, h: 0.31 },
    tiles,
    cracked,
    spares,
    trays: spares.map((_, i) => ({ u: c.u - 0.21 + i * 0.14, v: c.v + 0.3 })),
  };
}

/** Bonding: butter the adhesive (RTV) to the green, then hold the tile while it grabs. */
export const RTV_BAND: [number, number] = [0.55, 0.8];
export const RTV_RATE = 0.6;
export const PRESS_SECONDS = 0.7;
