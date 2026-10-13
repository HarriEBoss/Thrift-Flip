/**
 * Repairs, done "for real" and different per object. The item is turned to its compartment (the base
 * of a lamp, the back of a radio, the case back of a watch, the hood of a car), the cover comes off,
 * then a list of hands-on tasks is done in order (reconnect wires, swap a broken part, pour oil,
 * unbolt and hoist an engine, plug in motherboard cables...), the repair is tested and the cover goes
 * back on. This module is pure: which way each object turns, which tasks it needs and where
 * everything sits (stage unit coordinates, 0..1).
 */
import { Rng } from './prng';
import type { CategoryId } from './types';

/**
 * How the item turns: tip it over to see the base, spin it round to see the back, or (cars and vans)
 * zoom in on the hood.
 */
export type RepairView = 'base' | 'back' | 'hood';
/** How the cover comes off: screws, a twist-off case back, a hood you lift, or a glued phone back. */
export type LidKind = 'screws' | 'twist' | 'hood' | 'glued';
/** What is inside. 'bay' is an engine bay whose engine is a movable part (engine swaps). */
export type Inside =
  | 'socket'
  | 'board'
  | 'tubes'
  | 'movement'
  | 'battery'
  | 'pc'
  | 'engine'
  | 'bay'
  | 'phone'
  | 'robot'
  | 'rocket';
/** What lights up (or starts) when the repair is tested. */
export type Glow = 'bulb' | 'tubes' | 'screen' | 'led' | 'engine';
/** A part that gets swapped for a new one. */
export type PartKind =
  | 'battery'
  | 'fan'
  | 'ram'
  | 'drive'
  | 'cell'
  /** A phone's flat lithium pouch battery. */
  | 'pouch'
  | 'plug'
  | 'cooler'
  | 'gpu'
  | 'screen'
  | 'camera'
  | 'servo'
  | 'chip'
  | 'pump';
export type Fluid = 'oil' | 'coolant' | 'fuel';
/** Plug sets: PC motherboard cables, phone flex cables, robot wiring harness (pins); engine and rocket fuel hoses. */
export type CableSetId = 'pc' | 'phone' | 'harness' | 'hoses' | 'fuel';
/** Corners / centre of the compartment where things sit. */
export type Zone = 'tl' | 'tr' | 'bl' | 'br' | 'c';

/** One hands-on job inside the compartment. */
export type TaskSpec =
  /** Connect each loose wire to the terminal with the same colour and symbol. */
  | { k: 'wires' }
  /**
   * Pull the broken part out to the bin, then put the new one in its slot. With `paste`, thermal
   * paste goes on the CPU in between (CPU coolers). With `fit` (building something new) the slot is
   * empty: just fit the new part.
   */
  | { k: 'swap'; part: PartKind; zone?: Zone; paste?: boolean; fit?: boolean }
  /** Hold on the filler cap and stop with the level in the green band. */
  | { k: 'pour'; fluid: Fluid }
  /** Hold on the drain plug until the old fluid has run out. */
  | { k: 'drain'; fluid: Fluid }
  /** Hold the spanner on each bolt (engine mounts, card bracket) to undo or tighten it. */
  | { k: 'bolts'; n: number; dir: 'out' | 'in'; at: 'engine' | 'card' }
  /** Engine swap: hoist the old engine out, or lower the new one in. */
  | { k: 'hoist'; dir: 'out' | 'in' }
  /** Plug each cable or hose into its matching socket (by shape and label). */
  | { k: 'cables'; set: CableSetId }
  /** Blow the dust bunnies away with the air can. */
  | { k: 'dust'; n: number }
  /** Squeeze thermal paste onto the CPU: a pea-sized dot, not too much. */
  | { k: 'paste' }
  /**
   * Seat a chip in its socket: open the lever, turn the chip so its corner mark lines up with the
   * socket's (a wrong drop bends the pins), drop it in and close the lever.
   */
  | { k: 'socket'; chip: 'cpu' | 'mcu' }
  /**
   * Tighten bolts in their torque sequence (the numbers stamped beside them): first snug each in
   * order, then torque each with the gauge, stopping in the green.
   */
  | { k: 'torque'; at: TorqueAt }
  /** Memory: open the slot latches, turn the stick so its notch matches, push it into A2 until it clicks. */
  | { k: 'ram' }
  /** Front-panel pins: power and reset switches, power and drive LEDs (LEDs have a + and a −). */
  | { k: 'header' }
  /** Serpentine belt: route it round the pulleys in the diagram's order, then let the tensioner go. */
  | { k: 'belt' }
  /** Centre a robot servo: turn the horn to exactly 90 degrees. */
  | { k: 'servo' }
  /** Pressure test the fuel lines: pressurise, find the bubbling fitting and tighten it. */
  | { k: 'leak' }
  /** Plug the OBD-II scanner in under the dash and read the trouble code (it stays pinned). */
  | { k: 'obd' }
  /**
   * Spark plug job on the misfiring cylinder (from the trouble code): unclip the coil, pull it,
   * unscrew the old plug, gap the new one, thread it in, torque it, refit the coil and its clip.
   */
  | { k: 'plugs'; n: 1 | 4 }
  /** Battery: negative off first, positive off, hold-down, swap; positive on first, negative last. */
  | { k: 'battery'; fit?: boolean }
  /** Oil filter: twist the old one off, oil the new one's seal, spin it on hand-tight. */
  | { k: 'filter' }
  /** Fuse box: find the circuit from the symptom, test, pull the blown fuse, fit the same rating. */
  | { k: 'fuse' }
  /** Phones: pop the battery connector off first, before touching anything else. */
  | { k: 'unplug' };

