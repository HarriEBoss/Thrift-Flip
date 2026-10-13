/**
 * Layouts and rules of the realistic phone and computer repair jobs (pure, unit-tested): cleaning a
 * charge port, pulling battery adhesive strips, ZIF ribbon connectors, a new water seal; powering a
 * PC down safely (and the wrist strap), POST beep codes, the CMOS coin cell, discharging an arcade
 * CRT and cleaning leaked battery contacts. Positions are stage units (0..1), like ./repair. These
 * jobs happen in a magnified panel in the middle of the stage.
 */
import { Rng, hashSeed } from './prng';
import type { Pt, TaskSpec } from './repair';

export interface Panel {
  c: Pt;
  w: number;
  h: number;
}

const C0 = { u: 0.5, v: 0.47 };
const PANEL: Panel = { c: C0, w: 0.38, h: 0.28 };

// ---------------------------------------------------------------- charge port

export interface LintLayout {
  panel: Panel;
  /** The port (magnified) and the lint packed inside it. */
  port: Pt;
  lint: Pt[];
  /** A wooden toothpick (safe) and a metal SIM pin (can short the pins). */
  pick: Pt;
  metal: Pt;
  /** The USB meter's plug and its screen. */
  plug: Pt;
  meter: Pt;
}

export function lintLayout(seed: number): LintLayout {
  const port = { u: C0.u - 0.08, v: C0.v - 0.05 };
  const swap = hashSeed(seed, 'lint') % 2 === 0;
  return {
    panel: PANEL,
    port,
    lint: [-0.09, 0, 0.09].map((d) => ({ u: port.u + d, v: port.v })),
    pick: { u: C0.u + (swap ? 0.2 : 0.29), v: C0.v + 0.15 },
    metal: { u: C0.u + (swap ? 0.29 : 0.2), v: C0.v + 0.15 },
    plug: { u: C0.u - 0.24, v: C0.v + 0.16 },
    meter: { u: C0.u + 0.25, v: C0.v - 0.08 },
  };
}

/** Seconds of scraping to free one clump of pocket lint. */
export const LINT_SECONDS = 0.45;

// ---------------------------------------------------------------- battery adhesive strips

export interface StripLayout {
  panel: Panel;
  /** The battery, and the pull tabs of its stretch-release adhesive strips. */
  battery: { c: Pt; w: number; h: number };
  tabs: Pt[];
  /** Where to drip isopropyl alcohol if a strip snaps. */
  drip: Pt;
}

export function stripLayout(): StripLayout {
  const c = { u: C0.u, v: C0.v - 0.06 };
  return {
    panel: PANEL,
    battery: { c, w: 0.2, h: 0.13 },
    tabs: [-0.08, 0.08].map((d) => ({ u: c.u + d, v: c.v + 0.145 })),
    drip: { u: c.u + 0.25, v: c.v },
  };
}

/** How far a strip stretches before it lets go, and the fastest safe pull (units per second). */
export const STRIP_LEN = 0.24;
export const STRIP_MAX_SPEED = 0.42;
/** Alcohol to soften the adhesive under a snapped strip (hold until the level is reached). */
export const IPA_NEEDED = 1;
export const IPA_RATE = 0.9;

/** Smoothed pull speed: the speed eases towards the newest sample (a quick flick still shows). */
export function pullSpeed(prev: number, dist: number, dt: number): number {
  const sample = dist / Math.max(0.016, dt);
  return prev + (sample - prev) * 0.5;
}

// ---------------------------------------------------------------- ZIF ribbon connectors

export interface ZifLayout {
  panel: Panel;
  /** Each connector's latch and slot, and where its ribbon starts (it slides straight up). */
  slots: Pt[];
  ribbons: Pt[];
  /** Contacts facing up at the start? (they must face the connector's contacts: up). */
  up: boolean[];
}

export function zifLayout(seed: number, n: 1 | 2): ZifLayout {
  const rng = new Rng(hashSeed(seed, 'zif'));
  const us = n === 1 ? [C0.u] : [C0.u - 0.13, C0.u + 0.13];
  // At least one ribbon arrives upside down (it has to be turned over first).
  const up = us.map(() => rng.chance(0.5));
  if (up.every(Boolean)) up[rng.int(0, up.length - 1)] = false;
  return {
    panel: PANEL,
    slots: us.map((u) => ({ u, v: C0.v - 0.1 })),
    ribbons: us.map((u) => ({ u, v: C0.v + 0.14 })),
    up,
  };
}

