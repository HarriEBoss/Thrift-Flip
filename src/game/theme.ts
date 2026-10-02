/** Warm, bright, kid-friendly flat palette (creams, teals, mustard, terracotta + candy accents). */
export const C = {
  cream: 0xfdf3e1,
  cream2: 0xfbe7c4,
  sand: 0xf3d3a1,
  paper: 0xfffaf0,
  white: 0xffffff,
  ink: 0x3d2c25,
  inkSoft: 0x6b5448,
  teal: 0x2f8f8a,
  tealDark: 0x1d5a57,
  tealLight: 0x8fd3cb,
  mustard: 0xf2b33d,
  mustardDark: 0xb07a14,
  terracotta: 0xe0663f,
  terracottaDark: 0x8a3b22,
  pink: 0xf28fa6,
  sky: 0x7cc6e8,
  leaf: 0x7bbf5a,
  leafDark: 0x3f7a2a,
  purple: 0x9b7ede,
  gold: 0xffd34d,
  shadow: 0x3d2c25,
} as const;

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

export const FONT = "'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif";

/** Font sizes in logical units (frame short side = 720). */
export const FS = {
  tiny: 20,
  small: 24,
  body: 28,
  button: 30,
  h3: 34,
  h2: 44,
  h1: 64,
  hero: 92,
} as const;

export const RARITY_COLORS = [C.inkSoft, C.leaf, C.sky, C.purple] as const;