export type TorqueAt = 'cooler' | 'engine' | 'nozzle';

export interface Rig {
  view: RepairView;
  panel: 'round' | 'rect';
  lid: LidKind;
  /** Number of screws holding the cover (0 for a twist-off lid or a hood). */
  screws: number;
  inside: Inside;
  glow: Glow;
  /** Mains wiring (brown / blue / green-yellow) instead of low-voltage colours. */
  mains: boolean;
  /** Width / height of a rectangular panel. */
  aspect: number;
  /** What to do once the cover is off, in order. */
  tasks: TaskSpec[];
  /** Building something new: it starts open and empty, and the cover goes on at the end. */
  build?: boolean;
}

const rig = (r: Partial<Rig> & Pick<Rig, 'view' | 'panel' | 'inside' | 'glow'>): Rig => ({
  lid: 'screws',
  screws: 4,
  mains: false,
  aspect: 1.3,
  tasks: [{ k: 'wires' }],
  ...r,
});

export function hasTask(r: Rig, k: TaskSpec['k']): boolean {
  return r.tasks.some((t) => t.k === k);
}

/** One rig per item shape (category:shape index). */
const RIGS: Record<string, Rig> = {
  // Lamps: tip them over and open the base.
  'lamps:0': rig({ view: 'base', panel: 'round', screws: 3, inside: 'socket', glow: 'bulb', mains: true }),
  'lamps:1': rig({ view: 'base', panel: 'round', screws: 4, inside: 'socket', glow: 'bulb', mains: true }),
  'lamps:2': rig({ view: 'base', panel: 'round', screws: 3, inside: 'socket', glow: 'bulb', mains: true }),
  'lamps:3': rig({ view: 'base', panel: 'round', screws: 3, inside: 'battery', glow: 'bulb' }),
  'lamps:4': rig({ view: 'base', panel: 'round', screws: 3, inside: 'socket', glow: 'bulb', mains: true }),
  // Clocks: open the back.
  'clocks:0': rig({ view: 'back', panel: 'round', screws: 2, inside: 'movement', glow: 'led' }),
  'clocks:1': rig({ view: 'back', panel: 'round', lid: 'twist', screws: 0, inside: 'movement', glow: 'led' }),
  'clocks:2': rig({ view: 'back', panel: 'rect', screws: 4, inside: 'movement', glow: 'led', aspect: 1.1 }),
  'clocks:3': rig({ view: 'back', panel: 'round', lid: 'twist', screws: 0, inside: 'movement', glow: 'led' }),
  'clocks:4': rig({ view: 'back', panel: 'rect', screws: 4, inside: 'board', glow: 'screen', aspect: 1.5 }),
  // Radios and TVs: take the back off.
  'radios:0': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'tubes',
    glow: 'tubes',
    mains: true,
    aspect: 1.35,
  }),
  'radios:1': rig({ view: 'back', panel: 'rect', screws: 2, inside: 'battery', glow: 'led', aspect: 1.4 }),
  'radios:2': rig({ view: 'back', panel: 'rect', screws: 6, inside: 'board', glow: 'led', aspect: 1.7 }),
  'radios:3': rig({
    view: 'base',
    panel: 'rect',
    screws: 4,
    inside: 'board',
    glow: 'led',
    mains: true,
    aspect: 1.25,
  }),
  'radios:4': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'tubes',
    glow: 'screen',
    mains: true,
    aspect: 1.2,
  }),
  // Curiosities with a light or motor in them.
  'curios:0': rig({ view: 'base', panel: 'round', screws: 3, inside: 'socket', glow: 'bulb', mains: true }),
  'curios:1': rig({
    view: 'base',
    panel: 'rect',
    screws: 4,
    inside: 'board',
    glow: 'led',
    mains: true,
    aspect: 1.5,
  }),
  'curios:2': rig({ view: 'back', panel: 'rect', screws: 2, inside: 'battery', glow: 'bulb', aspect: 1.5 }),
  'curios:3': rig({ view: 'base', panel: 'round', screws: 3, inside: 'battery', glow: 'led' }),
  'curios:4': rig({ view: 'base', panel: 'round', lid: 'twist', screws: 0, inside: 'battery', glow: 'led' }),
};

const DEFAULT_RIG = rig({ view: 'back', panel: 'rect', inside: 'board', glow: 'led' });

export function rigFor(cat: CategoryId, shape: number): Rig {
  return RIGS[`${cat}:${shape}`] ?? DEFAULT_RIG;
}

/**
 * The "Repair" step of big-ticket items you buy (computers, consoles, cars, bikes): open it up, swap
 * the broken part, top up fluids, reconnect wiring, then test it.
 */
