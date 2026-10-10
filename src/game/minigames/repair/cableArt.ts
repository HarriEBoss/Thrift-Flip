import Phaser from 'phaser';

/**
 * How real cables, hoses and their connectors look, drawn with Phaser graphics (they are redrawn
 * while dragged). Each cable of a set has a look by id: a PC's 24-pin is a bundle of coloured wires
 * into a black latch housing, a phone's screen cable is an amber flex ribbon, a car's radiator hose
 * is black rubber with a worm-drive clamp, a rocket's fuel line is braided steel with an AN nut.
 */

type G = Phaser.GameObjects.Graphics;
type V = Phaser.Math.Vector2;

const BLACK = 0x1d1c21;
const YEL = 0xf2c12e;
const RED = 0xd8352a;
const ORA = 0xf08a24;

export type CableLook =
  /** Separate insulated wires side by side, into a pin housing (`rows` × `cols` holes). */
  | { k: 'bundle'; wires: number[]; housing: number; rows: number; cols: number; latch: boolean }
  /** SATA power: a flat black L-shaped plug on a flat run of five wires. */
  | { k: 'sata'; wires: number[] }
  /** Front panel: thin twisted pairs into tiny 2-pin plugs. */
  | { k: 'pairs'; colors: number[] }
  /** Phone: an amber flex ribbon with copper traces and a press-fit board-to-board plug. */
  | { k: 'flex' }
  /** Grey ribbon cable (red stripe = pin 1) into an IDC plug. */
  | { k: 'ribbon' }
  /** Thick red and black silicone power leads into a yellow XT60 plug. */
  | { k: 'xt60' }
  /** Rubber hose with a clamp (worm-drive or spring), optionally ribbed like an air intake. */
  | { k: 'hose'; color: number; clamp: 'worm' | 'spring'; ribbed?: boolean }
  /** Braided steel line with an anodised AN nut; `ice` for an insulated cryogenic line. */
  | { k: 'braid'; nut: number; ice?: boolean };

const LOOKS: Record<string, CableLook> = {
  // PC power: ATX 24-pin (3.3 V orange, 5 V red, 12 V yellow, grounds black, PS_ON green...).
  atx: {
    k: 'bundle',
    wires: [ORA, ORA, BLACK, RED, BLACK, RED, BLACK, 0x8a8a92, 0x7a4fc9, YEL, YEL, ORA],
    housing: BLACK,
    rows: 2,
    cols: 12,
    latch: true,
  },
  cpu: { k: 'bundle', wires: [YEL, BLACK, YEL, BLACK], housing: BLACK, rows: 2, cols: 4, latch: true },
  gpu: { k: 'bundle', wires: [YEL, BLACK, YEL, BLACK], housing: BLACK, rows: 2, cols: 4, latch: true },
  sata: { k: 'sata', wires: [YEL, BLACK, RED, BLACK, ORA] },
  fp: { k: 'pairs', colors: [0x3fae49, RED, 0x2f6fd0] },
  // Phone flex cables.
  lcd: { k: 'flex' },
  bat: { k: 'flex' },
  cam: { k: 'flex' },
  btn: { k: 'flex' },
  // Robot harness: servo leads (brown / red / orange), the controller ribbon, the battery lead.
  m1: { k: 'bundle', wires: [0x6b4226, RED, ORA], housing: 0x1d1c21, rows: 1, cols: 3, latch: false },
  m2: { k: 'bundle', wires: [0x6b4226, RED, ORA], housing: 0x1d1c21, rows: 1, cols: 3, latch: false },
  ctrl: { k: 'ribbon' },
  pwr: { k: 'xt60' },
  // Car hoses.
  rad: { k: 'hose', color: 0x202024, clamp: 'worm' },
  heat: { k: 'hose', color: 0x2a2a2f, clamp: 'spring' },
  fuel: { k: 'hose', color: 0x1f1f24, clamp: 'worm' },
  air: { k: 'hose', color: 0x3a3c42, clamp: 'worm', ribbed: true },
};

/** Rocket plumbing reuses the "fuel" id, so it has its own table. */
const ROCKET: Record<string, CableLook> = {
  fuel: { k: 'braid', nut: 0xd8352a },
  lox: { k: 'braid', nut: 0x2f6fd0, ice: true },
  he: { k: 'braid', nut: 0x8a5cd0 },
  n2: { k: 'braid', nut: 0x3fae49 },
};

