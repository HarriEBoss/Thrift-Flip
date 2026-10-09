/**
 * Smooth, lit Canvas 2D art for the wiring repair: covers (base plates, back panels, case backs),
 * the compartment inside (lamp socket block, circuit board, valve chassis, clock movement, battery
 * box), screws, a screwdriver and a soft glow. Everything is drawn in stage units (0..1) scaled to
 * `size` pixels, so it lines up with the positions from core/repair.ts.
 */
import { Rng } from '../../core/prng';
import {
  panelGeom,
  partSize,
  pourLayout,
  swapLayout,
  type PartKind,
  type Rig,
  type WireLayout,
} from '../../core/repair';
import { ctx2d, makeCanvas, shade } from './itemArt';

type X = CanvasRenderingContext2D;

function roundRectPath(x: X, l: number, t: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(l + rr, t);
  x.arcTo(l + w, t, l + w, t + h, rr);
  x.arcTo(l + w, t + h, l, t + h, rr);
  x.arcTo(l, t + h, l, t, rr);
  x.arcTo(l, t, l + w, t, rr);
  x.closePath();
}

/** The cover outline path in pixels. */
function panelPath(x: X, rig: Rig, s: number, inset = 0): void {
  const g = panelGeom(rig);
  if (rig.panel === 'round') {
    x.beginPath();
    x.arc(g.cx * s, g.cy * s, g.rx * s - inset, 0, Math.PI * 2);
  } else {
    roundRectPath(
      x,
      (g.cx - g.rx) * s + inset,
      (g.cy - g.ry) * s + inset,
      g.rx * 2 * s - inset * 2,
      g.ry * 2 * s - inset * 2,
      0.04 * s,
    );
  }
}

function softShadow(x: X, rig: Rig, s: number): void {
  x.save();
  x.shadowColor = 'rgba(20,12,40,0.45)';
  x.shadowBlur = s * 0.04;
  x.shadowOffsetY = s * 0.015;
  panelPath(x, rig, s);
  x.fillStyle = '#000';
  x.fill();
  x.restore();
}