const FIX_RIGS: Record<string, Rig> = {
  'tech:0': rig({
    view: 'back',
    panel: 'rect',
    inside: 'pc',
    glow: 'screen',
    mains: true,
    aspect: 1.2,
    tasks: [
      { k: 'dust', n: 4 },
      { k: 'swap', part: 'fan' },
      { k: 'cables', set: 'pc' },
    ],
  }),
  'tech:1': rig({
    view: 'base',
    panel: 'rect',
    screws: 6,
    inside: 'pc',
    glow: 'screen',
    aspect: 1.5,
    tasks: [{ k: 'swap', part: 'ram' }, { k: 'swap', part: 'drive', zone: 'tl' }, { k: 'wires' }],
  }),
  'tech:2': rig({
    view: 'back',
    panel: 'rect',
    inside: 'pc',
    glow: 'led',
    aspect: 1.6,
    tasks: [{ k: 'dust', n: 3 }, { k: 'swap', part: 'fan' }, { k: 'wires' }],
  }),
  'tech:3': rig({
    view: 'back',
    panel: 'rect',
    inside: 'pc',
    glow: 'screen',
    mains: true,
    aspect: 1.05,
    tasks: [{ k: 'swap', part: 'drive' }, { k: 'dust', n: 3 }, { k: 'wires' }],
  }),
  'tech:4': rig({
    view: 'back',
    panel: 'rect',
    screws: 2,
    inside: 'battery',
    glow: 'screen',
    aspect: 1.1,
    tasks: [{ k: 'swap', part: 'cell' }, { k: 'wires' }],
  }),
  'vehicles:0': rig({
    view: 'hood',
    panel: 'rect',
    lid: 'hood',
    screws: 0,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.5,
    tasks: [{ k: 'obd' }, { k: 'plugs', n: 4 }, { k: 'battery' }, { k: 'pour', fluid: 'oil' }],
  }),
  'vehicles:1': rig({
    view: 'hood',
    panel: 'rect',
    lid: 'hood',
    screws: 0,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.5,
    tasks: [
      { k: 'drain', fluid: 'oil' },
      { k: 'filter' },
      { k: 'pour', fluid: 'oil' },
      { k: 'battery' },
      { k: 'pour', fluid: 'coolant' },
      { k: 'wires' },
    ],
  }),
  'vehicles:2': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.4,
    tasks: [{ k: 'obd' }, { k: 'plugs', n: 1 }, { k: 'pour', fluid: 'oil' }],
  }),
  'vehicles:3': rig({
    view: 'back',
    panel: 'rect',
    screws: 2,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.4,
    tasks: [{ k: 'obd' }, { k: 'plugs', n: 1 }, { k: 'drain', fluid: 'oil' }, { k: 'pour', fluid: 'oil' }],
  }),
  'vehicles:4': rig({
    view: 'hood',
    panel: 'rect',
    lid: 'hood',
    screws: 0,
    inside: 'engine',
    glow: 'engine',
    aspect: 1.5,
    tasks: [{ k: 'fuse' }, { k: 'battery' }, { k: 'pour', fluid: 'coolant' }, { k: 'wires' }],
  }),
  // Phones: open the back (a glued back needs the heat gun first), swap the worn part, reconnect.
  'phones:0': rig({
    view: 'back',
    panel: 'rect',
    screws: 2,
    inside: 'phone',
    glow: 'screen',
    aspect: 0.9,
    tasks: [{ k: 'unplug' }, { k: 'swap', part: 'pouch' }, { k: 'cables', set: 'phone' }, { k: 'wires' }],
  }),
  'phones:1': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'phone',
    glow: 'screen',
    aspect: 0.9,
    tasks: [
      { k: 'unplug' },
      { k: 'swap', part: 'screen', zone: 'c' },
      { k: 'swap', part: 'pouch' },
      { k: 'cables', set: 'phone' },
    ],
  }),
  'phones:2': rig({
    view: 'back',
    panel: 'rect',
    lid: 'glued',
    screws: 0,
    inside: 'phone',
    glow: 'screen',
    aspect: 0.9,
    tasks: [
      { k: 'unplug' },
      { k: 'swap', part: 'pouch' },
      { k: 'swap', part: 'camera', zone: 'tl' },
      { k: 'cables', set: 'phone' },
    ],
  }),
  'phones:3': rig({
    view: 'back',
    panel: 'rect',
    lid: 'glued',
    screws: 0,
    inside: 'phone',
    glow: 'screen',
    aspect: 1.2,
    tasks: [
      { k: 'unplug' },
      { k: 'dust', n: 3 },
      { k: 'swap', part: 'pouch' },
      { k: 'cables', set: 'phone' },
    ],
  }),
  'phones:4': rig({
    view: 'back',
    panel: 'round',
    lid: 'twist',
    screws: 0,
    inside: 'phone',
    glow: 'screen',
    tasks: [{ k: 'unplug' }, { k: 'dust', n: 2 }, { k: 'swap', part: 'pouch' }],
  }),
  // Robots: motors (servos), controller chips, batteries and the wiring harness.
  'robots:0': rig({
    view: 'back',
    panel: 'rect',
    inside: 'robot',
    glow: 'led',
    aspect: 1.2,
    tasks: [
      { k: 'swap', part: 'servo', zone: 'tl' },
      { k: 'servo' },
      { k: 'swap', part: 'chip' },
      { k: 'cables', set: 'harness' },
    ],
  }),
  'robots:1': rig({
    view: 'back',
    panel: 'rect',
    inside: 'robot',
    glow: 'led',
    aspect: 1.0,
    tasks: [{ k: 'dust', n: 3 }, { k: 'swap', part: 'battery' }, { k: 'wires' }],
  }),
  'robots:2': rig({
    view: 'base',
    panel: 'round',
    screws: 4,
    inside: 'robot',
    glow: 'led',
    tasks: [
      { k: 'dust', n: 4 },
      { k: 'swap', part: 'servo' },
      { k: 'swap', part: 'cell', zone: 'tl' },
    ],
  }),
  'robots:3': rig({
    view: 'base',
    panel: 'rect',
    inside: 'robot',
    glow: 'led',
    aspect: 1.2,
    tasks: [
      { k: 'swap', part: 'servo', zone: 'tl' },
      { k: 'swap', part: 'cell' },
      { k: 'cables', set: 'harness' },
    ],
  }),
  'robots:4': rig({
    view: 'back',
    panel: 'rect',
    screws: 6,
    inside: 'robot',
    glow: 'led',
    aspect: 1.3,
    tasks: [
      { k: 'swap', part: 'servo', zone: 'tl' },
      { k: 'swap', part: 'chip', zone: 'c' },
      { k: 'cables', set: 'harness' },
      { k: 'wires' },
    ],
  }),
  // Rockets and spacecraft: fuel systems, pumps, avionics.
  'rockets:0': rig({
    view: 'back',
    panel: 'rect',
    screws: 6,
    inside: 'rocket',
    glow: 'engine',
    aspect: 1.05,
    tasks: [
      { k: 'drain', fluid: 'fuel' },
      { k: 'bolts', n: 4, dir: 'out', at: 'engine' },
      { k: 'swap', part: 'pump', zone: 'c' },
      { k: 'bolts', n: 4, dir: 'in', at: 'engine' },
      { k: 'cables', set: 'fuel' },
      { k: 'leak' },
      { k: 'pour', fluid: 'fuel' },
      { k: 'wires' },
    ],
  }),
  'rockets:1': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'rocket',
    glow: 'screen',
    aspect: 1.1,
    tasks: [
      { k: 'dust', n: 3 },
      { k: 'swap', part: 'chip', zone: 'tl' },
      { k: 'swap', part: 'cell' },
      { k: 'cables', set: 'harness' },
      { k: 'wires' },
    ],
  }),
  'rockets:2': rig({
    view: 'back',
    panel: 'rect',
    screws: 6,
    inside: 'rocket',
    glow: 'engine',
    aspect: 1.05,
    tasks: [
      { k: 'drain', fluid: 'fuel' },
      { k: 'swap', part: 'pump', zone: 'c' },
      { k: 'cables', set: 'fuel' },
      { k: 'leak' },
      { k: 'pour', fluid: 'fuel' },
    ],
  }),
  'rockets:3': rig({
    view: 'back',
    panel: 'rect',
    screws: 6,
    inside: 'rocket',
    glow: 'screen',
    aspect: 1.05,
    tasks: [
      { k: 'swap', part: 'chip', zone: 'tl' },
      { k: 'cables', set: 'harness' },
      { k: 'pour', fluid: 'coolant' },
      { k: 'wires' },
    ],
  }),
  'rockets:4': rig({
    view: 'back',
    panel: 'rect',
    screws: 4,
    inside: 'robot',
    glow: 'led',
    aspect: 1.2,
    tasks: [
      { k: 'dust', n: 4 },
      { k: 'swap', part: 'servo', zone: 'tl' },
      { k: 'swap', part: 'cell' },
      { k: 'cables', set: 'harness' },
      { k: 'wires' },
    ],
  }),
};