export function cableLook(set: string, id: string): CableLook {
  if (set === 'fuel') return ROCKET[id] ?? { k: 'braid', nut: 0x8a8a92 };
  return LOOKS[id] ?? { k: 'hose', color: 0x2a2a2e, clamp: 'worm' };
}

/** How thick the cable body is, from the plug size (px). */
export function cableThickness(look: CableLook, w: number): number {
  switch (look.k) {
    case 'bundle':
      return Math.min(w * 0.9, look.wires.length * 6);
    case 'sata':
      return w * 0.62;
    case 'pairs':
      return 14;
    case 'flex':
      return w * 0.7;
    case 'ribbon':
      return w * 0.8;
    case 'xt60':
      return 22;
    case 'hose':
      return Math.max(16, w * (look.ribbed ? 0.62 : 0.55));
    case 'braid':
      return Math.max(12, w * 0.4);
  }
}

/** A path moved sideways by `off` px (positive = to the right of the direction of travel). */
export function offsetPath(pts: V[], off: number): V[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    return new Phaser.Math.Vector2(p.x - (dy / l) * off, p.y + (dx / l) * off);
  });
}

function shade(c: number, k: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
}

/** One round insulated conductor: dark edge, colour, a soft highlight. */
export function strokeWire(g: G, pts: V[], w: number, color: number, alpha = 1): void {
  g.lineStyle(w + 2, shade(color, 0.45), alpha);
  g.strokePoints(pts, false);
  g.lineStyle(w, color, alpha);
  g.strokePoints(pts, false);
  g.lineStyle(Math.max(1, w * 0.28), shade(color, 1.6) | 0x202020, 0.55 * alpha);
  g.strokePoints(offsetPath(pts, -w * 0.22), false);
}

/** Points along a path every `step` px, with the direction there. */
function along(pts: V[], step: number): Array<{ x: number; y: number; dx: number; dy: number }> {
  const out: Array<{ x: number; y: number; dx: number; dy: number }> = [];
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 0.001) continue;
    const dx = (b.x - a.x) / l;
    const dy = (b.y - a.y) / l;
    let d = step - carry;
    while (d <= l) {
      out.push({ x: a.x + dx * d, y: a.y + dy * d, dx, dy });
      d += step;
    }
    carry = l - (d - step);
  }
  return out;
}