/** The cover as seen from outside, coloured like the item. Screws are drawn separately. */
export function drawCover(
  rig: Rig,
  body: string,
  size: number,
  holes: Array<{ u: number; v: number }>,
): HTMLCanvasElement {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  const s = size;
  const g = panelGeom(rig);
  softShadow(x, rig, s);
  const cx = g.cx * s;
  const cy = g.cy * s;
  if (rig.lid === 'twist') {
    // Brushed metal case back with grooves and an opening notch.
    const m = x.createRadialGradient(cx - g.rx * s * 0.35, cy - g.ry * s * 0.4, 0, cx, cy, g.rx * s);
    m.addColorStop(0, '#f3f5f8');
    m.addColorStop(0.55, '#b9c0cb');
    m.addColorStop(1, '#7d8593');
    panelPath(x, rig, s);
    x.fillStyle = m;
    x.fill();
    x.strokeStyle = 'rgba(40,40,60,0.35)';
    for (let i = 1; i <= 5; i++) {
      x.lineWidth = s * 0.002;
      x.beginPath();
      x.arc(cx, cy, g.rx * s * (0.2 + i * 0.13), 0, Math.PI * 2);
      x.stroke();
    }
    // (Grip ridges and the opening notch are drawn on top so they can turn.)
    return c;
  }
  if (rig.lid === 'hood') {
    // A car hood in the body colour: glossy, with two crease lines and a little badge.
    const hg = x.createLinearGradient(0, (g.cy - g.ry) * s, 0, (g.cy + g.ry) * s);
    hg.addColorStop(0, shade(body, 0.3));
    hg.addColorStop(0.45, body);
    hg.addColorStop(1, shade(body, -0.3));
    panelPath(x, rig, s);
    x.fillStyle = hg;
    x.fill();
    x.save();
    panelPath(x, rig, s);
    x.clip();
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.lineWidth = s * 0.006;
    for (const k of [-1, 1]) {
      x.beginPath();
      x.moveTo(cx + k * g.rx * s * 0.25, (g.cy - g.ry) * s);
      x.lineTo(cx + k * g.rx * s * 0.12, (g.cy + g.ry) * s);
      x.stroke();
    }
    const sp = x.createRadialGradient(
      cx - g.rx * s * 0.4,
      cy - g.ry * s * 0.5,
      0,
      cx - g.rx * s * 0.4,
      cy - g.ry * s * 0.5,
      g.rx * s * 0.6,
    );
    sp.addColorStop(0, 'rgba(255,255,255,0.45)');
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sp;
    x.fillRect((g.cx - g.rx) * s, (g.cy - g.ry) * s, g.rx * 2 * s, g.ry * 2 * s);
    x.restore();
    x.lineWidth = s * 0.004;
    x.strokeStyle = 'rgba(15,10,30,0.6)';
    panelPath(x, rig, s);
    x.stroke();
    const bg = x.createRadialGradient(
      cx - s * 0.008,
      cy + g.ry * s * 0.62,
      0,
      cx,
      cy + g.ry * s * 0.65,
      s * 0.03,
    );
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#8e96a3');
    x.fillStyle = bg;
    x.beginPath();
    x.arc(cx, cy + g.ry * s * 0.65, s * 0.028, 0, Math.PI * 2);
    x.fill();
    return c;
  }
  const base = rig.view === 'base' ? '#3b3742' : shade(body, -0.35);
  const grad = x.createLinearGradient(0, (g.cy - g.ry) * s, 0, (g.cy + g.ry) * s);
  grad.addColorStop(0, shade(base, 0.22));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, shade(base, -0.25));
  panelPath(x, rig, s);
  x.fillStyle = grad;
  x.fill();
  // Bevel.
  x.save();
  panelPath(x, rig, s);
  x.clip();
  x.lineWidth = s * 0.012;
  x.strokeStyle = 'rgba(255,255,255,0.18)';
  panelPath(x, rig, s, s * 0.006);
  x.stroke();
  x.restore();
  x.lineWidth = s * 0.004;
  x.strokeStyle = 'rgba(15,10,30,0.6)';
  panelPath(x, rig, s);
  x.stroke();
  if (rig.view === 'base' && rig.panel === 'round') {
    // Felt ring and rubber feet.
    x.strokeStyle = 'rgba(255,255,255,0.08)';
    x.lineWidth = s * 0.03;
    x.beginPath();
    x.arc(cx, cy, g.rx * s * 0.55, 0, Math.PI * 2);
    x.stroke();
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3; // between the screws
      const fx = cx + Math.cos(a) * g.rx * s * 0.62;
      const fy = cy + Math.sin(a) * g.ry * s * 0.62;
      const f = x.createRadialGradient(fx - s * 0.008, fy - s * 0.008, 0, fx, fy, s * 0.03);
      f.addColorStop(0, '#5a5560');
      f.addColorStop(1, '#1d1a22');
      x.fillStyle = f;
      x.beginPath();
      x.arc(fx, fy, s * 0.03, 0, Math.PI * 2);
      x.fill();
    }
  } else {
    // Vent slots.
    const rows = rig.panel === 'round' ? 3 : 4;
    const vw = g.rx * s * 1.1;
    for (let r = 0; r < rows; r++) {
      const vy = cy - g.ry * s * 0.35 + r * s * 0.035;
      const vx = cx - vw / 2;
      x.fillStyle = 'rgba(10,6,20,0.65)';
      roundRectPath(x, vx, vy, vw, s * 0.014, s * 0.007);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.12)';
      x.fillRect(vx + s * 0.007, vy + s * 0.014, vw - s * 0.014, s * 0.003);
    }
  }
  // Rating label.
  const lw = g.rx * s * 0.7;
  const lh = s * 0.075;
  const lx = cx - lw / 2;
  const ly = cy + g.ry * s * 0.22;
  x.fillStyle = '#efe8d8';
  roundRectPath(x, lx, ly, lw, lh, s * 0.008);
  x.fill();
  x.fillStyle = '#8a8070';
  for (let i = 0; i < 3; i++)
    x.fillRect(lx + lw * 0.08, ly + lh * (0.2 + i * 0.25), lw * (0.84 - i * 0.2), lh * 0.1);
  // Screw holes (a dark ring shows under each screw).
  for (const h of holes) {
    x.fillStyle = 'rgba(10,6,20,0.7)';
    x.beginPath();
    x.arc(h.u * s, h.v * s, s * 0.032, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}

/** What is inside the compartment (static parts; wires and terminal screws are drawn on top). */
export function drawCompartment(
  rig: Rig,
  size: number,
  lay: WireLayout,
  seed: number,
  withWires = true,
): HTMLCanvasElement {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  const s = size;
  const g = panelGeom(rig);
  const rng = new Rng(seed);
  softShadow(x, rig, s);
  // Recess.
  const rec = x.createRadialGradient(g.cx * s, g.cy * s, 0, g.cx * s, g.cy * s, Math.max(g.rx, g.ry) * s);
  rec.addColorStop(0, '#4a4652');
  rec.addColorStop(1, '#1e1b24');
  panelPath(x, rig, s);
  x.fillStyle = rec;
  x.fill();
  x.save();
  panelPath(x, rig, s);
  x.clip();
  // Inner wall shadow.
  x.lineWidth = s * 0.05;
  x.strokeStyle = 'rgba(0,0,0,0.35)';
  panelPath(x, rig, s);
  x.stroke();
  const t0 = lay.terminals[0];
  const t1 = lay.terminals[lay.terminals.length - 1];
  const bx = (t0.u - 0.06) * s;
  const bw = (t1.u - t0.u + 0.12) * s;
  const by = t0.v * s;
  switch (rig.inside) {
    case 'pc': {
      // Computer insides: motherboard, CPU cooler, memory slots and a drive cage.
      const pw = g.rx * s * 1.7;
      const ph = g.ry * s * 1.6;
      const px = g.cx * s - pw / 2;
      const py = g.cy * s - ph / 2;
      const mb = x.createLinearGradient(0, py, 0, py + ph);
      mb.addColorStop(0, '#2a7a52');
      mb.addColorStop(1, '#16492f');
      x.fillStyle = mb;
      roundRectPath(x, px, py, pw, ph, s * 0.012);
      x.fill();
      x.strokeStyle = 'rgba(232,196,90,0.6)';
      x.lineWidth = s * 0.003;
      for (let i = 0; i < 18; i++) {
        const sx = px + rng.next() * pw;
        const sy = py + rng.next() * ph;
        x.beginPath();
        x.moveTo(sx, sy);
        x.lineTo(sx + rng.range(-0.1, 0.1) * s, sy);
        x.stroke();
      }
      // CPU cooler fins.
      const hx = px + pw * 0.08;
      const hy = py + ph * 0.08;
      const fin = x.createLinearGradient(hx, 0, hx + s * 0.16, 0);
      fin.addColorStop(0, '#e7eaf0');
      fin.addColorStop(1, '#8d94a1');
      x.fillStyle = fin;
      for (let i = 0; i < 7; i++) x.fillRect(hx, hy + i * s * 0.018, s * 0.16, s * 0.01);
      // Memory slots.
      x.fillStyle = '#121216';
      for (let i = 0; i < 3; i++)
        x.fillRect(px + pw * 0.36, py + ph * (0.12 + i * 0.08), pw * 0.3, s * 0.014);
      for (let i = 0; i < 3; i++) chip(x, px + pw * (0.2 + i * 0.25), py + ph * 0.86, s * 0.07, s * 0.045);
      break;
    }
    case 'engine': {
      // Engine bay: engine block with valve cover, air filter, hoses.
      const ew = g.rx * s * 1.05;
      const eh = g.ry * s * 0.95;
      const ex = g.cx * s - ew * 0.62;
      const ey = g.cy * s - eh * 0.45;
      const blk = x.createLinearGradient(0, ey, 0, ey + eh);
      blk.addColorStop(0, '#8b919c');
      blk.addColorStop(1, '#3f434b');
      x.fillStyle = blk;
      roundRectPath(x, ex, ey, ew, eh, s * 0.03);
      x.fill();
      const vc = x.createLinearGradient(0, ey, 0, ey + eh * 0.3);
      vc.addColorStop(0, '#e05a4e');
      vc.addColorStop(1, '#8c2a22');
      x.fillStyle = vc;
      roundRectPath(x, ex + ew * 0.06, ey + eh * 0.05, ew * 0.88, eh * 0.28, s * 0.02);
      x.fill();
      for (let i = 0; i < 4; i++) {
        x.fillStyle = '#1b1b20';
        x.beginPath();
        x.arc(ex + ew * (0.18 + i * 0.21), ey + eh * 0.19, s * 0.014, 0, Math.PI * 2);
        x.fill();
      }
      // Air filter.
      const af = x.createRadialGradient(
        ex + ew * 0.3,
        ey + eh * 0.62,
        0,
        ex + ew * 0.3,
        ey + eh * 0.62,
        s * 0.08,
      );
      af.addColorStop(0, '#d9dde4');
      af.addColorStop(1, '#5b616b');
      x.fillStyle = af;
      x.beginPath();
      x.arc(ex + ew * 0.3, ey + eh * 0.62, s * 0.075, 0, Math.PI * 2);
      x.fill();
      // Radiator hose.
      x.strokeStyle = '#141418';
      x.lineWidth = s * 0.025;
      x.beginPath();
      x.moveTo(ex + ew, ey + eh * 0.5);
      x.bezierCurveTo(
        ex + ew + s * 0.08,
        ey + eh * 0.5,
        ex + ew + s * 0.04,
        ey + eh * 1.05,
        ex + ew + s * 0.12,
        ey + eh * 1.05,
      );
      x.stroke();
      break;
    }
    case 'board': {
      // Green circuit board with gold traces and parts.
      const pw = g.rx * s * 1.6;
      const ph = g.ry * s * 1.25;
      const px = g.cx * s - pw / 2;
      const py = g.cy * s - g.ry * s * 0.8;
      const pcb = x.createLinearGradient(0, py, 0, py + ph);
      pcb.addColorStop(0, '#2f8a4c');
      pcb.addColorStop(1, '#1d5e33');
      x.fillStyle = pcb;
      roundRectPath(x, px, py, pw, ph, s * 0.012);
      x.fill();
      x.strokeStyle = 'rgba(232,196,90,0.75)';
      x.lineWidth = s * 0.004;
      for (let i = 0; i < 14; i++) {
        const sx = px + rng.next() * pw;
        const sy = py + rng.next() * ph;
        x.beginPath();
        x.moveTo(sx, sy);
        x.lineTo(sx + rng.range(-0.08, 0.08) * s, sy);
        x.lineTo(sx + rng.range(-0.08, 0.08) * s, sy + rng.range(-0.06, 0.06) * s);
        x.stroke();
      }
      for (let i = 0; i < 3; i++) chip(x, px + pw * (0.15 + i * 0.28), py + ph * 0.55, s * 0.09, s * 0.06);
      for (let i = 0; i < 4; i++)
        capacitor(
          x,
          px + pw * (0.12 + i * 0.25),
          py + ph * 0.82,
          s * 0.024,
          s * 0.05,
          i % 2 ? '#2a5bd7' : '#1b1b1f',
        );
      for (let i = 0; i < 5; i++) resistor(x, px + pw * (0.1 + i * 0.19), py + ph * 0.32, s * 0.05);
      break;
    }
    case 'tubes': {
      // Metal chassis with glass valves.
      const cw = g.rx * s * 1.6;
      const ch = g.ry * s * 1.3;
      const chx = g.cx * s - cw / 2;
      const chy = g.cy * s - g.ry * s * 0.85;
      const m = x.createLinearGradient(0, chy, 0, chy + ch);
      m.addColorStop(0, '#a9adb6');
      m.addColorStop(1, '#6d717b');
      x.fillStyle = m;
      roundRectPath(x, chx, chy, cw, ch, s * 0.01);
      x.fill();
      for (let i = 0; i < 4; i++) tube(x, chx + cw * (0.14 + i * 0.24), chy + ch * 0.62, s * 0.045, s * 0.12);
      capacitor(x, chx + cw * 0.85, chy + ch * 0.85, s * 0.035, s * 0.08, '#c6c9d0');
      break;
    }
    case 'movement': {
      // Clock movement: a grey box with a gear train and a battery.
      const mw = g.rx * s * 1.1;
      const mh = g.ry * s * 0.75;
      const mx = g.cx * s - mw / 2;
      const my = g.cy * s - g.ry * s * 0.8;
      const mg = x.createLinearGradient(0, my, 0, my + mh);
      mg.addColorStop(0, '#8d929c');
      mg.addColorStop(1, '#5b606a');
      x.fillStyle = mg;
      roundRectPath(x, mx, my, mw, mh, s * 0.015);
      x.fill();
      gear(x, mx + mw * 0.3, my + mh * 0.45, s * 0.07, 12);
      gear(x, mx + mw * 0.62, my + mh * 0.55, s * 0.05, 10);
      gear(x, mx + mw * 0.8, my + mh * 0.3, s * 0.035, 8);
      battery(x, g.cx * s - s * 0.12, g.cy * s + g.ry * s * 0.1, s * 0.24, s * 0.07);
      break;
    }
    case 'battery': {
      // Battery box with two cells and a slide switch.
      const hw = g.rx * s * 1.2;
      const hx = g.cx * s - hw / 2;
      const hy = g.cy * s - g.ry * s * 0.78;
      x.fillStyle = '#2a2830';
      roundRectPath(x, hx, hy, hw, s * 0.2, s * 0.02);
      x.fill();
      battery(x, hx + hw * 0.06, hy + s * 0.02, hw * 0.88, s * 0.07);
      battery(x, hx + hw * 0.06, hy + s * 0.11, hw * 0.88, s * 0.07);
      x.fillStyle = '#d8d9de';
      roundRectPath(x, g.cx * s + g.rx * s * 0.3, g.cy * s + g.ry * s * 0.05, s * 0.09, s * 0.04, s * 0.01);
      x.fill();
      break;
    }
    case 'socket': {
      // Lamp switch and the bulb holder's porcelain base.
      const sx = g.cx * s;
      const sy = g.cy * s - g.ry * s * 0.68;
      const p = x.createRadialGradient(sx - s * 0.03, sy - s * 0.03, 0, sx, sy, s * 0.12);
      p.addColorStop(0, '#ffffff');
      p.addColorStop(1, '#c8c3b8');
      x.fillStyle = p;
      x.beginPath();
      x.arc(sx, sy, s * 0.11, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#b98b3a';
      x.beginPath();
      x.arc(sx, sy, s * 0.04, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#25232b';
      roundRectPath(x, g.cx * s + g.rx * s * 0.25, g.cy * s + g.ry * s * 0.0, s * 0.1, s * 0.06, s * 0.012);
      x.fill();
      break;
    }
  }
  if (rig.tasks.includes('swap')) {
    // The tray / socket the part sits in.
    const sl = swapLayout(rig);
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.setLineDash([s * 0.012, s * 0.008]);
    x.lineWidth = s * 0.004;
    roundRectPath(
      x,
      (sl.slot.u - sl.w / 2 - 0.01) * s,
      (sl.slot.v - sl.h / 2 - 0.01) * s,
      (sl.w + 0.02) * s,
      (sl.h + 0.02) * s,
      s * 0.01,
    );
    x.stroke();
    x.setLineDash([]);
  }
  if (rig.tasks.includes('pour')) {
    // Filler neck and cap (yellow for oil, blue for coolant) and the dipstick gauge housing.
    const pl = pourLayout(rig);
    const col = rig.fluid === 'oil' ? ['#ffe27a', '#c79a14'] : ['#9fd8ff', '#2f6fd0'];
    const cg = x.createRadialGradient(
      pl.cap.u * s - s * 0.01,
      pl.cap.v * s - s * 0.01,
      0,
      pl.cap.u * s,
      pl.cap.v * s,
      s * 0.045,
    );
    cg.addColorStop(0, col[0]);
    cg.addColorStop(1, col[1]);
    x.fillStyle = '#1b1b20';
    x.beginPath();
    x.arc(pl.cap.u * s, pl.cap.v * s, s * 0.052, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = cg;
    x.beginPath();
    x.arc(pl.cap.u * s, pl.cap.v * s, s * 0.042, 0, Math.PI * 2);
    x.fill();
  }
  if (!withWires) {
    x.restore();
    x.lineWidth = s * 0.008;
    x.strokeStyle = '#15121b';
    panelPath(x, rig, s);
    x.stroke();
    return c;
  }
  // Terminal block (white plastic) under the terminals.
  const tb = x.createLinearGradient(0, by - s * 0.05, 0, by + s * 0.05);
  tb.addColorStop(0, '#fbfbf7');
  tb.addColorStop(1, '#c9c6bd');
  x.fillStyle = tb;
  roundRectPath(x, bx, by - s * 0.05, bw, s * 0.1, s * 0.012);
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.25)';
  x.lineWidth = s * 0.003;
  x.stroke();
  // Cable grommet where the wires come in.
  const e = lay.entry;
  const gr = x.createRadialGradient(e.u * s, e.v * s, 0, e.u * s, e.v * s, s * 0.05);
  gr.addColorStop(0, '#111');
  gr.addColorStop(0.7, '#2b2b2b');
  gr.addColorStop(1, '#4a4a4a');
  x.fillStyle = gr;
  x.beginPath();
  x.ellipse(e.u * s, e.v * s, s * 0.06, s * 0.035, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();
  // Rim of the opening.
  x.lineWidth = s * 0.008;
  x.strokeStyle = '#15121b';
  panelPath(x, rig, s);
  x.stroke();
  return c;
}

function chip(x: X, cx: number, cy: number, w: number, h: number): void {
  x.fillStyle = '#17171b';
  x.fillRect(cx - w / 2, cy - h / 2, w, h);
  x.fillStyle = '#c9ccd3';
  for (let i = 0; i < 5; i++) {
    x.fillRect(cx - w / 2 + (w * (i + 0.5)) / 5 - 1.5, cy - h / 2 - 4, 3, 4);
    x.fillRect(cx - w / 2 + (w * (i + 0.5)) / 5 - 1.5, cy + h / 2, 3, 4);
  }
  x.fillStyle = 'rgba(255,255,255,0.12)';
  x.fillRect(cx - w / 2, cy - h / 2, w, h * 0.3);
}

function capacitor(x: X, cx: number, cy: number, r: number, h: number, col: string): void {
  const g = x.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, shade(col, 0.35));
  g.addColorStop(0.5, col);
  g.addColorStop(1, shade(col, -0.4));
  x.fillStyle = g;
  roundRectPath(x, cx - r, cy - h, r * 2, h, r * 0.5);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.beginPath();
  x.ellipse(cx, cy - h, r, r * 0.35, 0, 0, Math.PI * 2);
  x.fill();
}

function resistor(x: X, cx: number, cy: number, w: number): void {
  x.strokeStyle = '#c9ccd3';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(cx - w * 0.8, cy);
  x.lineTo(cx + w * 0.8, cy);
  x.stroke();
  x.fillStyle = '#d9b88a';
  roundRectPath(x, cx - w / 2, cy - w * 0.18, w, w * 0.36, w * 0.15);
  x.fill();
  const bands = ['#7a3b1c', '#1b1b1b', '#d23b2b'];
  bands.forEach((b, i) => {
    x.fillStyle = b;
    x.fillRect(cx - w * 0.3 + i * w * 0.2, cy - w * 0.18, w * 0.08, w * 0.36);
  });
}

function tube(x: X, cx: number, cy: number, r: number, h: number): void {
  x.fillStyle = '#2b2b30';
  x.fillRect(cx - r * 1.1, cy - r * 0.2, r * 2.2, r * 0.5);
  const g = x.createLinearGradient(cx - r, 0, cx + r, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.35, 'rgba(210,220,235,0.25)');
  g.addColorStop(1, 'rgba(120,130,150,0.45)');
  x.fillStyle = g;
  roundRectPath(x, cx - r, cy - h, r * 2, h, r);
  x.fill();
  x.fillStyle = '#5b5f68';
  x.fillRect(cx - r * 0.5, cy - h * 0.65, r, h * 0.45);
}

function gear(x: X, cx: number, cy: number, r: number, teeth: number): void {
  x.fillStyle = '#d6b25a';
  x.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.82;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
  x.fillStyle = '#8f7330';
  x.beginPath();
  x.arc(cx, cy, r * 0.25, 0, Math.PI * 2);
  x.fill();
}

function battery(x: X, l: number, t: number, w: number, h: number): void {
  const g = x.createLinearGradient(0, t, 0, t + h);
  g.addColorStop(0, '#5c5f66');
  g.addColorStop(0.5, '#2c2e33');
  g.addColorStop(1, '#17181b');
  x.fillStyle = g;
  roundRectPath(x, l, t, w, h, h * 0.3);
  x.fill();
  x.fillStyle = '#d9a63a';
  x.fillRect(l + w * 0.72, t, w * 0.06, h);
  x.fillStyle = '#c9ccd3';
  x.fillRect(l + w, t + h * 0.3, w * 0.03, h * 0.4);
}

/**
 * A screw head seen from above, without its slot: the slot is drawn as a line on top so it can turn
 * without rotating the image.
 */
export function drawScrew(size: number, brass = false): HTMLCanvasElement {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  const r = size * 0.42;
  const m = size / 2;
  x.shadowColor = 'rgba(0,0,0,0.5)';
  x.shadowBlur = size * 0.08;
  x.shadowOffsetY = size * 0.04;
  const g = x.createRadialGradient(m - r * 0.35, m - r * 0.4, 0, m, m, r);
  g.addColorStop(0, brass ? '#fff1b8' : '#ffffff');
  g.addColorStop(0.5, brass ? '#d9a63a' : '#b8bec8');
  g.addColorStop(1, brass ? '#8a6418' : '#6e7480');
  x.fillStyle = g;
  x.beginPath();
  x.arc(m, m, r, 0, Math.PI * 2);
  x.fill();
  return c;
}

/** A screwdriver pointing down: tip at the bottom centre of the canvas. */
export function drawScrewdriver(w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  const shaftW = w * 0.14;
  const sg = x.createLinearGradient(w / 2 - shaftW / 2, 0, w / 2 + shaftW / 2, 0);
  sg.addColorStop(0, '#f5f7fa');
  sg.addColorStop(0.5, '#a9b0bb');
  sg.addColorStop(1, '#6c7380');
  x.fillStyle = sg;
  x.fillRect(w / 2 - shaftW / 2, h * 0.45, shaftW, h * 0.5);
  x.fillRect(w / 2 - shaftW * 0.8, h * 0.94, shaftW * 1.6, h * 0.06);
  const hg = x.createLinearGradient(w * 0.2, 0, w * 0.8, 0);
  hg.addColorStop(0, '#ff8a5c');
  hg.addColorStop(0.5, '#f2603a');
  hg.addColorStop(1, '#a8322b');
  x.fillStyle = hg;
  roundRectPath(x, w * 0.2, 0, w * 0.6, h * 0.5, w * 0.2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.25)';
  roundRectPath(x, w * 0.28, h * 0.04, w * 0.12, h * 0.4, w * 0.06);
  x.fill();
  x.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 3; i++) x.fillRect(w * 0.47 + (i - 1) * w * 0.12, h * 0.08, w * 0.04, h * 0.36);
  return c;
}

/** A soft round glow (white; tint it). */
export function drawGlow(size: number): HTMLCanvasElement {
  const c = makeCanvas(size);
  const x = ctx2d(c);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

/** A replaceable part (canvas sized to its shape); broken parts are scorched and grimy. */
export function drawPart(kind: PartKind, broken: boolean, px = 400): HTMLCanvasElement {
  const ps = partSize(kind);
  const w = Math.round(px * ps.w);
  const h = Math.round(px * ps.h);
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  const lin = (c0: string, c1: string, vertical = true) => {
    const g = vertical ? x.createLinearGradient(0, 0, 0, h) : x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  };
  switch (kind) {
    case 'battery':
      x.fillStyle = lin('#4a4d55', '#1c1d22');
      roundRectPath(x, 0, h * 0.18, w, h * 0.82, w * 0.06);
      x.fill();
      x.fillStyle = '#d23b2b';
      x.fillRect(w * 0.12, 0, w * 0.16, h * 0.22);
      x.fillStyle = '#2a2a2e';
      x.fillRect(w * 0.72, 0, w * 0.16, h * 0.22);
      x.fillStyle = '#ffd34d';
      x.fillRect(w * 0.08, h * 0.5, w * 0.84, h * 0.16);
      x.fillStyle = '#ffffff';
      x.font = `bold ${Math.round(h * 0.2)}px sans-serif`;
      x.fillText('+', w * 0.15, h * 0.42);
      x.fillText('−', w * 0.75, h * 0.42);
      break;
    case 'fan': {
      x.fillStyle = lin('#3a3d45', '#1d1f24');
      roundRectPath(x, 0, 0, w, h, w * 0.1);
      x.fill();
      x.fillStyle = '#0d0e11';
      x.beginPath();
      x.arc(w / 2, h / 2, w * 0.42, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#7d8592';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        x.beginPath();
        x.ellipse(
          w / 2 + Math.cos(a) * w * 0.22,
          h / 2 + Math.sin(a) * h * 0.22,
          w * 0.18,
          w * 0.07,
          a + 0.6,
          0,
          Math.PI * 2,
        );
        x.fill();
      }
      x.fillStyle = '#c9ccd3';
      x.beginPath();
      x.arc(w / 2, h / 2, w * 0.11, 0, Math.PI * 2);
      x.fill();
      break;
    }
    case 'ram':
      x.fillStyle = lin('#2f8a4c', '#1d5e33');
      x.fillRect(0, 0, w, h * 0.82);
      x.fillStyle = '#d9a63a';
      for (let i = 0; i < 18; i++) x.fillRect(w * (0.04 + i * 0.053), h * 0.82, w * 0.03, h * 0.18);
      x.fillStyle = '#16161b';
      for (let i = 0; i < 4; i++) x.fillRect(w * (0.06 + i * 0.235), h * 0.15, w * 0.18, h * 0.5);
      break;
    case 'drive':
      x.fillStyle = lin('#e9ecf1', '#9097a3');
      roundRectPath(x, 0, 0, w, h, w * 0.04);
      x.fill();
      x.fillStyle = '#f7f2e3';
      x.fillRect(w * 0.12, h * 0.2, w * 0.5, h * 0.45);
      x.fillStyle = '#8a8070';
      for (let i = 0; i < 3; i++) x.fillRect(w * 0.16, h * (0.28 + i * 0.12), w * 0.4, h * 0.05);
      x.fillStyle = '#2a2a2e';
      x.fillRect(w * 0.72, h * 0.75, w * 0.24, h * 0.18);
      break;
    case 'cell':
      x.fillStyle = lin('#5c5f66', '#17181b');
      roundRectPath(x, 0, 0, w * 0.94, h, h * 0.3);
      x.fill();
      x.fillStyle = '#d9a63a';
      x.fillRect(w * 0.7, 0, w * 0.08, h);
      x.fillStyle = '#c9ccd3';
      x.fillRect(w * 0.94, h * 0.3, w * 0.06, h * 0.4);
      break;
    case 'plug':
      x.fillStyle = '#f4f2ec';
      roundRectPath(x, w * 0.22, 0, w * 0.56, h * 0.5, w * 0.2);
      x.fill();
      x.fillStyle = lin('#e7eaf0', '#7b828f', false);
      x.fillRect(w * 0.08, h * 0.5, w * 0.84, h * 0.16);
      x.fillStyle = lin('#c9ccd3', '#7b828f', false);
      x.fillRect(w * 0.3, h * 0.66, w * 0.4, h * 0.26);
      x.fillRect(w * 0.42, h * 0.92, w * 0.16, h * 0.08);
      break;
  }
  if (broken) {
    // Scorch marks, grime and a crack.
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = 'rgba(40,25,10,0.45)';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const g = x.createRadialGradient(
        w * (0.2 + i * 0.15),
        h * (0.3 + (i % 2) * 0.35),
        0,
        w * (0.2 + i * 0.15),
        h * (0.3 + (i % 2) * 0.35),
        Math.max(w, h) * 0.18,
      );
      g.addColorStop(0, 'rgba(0,0,0,0.75)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
    }
    x.globalCompositeOperation = 'source-over';
  }
  return c;
}

/** An oil (or coolant) can, already tipped so the spout points down-left. */
export function drawCan(fluid: 'oil' | 'coolant', w: number, h: number): HTMLCanvasElement {
  const c = makeCanvas(w, h);
  const x = ctx2d(c);
  const body = fluid === 'oil' ? ['#ffd34d', '#c78d14'] : ['#8fd0ff', '#2f6fd0'];
  const g = x.createLinearGradient(w * 0.3, 0, w, 0);
  g.addColorStop(0, body[0]);
  g.addColorStop(1, body[1]);
  // Spout.
  x.fillStyle = '#2a2a2e';
  x.beginPath();
  x.moveTo(w * 0.36, h * 0.55);
  x.lineTo(w * 0.02, h * 0.95);
  x.lineTo(w * 0.1, h * 0.99);
  x.lineTo(w * 0.44, h * 0.66);
  x.closePath();
  x.fill();
  x.fillStyle = g;
  roundRectPath(x, w * 0.32, h * 0.08, w * 0.62, h * 0.66, w * 0.08);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.85)';
  roundRectPath(x, w * 0.42, h * 0.3, w * 0.42, h * 0.2, w * 0.04);
  x.fill();
  x.fillStyle = fluid === 'oil' ? '#c78d14' : '#2f6fd0';
  x.font = `bold ${Math.round(h * 0.13)}px sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(fluid === 'oil' ? 'OIL' : 'COOL', w * 0.63, h * 0.41);
  x.strokeStyle = '#2a2a2e';
  x.lineWidth = w * 0.05;
  x.beginPath();
  x.arc(w * 0.72, h * 0.08, w * 0.14, Math.PI, 0);
  x.stroke();
  return c;
}