const DEFAULT_FIX_RIG = rig({
  view: 'back',
  panel: 'rect',
  inside: 'pc',
  glow: 'led',
  tasks: [{ k: 'swap', part: 'fan' }, { k: 'wires' }],
});

export function fixRigFor(cat: CategoryId, shape: number): Rig {
  return FIX_RIGS[`${cat}:${shape}`] ?? DEFAULT_FIX_RIG;
}

/** Big customer jobs at the Computer Workshop and the Car Garage. */
export type JobKind = 'service' | 'pc' | 'engine' | 'design';

/**
 * A full PC rebuild: dust it out, fresh thermal paste, new cooler, new memory and drive, plug in every
 * motherboard cable, screw the graphics card down.
 */
export function pcRebuildRig(): Rig {
  return rig({
    view: 'back',
    panel: 'rect',
    inside: 'pc',
    glow: 'screen',
    mains: true,
    aspect: 1.05,
    tasks: [
      { k: 'dust', n: 5 },
      { k: 'swap', part: 'cooler', zone: 'tl', paste: true },
      { k: 'torque', at: 'cooler' },
      { k: 'swap', part: 'ram' },
      { k: 'swap', part: 'gpu', zone: 'c' },
      { k: 'bolts', n: 2, dir: 'in', at: 'card' },
      { k: 'cables', set: 'pc' },
    ],
  });
}