/** The body of a cable or hose from the loose end (start) to the plug (end). */
export function drawCableBody(g: G, look: CableLook, pts: V[], thick: number): void {
  switch (look.k) {
    case 'bundle': {
      const n = look.wires.length;
      const ww = thick / n;
      // A little shadow under the whole bundle, then each wire next to the others.
      g.lineStyle(thick + 4, 0x000000, 0.35);
      g.strokePoints(offsetPath(pts, 3), false);
      look.wires.forEach((c, i) => {
        strokeWire(g, offsetPath(pts, (i - (n - 1) / 2) * ww), Math.max(2, ww - 1.5), c);
      });
      // Black cable ties every so often.
      for (const p of along(pts, 70)) {
        g.lineStyle(4, 0x111114, 1);
        g.lineBetween(
          p.x - p.dy * (thick / 2 + 3),
          p.y + p.dx * (thick / 2 + 3),
          p.x + p.dy * (thick / 2 + 3),
          p.y - p.dx * (thick / 2 + 3),
        );
      }
      break;
    }
    case 'sata': {
      const n = look.wires.length;
      const ww = thick / n;
      g.lineStyle(thick + 3, 0x000000, 0.35);
      g.strokePoints(offsetPath(pts, 3), false);
      // Flat cable: wires joined side by side, a thin seam between each.
      look.wires.forEach((c, i) => {
        const p = offsetPath(pts, (i - (n - 1) / 2) * ww);
        g.lineStyle(ww, c, 1);
        g.strokePoints(p, false);
        g.lineStyle(1, shade(c, 1.7) | 0x303030, 0.45);
        g.strokePoints(offsetPath(p, -ww * 0.25), false);
      });
      break;
    }
    case 'pairs': {
      // Each pair: a coloured wire and a white wire twisted round each other.
      look.colors.forEach((c, i) => {
        const base = offsetPath(pts, (i - (look.colors.length - 1) / 2) * 5);
        for (const [col, ph] of [
          [0xf2f2ee, Math.PI],
          [c, 0],
        ] as const) {
          const tw = base.map((p, k) => {
            const s = Math.sin(k * 1.4 + ph) * 1.6;
            return new Phaser.Math.Vector2(p.x + s, p.y);
          });
          strokeWire(g, tw, 2.6, col);
        }
      });
      break;
    }
    case 'flex': {
      // Amber polyimide film, slightly see-through, with copper traces running along it.
      g.lineStyle(thick + 2, 0x6b3a08, 0.9);
      g.strokePoints(pts, false);
      g.lineStyle(thick, 0xd98a1c, 0.92);
      g.strokePoints(pts, false);
      const tr = Math.max(3, Math.floor(thick / 5));
      for (let i = 0; i < tr; i++) {
        g.lineStyle(1.2, 0xf7c46a, 0.7);
        g.strokePoints(offsetPath(pts, (i - (tr - 1) / 2) * (thick / (tr + 1))), false);
      }
      g.lineStyle(2, 0xffe2a6, 0.35);
      g.strokePoints(offsetPath(pts, -thick * 0.38), false);
      break;
    }
    case 'ribbon': {
      // Grey ribbon: ridges for each wire, red stripe marks pin 1.
      g.lineStyle(thick + 2, 0x55565c, 1);
      g.strokePoints(pts, false);
      g.lineStyle(thick, 0xb7b8be, 1);
      g.strokePoints(pts, false);
      const n = Math.max(4, Math.floor(thick / 3));
      for (let i = 1; i < n; i++) {
        g.lineStyle(0.8, 0x77787e, 0.8);
        g.strokePoints(offsetPath(pts, -thick / 2 + (thick * i) / n), false);
      }
      g.lineStyle(thick / n, 0xc8352a, 1);
      g.strokePoints(offsetPath(pts, -thick / 2 + thick / n / 2), false);
      break;
    }
    case 'xt60': {
      g.lineStyle(thick + 4, 0x000000, 0.35);
      g.strokePoints(offsetPath(pts, 3), false);
      strokeWire(g, offsetPath(pts, -thick / 4), thick / 2 - 1, RED);
      strokeWire(g, offsetPath(pts, thick / 4), thick / 2 - 1, 0x1a1a1e);
      break;
    }
    case 'hose': {
      g.lineStyle(thick + 6, 0x000000, 0.35);
      g.strokePoints(offsetPath(pts, 4), false);
      g.lineStyle(thick + 3, shade(look.color, 0.5), 1);
      g.strokePoints(pts, false);
      g.lineStyle(thick, look.color, 1);
      g.strokePoints(pts, false);
      if (look.ribbed) {
        // Corrugated air duct: ridges across the hose.
        for (const p of along(pts, 9)) {
          g.lineStyle(3, shade(look.color, 0.6), 1);
          g.lineBetween(
            p.x - p.dy * (thick / 2),
            p.y + p.dx * (thick / 2),
            p.x + p.dy * (thick / 2),
            p.y - p.dx * (thick / 2),
          );
          g.lineStyle(1.5, shade(look.color, 1.6), 0.7);
          g.lineBetween(
            p.x - p.dy * (thick / 2) + p.dx * 3,
            p.y + p.dx * (thick / 2) + p.dy * 3,
            p.x + p.dy * (thick / 2) + p.dx * 3,
            p.y - p.dx * (thick / 2) + p.dy * 3,
          );
        }
      }
      // Rubber sheen.
      g.lineStyle(Math.max(2, thick * 0.16), 0xffffff, 0.16);
      g.strokePoints(offsetPath(pts, -thick * 0.24), false);
      break;
    }
    case 'braid': {
      g.lineStyle(thick + 5, 0x000000, 0.35);
      g.strokePoints(offsetPath(pts, 3), false);
      if (look.ice) {
        // Foam-insulated cryogenic line with frost.
        g.lineStyle(thick + 3, 0x9fb6c9, 1);
        g.strokePoints(pts, false);
        g.lineStyle(thick, 0xeef5fb, 1);
        g.strokePoints(pts, false);
        for (const p of along(pts, 13)) {
          g.fillStyle(0xffffff, 0.85);
          g.fillCircle(p.x + p.dy * thick * 0.2, p.y - p.dx * thick * 0.2, 1.6);
        }
        break;
      }
      g.lineStyle(thick + 2, 0x55595f, 1);
      g.strokePoints(pts, false);
      g.lineStyle(thick, 0xb4b9c1, 1);
      g.strokePoints(pts, false);
      // Woven stainless braid: crossing diagonal strands.
      for (const p of along(pts, 5)) {
        const nx = -p.dy;
        const ny = p.dx;
        const h = thick / 2 - 1;
        g.lineStyle(1, 0x6d727c, 0.9);
        g.lineBetween(p.x + nx * h, p.y + ny * h, p.x - nx * h + p.dx * 5, p.y - ny * h + p.dy * 5);
        g.lineStyle(1, 0xe9edf2, 0.7);
        g.lineBetween(p.x - nx * h, p.y - ny * h, p.x + nx * h + p.dx * 5, p.y + ny * h + p.dy * 5);
      }
      break;
    }
  }
}