/** How far the ribbon must go in (from its start to the slot), and how deep counts as "fully in". */
export const ZIF_DEPTH = 0.95;

// ---------------------------------------------------------------- water seal

export interface SealLayout {
  panel: Panel;
  /** The frame the seal sits on, its shape, and blobs of old adhesive to scrape off first. */
  frame: { c: Pt; w: number; h: number };
  round: boolean;
  residue: Pt[];
  /** The new seal on its backing (and the liner's pull tab). */
  seal: Pt;
  tab: Pt;
}

export function sealLayout(round: boolean): SealLayout {
  const frame = { c: { u: C0.u - 0.1, v: C0.v - 0.02 }, w: round ? 0.12 : 0.1, h: 0.13 };
  return {
    panel: PANEL,
    frame,
    round,
    residue: [
      { u: frame.c.u - frame.w, v: frame.c.v - 0.04 },
      { u: frame.c.u + frame.w, v: frame.c.v + 0.05 },
      { u: frame.c.u + 0.02, v: frame.c.v + frame.h },
    ],
    seal: { u: C0.u + 0.24, v: C0.v + 0.02 },
    tab: { u: C0.u + 0.24, v: C0.v + 0.19 },
  };
}

/** A seal has to sit right on the frame: within SEAL_TOL it is good; a little off is crooked. */
export const SEAL_TOL = 0.03;
export const SEAL_NEAR = 0.09;
export const RESIDUE_SECONDS = 0.4;
export const CLAMP_SECONDS = 0.8;

// ---------------------------------------------------------------- safe power-down and ESD

export type EsdStep = 'psu' | 'unplug' | 'drain' | 'strap';

/** Switch the PSU off, pull the mains plug, hold the power button to drain, then clip your strap on. */
export function esdSteps(strapOnly: boolean): EsdStep[] {
  return strapOnly ? ['strap'] : ['psu', 'unplug', 'drain', 'strap'];
}

export interface EsdLayout {
  panel: Panel;
  /** PSU rocker switch, the mains plug in its socket, the case's power button and standby LED. */
  rocker: Pt;
  socket: Pt;
  power: Pt;
  led: Pt;
  /** The wrist strap's crocodile clip, bare metal on the frame (good) and a painted panel (no good). */
  clip: Pt;
  metal: Pt;
  paint: Pt;
}

export function esdLayout(): EsdLayout {
  return {
    panel: PANEL,
    rocker: { u: C0.u - 0.25, v: C0.v - 0.12 },
    socket: { u: C0.u - 0.25, v: C0.v + 0.02 },
    power: { u: C0.u + 0.04, v: C0.v - 0.12 },
    led: { u: C0.u + 0.04, v: C0.v - 0.03 },
    clip: { u: C0.u + 0.04, v: C0.v + 0.17 },
    metal: { u: C0.u + 0.24, v: C0.v - 0.1 },
    paint: { u: C0.u + 0.24, v: C0.v + 0.08 },
  };
}

/** Seconds of holding the power button with the plug out (the capacitors drain). */
export const DRAIN_SECONDS = 1.2;

// ---------------------------------------------------------------- POST beep codes

/** A beep pattern: 'S' short, 'L' long. */
export interface BeepCode {
  id: 'ok' | 'ram' | 'gpu' | 'cpu' | 'boot' | 'cmos';
  beeps: string;
}

/** This board's manual (codes differ between makers; this is the one in the box). */
export const BEEP_CODES: BeepCode[] = [
  { id: 'ok', beeps: 'S' },
  { id: 'cmos', beeps: 'SS' },
  { id: 'ram', beeps: 'SSS' },
  { id: 'cpu', beeps: 'LS' },
  { id: 'gpu', beeps: 'LSS' },
  { id: 'boot', beeps: 'LSSS' },
];

/** What the board beeps, from the first fault the job is about. */
export function postCode(tasks: TaskSpec[]): BeepCode {
  const by = (id: BeepCode['id']) => BEEP_CODES.find((b) => b.id === id)!;
  for (const t of tasks) {
    if (t.k === 'ram' || (t.k === 'swap' && t.part === 'ram')) return by('ram');
    if (t.k === 'swap' && t.part === 'gpu') return by('gpu');
    if ((t.k === 'swap' && (t.part === 'fan' || t.part === 'cooler')) || t.k === 'paste') return by('cpu');
    if (t.k === 'swap' && t.part === 'drive') return by('boot');
    if (t.k === 'cmos') return by('cmos');
  }
  return by('ok');
}