/**
 * An engine swap: drain the oil, undo the engine mounts, hoist the old engine out, lower the new one
 * in, bolt it down, reconnect the hoses, fill oil and coolant, new battery, ignition wiring.
 */
export function engineSwapRig(): Rig {
  return rig({
    view: 'hood',
    panel: 'rect',
    lid: 'hood',
    screws: 0,
    inside: 'bay',
    glow: 'engine',
    aspect: 1.05,
    tasks: [
      { k: 'drain', fluid: 'oil' },
      { k: 'bolts', n: 4, dir: 'out', at: 'engine' },
      { k: 'hoist', dir: 'out' },
      { k: 'hoist', dir: 'in' },
      { k: 'bolts', n: 4, dir: 'in', at: 'engine' },
      { k: 'belt' },
      { k: 'cables', set: 'hoses' },
      { k: 'pour', fluid: 'oil' },
      { k: 'pour', fluid: 'coolant' },
      { k: 'battery' },
      { k: 'wires' },
    ],
  });
}

/**
 * Building a custom design from scratch (after the blueprint is approved): the frame is open and
 * empty, every part is fitted, bolted and plugged in, fluids go in, then the cover goes on.
 */
const BUILD_RIGS: Partial<Record<CategoryId, Rig>> = {
  tech: rig({
    view: 'back',
    panel: 'rect',
    inside: 'pc',
    glow: 'screen',
    mains: true,
    aspect: 1.05,
    build: true,
    tasks: [
      { k: 'socket', chip: 'cpu' },
      { k: 'swap', part: 'cooler', zone: 'tl', paste: true, fit: true },
      { k: 'torque', at: 'cooler' },
      { k: 'ram' },
      { k: 'swap', part: 'gpu', zone: 'c', fit: true },
      { k: 'bolts', n: 2, dir: 'in', at: 'card' },
      { k: 'swap', part: 'drive', zone: 'bl', fit: true },
      { k: 'cables', set: 'pc' },
      { k: 'header' },
    ],
  }),
  vehicles: rig({
    view: 'hood',
    panel: 'rect',
    lid: 'hood',
    screws: 0,
    inside: 'bay',
    glow: 'engine',
    aspect: 1.05,
    build: true,
    tasks: [
      { k: 'hoist', dir: 'in' },
      { k: 'torque', at: 'engine' },
      { k: 'belt' },
      { k: 'cables', set: 'hoses' },
      { k: 'pour', fluid: 'oil' },
      { k: 'pour', fluid: 'coolant' },
      { k: 'battery', fit: true },
      { k: 'wires' },
    ],
  }),
  robots: rig({
    view: 'back',
    panel: 'rect',
    inside: 'robot',
    glow: 'led',
    aspect: 1.2,
    build: true,
    tasks: [
      { k: 'swap', part: 'servo', zone: 'tl', fit: true },
      { k: 'servo' },
      { k: 'socket', chip: 'mcu' },
      { k: 'swap', part: 'battery', fit: true },
      { k: 'swap', part: 'camera', zone: 'bl', fit: true },
      { k: 'cables', set: 'harness' },
    ],
  }),
  rockets: rig({
    view: 'back',
    panel: 'rect',
    screws: 6,
    inside: 'rocket',
    glow: 'engine',
    aspect: 1.05,
    build: true,
    tasks: [
      { k: 'swap', part: 'pump', zone: 'c', fit: true },
      { k: 'torque', at: 'nozzle' },
      { k: 'swap', part: 'chip', zone: 'tl', fit: true },
      { k: 'cables', set: 'fuel' },
      { k: 'leak' },
      { k: 'pour', fluid: 'fuel' },
      { k: 'wires' },
    ],
  }),
};

export function buildRigFor(cat: CategoryId, shape: number): Rig {
  return BUILD_RIGS[cat] ?? { ...fixRigFor(cat, shape), build: true };
}

/** The rig for a repair step: the wire step, the item's own Repair step, a big job or a build. */
export function repairRig(
  step: 'wire' | 'fix' | 'build',
  cat: CategoryId,
  shape: number,
  job?: JobKind,
): Rig {
  if (step === 'build') return buildRigFor(cat, shape);
  if (step === 'fix' && job === 'pc') return pcRebuildRig();
  if (step === 'fix' && job === 'engine') return engineSwapRig();
  return step === 'fix' ? fixRigFor(cat, shape) : rigFor(cat, shape);
}

/** Centre of a zone of the compartment. */
export function zonePt(r: Rig, z: Zone): Pt {
  const g = panelGeom(r);
  const k = { tl: [-0.6, -0.6], tr: [0.6, -0.62], bl: [-0.62, 0.62], br: [0.62, 0.62], c: [0, 0.05] }[z];
  return { u: g.cx + g.rx * k[0], v: g.cy + g.ry * k[1] };
}

