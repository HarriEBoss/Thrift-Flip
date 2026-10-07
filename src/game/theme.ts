/**
 * Bright pixel-art palette: warm creams for backgrounds, saturated candy colours for buttons and
 * accents, and a deep navy-purple "ink" for outlines and text strokes.
 */
export const C = {
  cream: 0xfff3d6,
  cream2: 0xffe3a6,
  sand: 0xf9c86b,
  paper: 0xfffbea,
  white: 0xffffff,
  ink: 0x2a1f3d,
  inkSoft: 0x463e5e,
  teal: 0x1aa89c,
  tealDark: 0x0f6b6f,
  tealLight: 0x8ef0e0,
  mustard: 0xffc23d,
  mustardDark: 0xd9861a,
  terracotta: 0xf2603a,
  terracottaDark: 0xa8322b,
  pink: 0xff7eb6,
  sky: 0x4fb6ff,
  leaf: 0x4cc65a,
  leafDark: 0x228a3c,
  purple: 0x9a5cf0,
  gold: 0xffd93d,
  shadow: 0x2a1f3d,
} as const;

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export const FONT = "'Nunito', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif";

/** One "pixel" of UI chrome (corners, borders, shadows) in logical units. */
export const PX = 4;

/** Font sizes in logical units (frame short side = 720). Sized up for easy reading on phones. */
export const FS = {
  tiny: 23,
  small: 26,
  body: 30,
  button: 32,
  h3: 36,
  h2: 46,
  h1: 64,
  hero: 92,
} as const;

export const RARITY_COLORS = [C.inkSoft, C.leaf, C.sky, C.purple] as const;