function pinGrid(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  rows: number,
  cols: number,
  col: number,
): void {
  const cw = w / cols;
  const rh = h / rows;
  const s = Math.max(1.5, Math.min(cw, rh) * 0.56);
  g.fillStyle(col, 1);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) g.fillRect(x + c * cw + (cw - s) / 2, y + r * rh + (rh - s) / 2, s, s);
}

/** The plug on the end of a cable, centred on (x, y), w × h px. */
export function drawPlug(g: G, look: CableLook, x: number, y: number, w: number, h: number): void {
  const l = x - w / 2;
  const t = y - h / 2;
  switch (look.k) {
    case 'bundle': {
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(l + 2, t + 3, w, h, 3);
      g.fillStyle(look.housing, 1);
      g.fillRoundedRect(l, t, w, h, 3);
      g.fillStyle(shade(look.housing, 2.2) | 0x181818, 1);
      g.fillRect(l + 2, t + 2, w - 4, 2);
      pinGrid(g, l + 3, t + 3, w - 6, h - 6, look.rows, look.cols, 0x0b0b0d);
      if (look.latch) {
        // The press-to-release latch clip in the middle of one long side.
        g.fillStyle(look.housing, 1);
        g.fillRect(x - 5, t - 6, 10, 7);
        g.fillStyle(shade(look.housing, 2.5) | 0x202020, 1);
        g.fillRect(x - 4, t - 5, 8, 2);
      }
      break;
    }
    case 'sata': {
      g.fillStyle(0x000000, 0.35);
      g.fillRect(l + 2, t + 3, w, h);
      g.fillStyle(0x17171b, 1);
      g.fillRect(l, t, w, h);
      // The L key at one end.
      g.fillRect(l - 3, t, 4, h * 1.4);
      g.fillStyle(0x3a3a42, 1);
      g.fillRect(l + 2, t + 2, w - 4, 2);
      break;
    }
    case 'pairs': {
      // Three tiny black 2-pin plugs side by side.
      const pw = w / 3 - 2;
      for (let i = 0; i < 3; i++) {
        const px = l + i * (pw + 3);
        g.fillStyle(0x121215, 1);
        g.fillRect(px, t, pw, h);
        pinGrid(g, px + 1, t + 1, pw - 2, h - 2, 1, 2, 0x3a3a40);
      }
      break;
    }
    case 'flex': {
      // Black stiffener with the connector's row of gold contacts.
      g.fillStyle(0x000000, 0.3);
      g.fillRect(l + 2, t + 2, w, h);
      g.fillStyle(0x16161a, 1);
      g.fillRect(l, t, w, h);
      g.fillStyle(0xd9b04a, 1);
      const n = Math.max(6, Math.floor(w / 3.5));
      for (let i = 0; i < n; i++)
        g.fillRect(l + 3 + i * ((w - 6) / n), t + h * 0.3, (w - 6) / n - 1.2, h * 0.4);
      break;
    }
    case 'ribbon': {
      g.fillStyle(0x000000, 0.35);
      g.fillRect(l + 2, t + 3, w, h);
      g.fillStyle(0x222226, 1);
      g.fillRect(l, t, w, h);
      g.fillStyle(0x3b3b42, 1);
      g.fillRect(l, t + h * 0.62, w, h * 0.14);
      pinGrid(g, l + 3, t + 3, w - 6, h * 0.5, 2, 5, 0x0b0b0d);
      // Pin-1 triangle.
      g.fillStyle(0xe8e8e8, 1);
      g.fillTriangle(l + 2, t + h - 2, l + 8, t + h - 2, l + 2, t + h - 8);
      break;
    }
    case 'xt60': {
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(l + 2, t + 3, w, h, 4);
      g.fillStyle(0xf2c12e, 1);
      // XT60 shape: one corner chamfered so it only fits one way.
      g.fillPoints(
        [
          new Phaser.Math.Vector2(l, t),
          new Phaser.Math.Vector2(l + w, t),
          new Phaser.Math.Vector2(l + w, t + h - h * 0.3),
          new Phaser.Math.Vector2(l + w - h * 0.3, t + h),
          new Phaser.Math.Vector2(l, t + h),
        ],
        true,
      );
      g.fillStyle(0xc9961a, 1);
      g.fillCircle(x - w * 0.22, y, Math.min(w, h) * 0.22);
      g.fillCircle(x + w * 0.22, y, Math.min(w, h) * 0.22);
      g.fillStyle(0x3a2a08, 1);
      g.fillCircle(x - w * 0.22, y, Math.min(w, h) * 0.12);
      g.fillCircle(x + w * 0.22, y, Math.min(w, h) * 0.12);
      break;
    }
    case 'hose': {
      // The hose end with its clamp.
      const hw = Math.max(16, w * (look.ribbed ? 0.62 : 0.55));
      g.fillStyle(look.color, 1);
      g.fillRoundedRect(x - hw / 2, t, hw, h, 4);
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(x, t + 2, hw * 0.75, Math.min(10, h * 0.35));
      if (look.clamp === 'worm') {
        // Steel band round the hose and the screw housing on the side.
        g.fillStyle(0xc9ced6, 1);
        g.fillRect(x - hw / 2 - 2, y - 4, hw + 4, 8);
        g.lineStyle(1, 0x7d838d, 1);
        for (let i = 0; i < hw; i += 4) g.lineBetween(x - hw / 2 + i, y - 3, x - hw / 2 + i + 2, y + 3);
        g.fillStyle(0xaab0ba, 1);
        g.fillRect(x + hw / 2 - 2, y - 6, 9, 12);
        g.lineStyle(2, 0x5b616b, 1);
        g.lineBetween(x + hw / 2 + 2.5, y - 4, x + hw / 2 + 2.5, y + 4);
      } else {
        // Spring clamp: a wire ring with two tabs.
        g.lineStyle(3, 0xb3b8c0, 1);
        g.lineBetween(x - hw / 2 - 1, y, x + hw / 2 + 1, y);
        g.fillStyle(0xb3b8c0, 1);
        g.fillRect(x + hw / 2, y - 8, 4, 8);
        g.fillRect(x + hw / 2 + 5, y - 8, 4, 8);
      }
      break;
    }
    case 'braid': {
      // AN fitting: a hex nut (anodised) and a collar.
      const r = Math.min(w, h) * 0.5;
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(x + 2, y + 3, r);
      g.fillStyle(look.nut, 1);
      const hex: V[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        hex.push(new Phaser.Math.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r));
      }
      g.fillPoints(hex, true);
      g.lineStyle(1.5, shade(look.nut, 1.6) | 0x202020, 0.8);
      g.strokePoints(hex, true);
      g.fillStyle(shade(look.nut, 0.6), 1);
      g.fillCircle(x, y, r * 0.55);
      g.fillStyle(0xd7dbe1, 1);
      g.fillCircle(x, y, r * 0.38);
      g.fillStyle(0x2a2a30, 1);
      g.fillCircle(x, y, r * 0.2);
      break;
    }
  }
}