export function partSize(kind: PartKind): { w: number; h: number } {
  switch (kind) {
    case 'battery':
      return { w: 0.2, h: 0.15 };
    case 'fan':
    case 'cooler':
      return { w: 0.16, h: 0.16 };
    case 'ram':
      return { w: 0.24, h: 0.07 };
    case 'drive':
      return { w: 0.2, h: 0.13 };
    case 'cell':
      return { w: 0.18, h: 0.07 };
    case 'pouch':
      return { w: 0.15, h: 0.2 };
    case 'plug':
      return { w: 0.07, h: 0.17 };
    case 'gpu':
      return { w: 0.4, h: 0.11 };
    case 'screen':
      return { w: 0.24, h: 0.3 };
    case 'camera':
      return { w: 0.09, h: 0.09 };
    case 'servo':
      return { w: 0.17, h: 0.12 };
    case 'chip':
      return { w: 0.16, h: 0.12 };
    case 'pump':
      return { w: 0.2, h: 0.18 };
  }
}

/** Where the broken part sits, where the new one waits, and where old parts are dropped. */
export interface SwapLayout {
  slot: Pt;
  fresh: Pt;
  bin: Pt;
  w: number;
  h: number;
}

export function swapLayout(r: Rig, spec: { part: PartKind; zone?: Zone }): SwapLayout {
  const { w, h } = partSize(spec.part);
  return { slot: zonePt(r, spec.zone ?? 'tr'), fresh: zonePt(r, 'br'), bin: zonePt(r, 'bl'), w, h };
}

/** Filler cap (pour), drain plug (drain), CPU (paste) and the level gauge next to it. */
export interface PourLayout {
  cap: Pt;
  gauge: Pt;
}

export function pourLayout(
  r: Rig,
  kind: 'pour' | 'drain' | 'paste' = 'pour',
  fluid: Fluid = 'oil',
): PourLayout {
  const g = panelGeom(r);
  if (kind === 'drain')
    return {
      cap: { u: g.cx - g.rx * 0.55, v: g.cy + g.ry * 0.7 },
      gauge: { u: g.cx - g.rx * 0.25, v: g.cy + g.ry * 0.62 },
    };
  if (kind === 'paste')
    return {
      cap: { u: g.cx - g.rx * 0.6, v: g.cy - g.ry * 0.6 },
      gauge: { u: g.cx - g.rx * 0.28, v: g.cy - g.ry * 0.6 },
    };
  if (r.inside === 'bay') {
    // Engine swap: oil goes in on top of the engine, coolant into the radiator at the front.
    return fluid === 'oil'
      ? {
          cap: { u: g.cx - g.rx * 0.2, v: g.cy - g.ry * 0.2 },
          gauge: { u: g.cx + g.rx * 0.08, v: g.cy - g.ry * 0.2 },
        }
      : {
          cap: { u: g.cx - g.rx * 0.1, v: g.cy - g.ry * 0.8 },
          gauge: { u: g.cx + g.rx * 0.18, v: g.cy - g.ry * 0.8 },
        };
  }
  // Oil on the left, coolant on the right, so a second fluid never lands on the first.
  const side = fluid === 'oil' ? -1 : 1;
  return {
    cap: { u: g.cx + side * g.rx * 0.6, v: g.cy - g.ry * 0.6 },
    gauge: { u: g.cx + side * g.rx * 0.3, v: g.cy - g.ry * 0.6 },
  };
}

/** Fill level band that counts as "just right". */
export const POUR_BAND: [number, number] = [0.7, 0.88];
/** Fill speed while holding (level per second). */
export const POUR_RATE = 0.45;
/** Thermal paste: a pea-sized dot. */
export const PASTE_BAND: [number, number] = [0.45, 0.68];
/** Drained when the old fluid is below this. */
export const DRAIN_DONE = 0.08;

/** New level after pouring for dt seconds (never above 1). */
export function pourStep(level: number, dt: number, rate = POUR_RATE): number {
  return Math.min(1, level + Math.max(0, dt) * rate);
}

/** Score for stopping at `level`: full marks in the band, a little less when overfilled. */
export function pourScore(level: number, band: [number, number] = POUR_BAND): number {
  if (level < band[0]) return 0;
  if (level <= band[1]) return 1;
  return Math.max(0.6, 1 - (level - band[1]) * 2.5);
}

/** Bolts: engine mounts around the engine, or the graphics card bracket at the right. */
export function boltLayout(r: Rig, spec: { n: number; at: 'engine' | 'card' }): Pt[] {
  const g = panelGeom(r);
  if (spec.at === 'card') {
    const c = zonePt(r, 'c');
    return Array.from({ length: spec.n }, (_, i) => ({ u: c.u + 0.17, v: c.v - 0.025 + i * 0.05 }));
  }
  const pts: Pt[] = [
    { u: g.cx - g.rx * 0.55, v: g.cy - g.ry * 0.38 },
    { u: g.cx + g.rx * 0.55, v: g.cy - g.ry * 0.38 },
    { u: g.cx + g.rx * 0.55, v: g.cy + g.ry * 0.45 },
    { u: g.cx - g.rx * 0.55, v: g.cy + g.ry * 0.45 },
  ];
  return pts.slice(0, spec.n);
}