export interface PostLayout {
  panel: Panel;
  power: Pt;
  speaker: Pt;
  /** Rows of the manual's beep table (in the order printed; the answer is always there). */
  rows: BeepCode[];
  rowAt: Pt[];
}

export function postLayout(seed: number, code: BeepCode): PostLayout {
  const rng = new Rng(hashSeed(seed, 'post'));
  const others = rng.shuffle(BEEP_CODES.filter((b) => b.id !== code.id)).slice(0, 4);
  const rows = [...others, code].sort((a, b) => BEEP_CODES.indexOf(a) - BEEP_CODES.indexOf(b));
  return {
    panel: PANEL,
    power: { u: C0.u - 0.25, v: C0.v - 0.1 },
    speaker: { u: C0.u - 0.25, v: C0.v + 0.1 },
    rows,
    rowAt: rows.map((_, i) => ({ u: C0.u + 0.1, v: C0.v - 0.17 + i * 0.085 })),
  };
}

/** Seconds of a short and a long beep, and the gap between beeps. */
export const BEEP_SHORT = 0.18;
export const BEEP_LONG = 0.6;
export const BEEP_GAP = 0.22;

// ---------------------------------------------------------------- CMOS coin cell

export interface CmosLayout {
  panel: Panel;
  holder: Pt;
  /** The holder's spring clip (press to pop the old cell), the bin and the new cell. */
  clip: Pt;
  bin: Pt;
  fresh: Pt;
  /** Does the new cell start with its + side (the printed side) up? */
  freshUp: boolean;
}

export function cmosLayout(seed: number): CmosLayout {
  const holder = { u: C0.u - 0.08, v: C0.v - 0.02 };
  return {
    panel: PANEL,
    holder,
    clip: { u: holder.u + 0.085, v: holder.v - 0.06 },
    bin: { u: C0.u - 0.27, v: C0.v + 0.14 },
    fresh: { u: C0.u + 0.24, v: C0.v + 0.08 },
    freshUp: hashSeed(seed, 'cmos') % 2 === 0,
  };
}

// ---------------------------------------------------------------- CRT discharge

export type CrtStep = 'ground' | 'probe' | 'drain' | 'cap';

export interface CrtLayout {
  panel: Panel;
  /** The tube's anode cap, the chassis ground lug, and where the discharge tool and its clip wait. */
  anode: Pt;
  ground: Pt;
  tool: Pt;
  clip: Pt;
  meter: Pt;
}

export function crtLayout(): CrtLayout {
  return {
    panel: PANEL,
    anode: { u: C0.u - 0.04, v: C0.v - 0.08 },
    ground: { u: C0.u - 0.26, v: C0.v + 0.14 },
    tool: { u: C0.u + 0.22, v: C0.v + 0.15 },
    clip: { u: C0.u + 0.04, v: C0.v + 0.19 },
    meter: { u: C0.u + 0.28, v: C0.v - 0.1 },
  };
}

/** The anode's charge (kV, 0..1 of 25 kV) and how fast it bleeds through the tool. */
export const CRT_CHARGE = 1;
export const CRT_DRAIN_RATE = 0.8;
export const CRT_SAFE = 0.03;

// ---------------------------------------------------------------- battery contacts

export interface ContactLayout {
  panel: Panel;
  /** The crusty battery terminals, the two bottles (white vinegar and water) and the cotton swab. */
  terminals: Pt[];
  vinegar: Pt;
  water: Pt;
}

export function contactLayout(seed: number): ContactLayout {
  const swap = hashSeed(seed, 'contacts') % 2 === 0;
  return {
    panel: PANEL,
    terminals: [
      { u: C0.u - 0.2, v: C0.v - 0.03 },
      { u: C0.u + 0.02, v: C0.v - 0.03 },
    ],
    vinegar: { u: C0.u + (swap ? 0.2 : 0.29), v: C0.v + 0.1 },
    water: { u: C0.u + (swap ? 0.29 : 0.2), v: C0.v + 0.1 },
  };
}

/** Seconds of scrubbing one terminal with the vinegar swab. */
export const SCRUB_SECONDS = 0.8;