/** The matching socket on the board or engine, centred on (x, y), w × h px. */
export function drawSocket(g: G, look: CableLook, x: number, y: number, w: number, h: number): void {
  const l = x - w / 2;
  const t = y - h / 2;
  switch (look.k) {
    case 'bundle': {
      // Shrouded header on the board: plastic walls round a grid of square pins.
      const body = look.rows === 1 ? 0xf2efe6 : 0xece8dc;
      g.fillStyle(0x000000, 0.35);
      g.fillRect(l - 3, t - 1, w + 8, h + 7);
      g.fillStyle(body, 1);
      g.fillRect(l - 4, t - 4, w + 8, h + 8);
      g.fillStyle(0x2a2a30, 1);
      g.fillRect(l - 1, t - 1, w + 2, h + 2);
      pinGrid(g, l, t, w, h, look.rows, look.cols, 0xe2c25a);
      if (look.latch) {
        g.fillStyle(body, 1);
        g.fillRect(x - 5, t - 9, 10, 5);
      }
      break;
    }
    case 'sata': {
      // SATA power port: black L-shaped shroud with gold contacts.
      g.fillStyle(0x0e0e10, 1);
      g.fillRect(l - 4, t - 4, w + 8, h + 8);
      g.fillRect(l - 7, t - 4, 5, h * 1.5 + 4);
      g.fillStyle(0xd9b04a, 1);
      const n = 10;
      for (let i = 0; i < n; i++)
        g.fillRect(l + 1 + i * ((w - 2) / n), t + h * 0.35, (w - 2) / n - 1.5, h * 0.3);
      break;
    }
    case 'pairs': {
      // Front-panel header: 2 × 5 bare pins with a silk-screen box.
      g.lineStyle(1.5, 0xf2f2ee, 0.85);
      g.strokeRect(l - 3, t - 3, w + 6, h + 6);
      pinGrid(g, l, t, w, h, 2, 5, 0xe2c25a);
      break;
    }
    case 'flex': {
      // Board-to-board connector: metal frame round two rows of tiny pins.
      g.fillStyle(0xaab0ba, 1);
      g.fillRect(l - 3, t - 3, w + 6, h + 6);
      g.fillStyle(0x1b1b20, 1);
      g.fillRect(l, t, w, h);
      const n = Math.max(6, Math.floor(w / 3.5));
      g.fillStyle(0xd9b04a, 1);
      for (let i = 0; i < n; i++) {
        g.fillRect(l + 2 + i * ((w - 4) / n), t + 1.5, (w - 4) / n - 1.2, h * 0.25);
        g.fillRect(l + 2 + i * ((w - 4) / n), t + h - 1.5 - h * 0.25, (w - 4) / n - 1.2, h * 0.25);
      }
      break;
    }
    case 'ribbon': {
      // Boxed IDC header with its key notch.
      g.fillStyle(0x16161a, 1);
      g.fillRect(l - 4, t - 4, w + 8, h + 8);
      g.fillStyle(0x2c2c32, 1);
      g.fillRect(l, t, w, h);
      g.fillStyle(0x16161a, 1);
      g.fillRect(x - 6, t + h, 12, 4);
      pinGrid(g, l + 2, t + 2, w - 4, h - 4, 2, 5, 0xe2c25a);
      break;
    }
    case 'xt60': {
      g.fillStyle(0xd9a81c, 1);
      g.fillRect(l - 3, t - 3, w + 6, h + 6);
      g.fillStyle(0x2a2008, 1);
      g.fillCircle(x - w * 0.22, y, Math.min(w, h) * 0.24);
      g.fillCircle(x + w * 0.22, y, Math.min(w, h) * 0.24);
      g.fillStyle(0xe8c25a, 1);
      g.fillCircle(x - w * 0.22, y, Math.min(w, h) * 0.12);
      g.fillCircle(x + w * 0.22, y, Math.min(w, h) * 0.12);
      break;
    }
    case 'hose': {
      // Metal pipe outlet (barb) the hose pushes over.
      const r = Math.min(w, h) * 0.5;
      g.fillStyle(0x000000, 0.4);
      g.fillCircle(x + 2, y + 3, r + 3);
      g.fillStyle(0x8d939d, 1);
      g.fillCircle(x, y, r + 2);
      g.fillStyle(0xd0d4db, 1);
      g.fillCircle(x, y, r);
      g.lineStyle(2, 0x7a808a, 1);
      g.strokeCircle(x, y, r * 0.78);
      g.fillStyle(0x17161b, 1);
      g.fillCircle(x, y, r * 0.55);
      break;
    }
    case 'braid': {
      // Bulkhead fitting: a steel hex with the flare in the middle.
      const r = Math.min(w, h) * 0.5;
      const hex: V[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        hex.push(new Phaser.Math.Vector2(x + Math.cos(a) * (r + 3), y + Math.sin(a) * (r + 3)));
      }
      g.fillStyle(0x000000, 0.4);
      g.fillCircle(x + 2, y + 3, r + 3);
      g.fillStyle(0xb9bfc9, 1);
      g.fillPoints(hex, true);
      g.lineStyle(1.5, 0x6d727c, 1);
      g.strokePoints(hex, true);
      g.fillStyle(look.nut, 0.9);
      g.fillCircle(x, y, r * 0.62);
      g.fillStyle(0x1d1c21, 1);
      g.fillCircle(x, y, r * 0.35);
      break;
    }
  }
}