/** Engine swap: where the engine sits, where it is hoisted to, and its size. */
export function hoistLayout(r: Rig): { seat: Pt; up: Pt; w: number; h: number } {
  const g = panelGeom(r);
  return {
    seat: { u: g.cx, v: g.cy + g.ry * 0.06 },
    up: { u: g.cx, v: g.cy - g.ry * 1.25 },
    w: g.rx * 1.25,
    h: g.ry * 0.95,
  };
}

type CableShape = Omit<CableDef, 'plug'>;

/** The plugs of each set and where their sockets are (the shape and label are the clue). */
const CABLE_SETS: Record<CableSetId, (P: (fx: number, fy: number) => Pt) => CableShape[]> = {
  pc: (P) => [
    { id: 'atx', label: '24', w: 0.12, h: 0.045, color: 0x2a2a2e, socket: P(0.78, 0.0) },
    { id: 'cpu', label: 'CPU', w: 0.06, h: 0.045, color: 0x2a2a2e, socket: P(-0.2, -0.78) },
    { id: 'gpu', label: 'GPU', w: 0.07, h: 0.04, color: 0x2a2a2e, socket: P(0.42, 0.28) },
    { id: 'sata', label: 'SATA', w: 0.07, h: 0.022, color: 0xf2c12e, socket: P(0.72, 0.62) },
    { id: 'fp', label: 'FP', w: 0.04, h: 0.028, color: 0xe03c31, socket: P(0.2, 0.75) },
  ],
  phone: (P) => [
    { id: 'lcd', label: 'LCD', w: 0.09, h: 0.026, color: 0xd9861a, socket: P(0.0, -0.4) },
    { id: 'bat', label: 'BAT', w: 0.065, h: 0.026, color: 0xd9861a, socket: P(-0.42, 0.05), last: true },
    { id: 'cam', label: 'CAM', w: 0.05, h: 0.022, color: 0xd9861a, socket: P(0.4, 0.12) },
    { id: 'btn', label: 'BTN', w: 0.035, h: 0.02, color: 0xd9861a, socket: P(-0.1, 0.45) },
  ],
  harness: (P) => [
    { id: 'm1', label: 'M1', w: 0.06, h: 0.06, color: 0x2a2a2e, socket: P(-0.78, -0.12) },
    { id: 'm2', label: 'M2', w: 0.06, h: 0.06, color: 0x2a2a2e, socket: P(0.78, -0.12) },
    { id: 'ctrl', label: 'CTRL', w: 0.1, h: 0.04, color: 0x2a2a2e, socket: P(0.0, -0.78) },
    { id: 'pwr', label: 'PWR', w: 0.07, h: 0.05, color: 0xe03c31, socket: P(0.45, 0.4), last: true },
  ],
  hoses: (P) => [
    { id: 'rad', label: 'RAD', w: 0.075, h: 0.075, color: 0x2a2a2e, socket: P(0.8, -0.1) },
    { id: 'heat', label: 'HEAT', w: 0.05, h: 0.05, color: 0x3a3a40, socket: P(-0.8, -0.1) },
    { id: 'fuel', label: 'FUEL', w: 0.04, h: 0.04, color: 0x2f6fd0, socket: P(0.8, 0.32) },
    { id: 'air', label: 'AIR', w: 0.09, h: 0.09, color: 0x55595f, socket: P(-0.8, 0.32) },
  ],
  fuel: (P) => [
    { id: 'fuel', label: 'FUEL', w: 0.075, h: 0.075, color: 0xd9861a, socket: P(-0.8, -0.1) },
    { id: 'lox', label: 'LOX', w: 0.075, h: 0.075, color: 0x4fb6ff, socket: P(0.8, -0.1) },
    { id: 'he', label: 'He', w: 0.045, h: 0.045, color: 0x9a5cf0, socket: P(-0.8, 0.32) },
    { id: 'n2', label: 'N2', w: 0.055, h: 0.055, color: 0x3a3a40, socket: P(0.8, 0.32) },
  ],
};

/** Pin plugs (motherboard, phone, robot) or round hoses (engine, rocket). */
export function cableStyle(set: CableSetId): 'pins' | 'hose' {
  return set === 'hoses' || set === 'fuel' ? 'hose' : 'pins';
}

/** A cable (PC) or hose (engine): its plug's start position, its socket, label and shape. */
export interface CableDef {
  id: string;
  label: string;
  /** Plug size in stage units: the shape is the clue (wide 24-pin, square 8-pin, tiny front panel). */
  w: number;
  h: number;
  color: number;
  plug: Pt;
  socket: Pt;
  /** The power (battery) lead: plugged in last, after everything else. */
  last?: boolean;
}

export function cableSet(r: Rig, set: CableSetId, seed: number): CableDef[] {
  const g = panelGeom(r);
  const P = (fx: number, fy: number): Pt => ({ u: g.cx + g.rx * fx, v: g.cy + g.ry * fy });
  const defs = CABLE_SETS[set](P);
  // Loose plugs lie in a row along the bottom, shuffled so they are not in socket order.
  const rng = new Rng(seed);
  const order = rng.shuffle(defs.map((_, i) => i));
  return defs.map((d, i) => ({
    ...d,
    plug: {
      u: g.cx - g.rx * 0.7 + (g.rx * 1.4 * (order.indexOf(i) + 0.5)) / defs.length,
      v: g.cy + g.ry * 0.86,
    },
  }));
}

/** Dust bunnies to blow away: spread over the board, never on top of each other. */
export function dustLayout(r: Rig, n: number, seed: number): Pt[] {
  const g = panelGeom(r);
  const rng = new Rng(seed);
  const pts: Pt[] = [];
  for (let tries = 0; pts.length < n && tries < 400; tries++) {
    const p = { u: g.cx + g.rx * rng.range(-0.75, 0.75), v: g.cy + g.ry * rng.range(-0.7, 0.6) };
    if (pts.every((q) => Math.hypot(q.u - p.u, q.v - p.v) > 0.13)) pts.push(p);
  }
  return pts;
}

/** Seconds of holding the spanner on an engine bolt (they are tighter than case screws). */
export const BOLT_SECONDS = 0.8;
/** Seconds of the heat gun to soften the glue of a glued phone back. */
export const HEAT_SECONDS = 1.5;
/** Seconds of air to blow one dust bunny away. */
export const DUST_SECONDS = 0.35;

export interface Pt {
  u: number;
  v: number;
}

/** The cover in stage units: round (centre + radius) or rectangle (centre + size). */
export interface PanelGeom {
  cx: number;
  cy: number;
  /** Radius for round panels, half width for rectangles. */
  rx: number;
  /** Radius for round panels, half height for rectangles. */
  ry: number;
}

export function panelGeom(r: Rig): PanelGeom {
  if (r.panel === 'round') return { cx: 0.5, cy: 0.48, rx: 0.4, ry: 0.4 };
  // Big repairs need room for parts and fluids: they use a taller panel.
  const busy = r.tasks.length > 1;
  const hw = busy ? 0.44 : 0.42;
  const hh = Math.min(busy ? 0.42 : 0.4, hw / (busy ? Math.min(r.aspect, 1.1) : r.aspect));
  return { cx: 0.5, cy: 0.48, rx: hw, ry: hh };
}

/** Screw positions on the cover. */
export function screwLayout(r: Rig): Pt[] {
  const g = panelGeom(r);
  if (r.lid === 'twist' || r.screws <= 0) return [];
  if (r.panel === 'round') {
    const out: Pt[] = [];
    for (let i = 0; i < r.screws; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / r.screws;
      out.push({ u: g.cx + Math.cos(a) * g.rx * 0.8, v: g.cy + Math.sin(a) * g.ry * 0.8 });
    }
    return out;
  }
  const ix = g.rx - 0.05;
  const iy = g.ry - 0.05;
  const corners: Pt[] = [
    { u: g.cx - ix, v: g.cy - iy },
    { u: g.cx + ix, v: g.cy - iy },
    { u: g.cx + ix, v: g.cy + iy },
    { u: g.cx - ix, v: g.cy + iy },
  ];
  if (r.screws <= 2) return [corners[0], corners[2]];
  if (r.screws >= 6) return [...corners, { u: g.cx, v: g.cy - iy }, { u: g.cx, v: g.cy + iy }];
  return corners;
}

export interface WireLayout {
  /** Where the cable comes into the compartment. */
  entry: Pt;
  /** Terminal positions (left to right). */
  terminals: Pt[];
  /** Where each loose wire end lies before it is connected. */
  loose: Pt[];
  /** Where the test light shows. */
  glow: Pt;
}

/** Terminals in a row on the component; loose wire ends scattered near the cable entry. */
export function wireLayout(r: Rig, n: number, seed: number): WireLayout {
  const g = panelGeom(r);
  const rng = new Rng(seed);
  const span = Math.min(0.56, g.rx * 1.35);
  const ty = g.cy - g.ry * 0.28;
  const terminals: Pt[] = [];
  for (let i = 0; i < n; i++) terminals.push({ u: g.cx - span / 2 + (span * (i + 0.5)) / n, v: ty });
  const entry = { u: g.cx, v: g.cy + g.ry * 0.92 };
  const loose: Pt[] = [];
  // Big repairs keep the loose ends in the middle so the corners stay free for parts.
  const looseSpan = r.tasks.length > 1 ? span * 0.6 : span;
  for (let i = 0; i < n; i++) {
    const base = g.cx - looseSpan / 2 + (looseSpan * (i + 0.5)) / n;
    loose.push({
      u: base + rng.range(-0.035, 0.035),
      v: g.cy + g.ry * rng.range(0.32, 0.58),
    });
  }
  // Shuffle which wire end lies where, so wires cross a little like in real life.
  const order = rng.shuffle(loose.map((_, i) => i));
  const glow = { u: g.cx, v: g.cy - g.ry * 0.68 };
  return { entry, terminals, loose: order.map((i) => loose[i]), glow };
}

/** Seconds of holding the screwdriver on a screw to take it out. */
export const SCREW_SECONDS = 0.55;

/** Signed smallest angle difference (radians), for twist gestures. */
export function angleDelta(prev: number, next: number): number {
  let d = next - prev;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Total twist (radians, either direction) needed to undo a twist-off case back. */
export const TWIST_NEEDED = Math.PI * 2.5;
