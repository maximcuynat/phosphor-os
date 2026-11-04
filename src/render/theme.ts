// Phosphor palettes. Each theme defines the same six roles as the
// reference board [25]; amber and white derive from their base colour.

export type PhosphorName = 'green' | 'amber' | 'white';

export interface Palette {
  /** Screen background. */
  bg: string;
  /** Centre of the radial background (brighter). */
  bgCenter: string;
  /** Outer edge of the radial background. */
  bgEdge: string;
  /** Text and selection fill. */
  fg: string;
  /** Bright text: titles, folders, warnings. */
  bright: string;
  /** Dim text: labels, inactive panel. */
  dim: string;
  /** Key bar fill and rules. */
  bar: string;
  /** Text on the key bar. */
  barText: string;
  /** fg as "r,g,b" for glows. */
  rgb: string;
}

export const PALETTES: Record<PhosphorName, Palette> = {
  green: {
    bg: '#031407',
    bgCenter: '#062a10',
    bgEdge: '#010801',
    fg: '#33ff66',
    bright: '#7dff9a',
    dim: '#23a84a',
    bar: '#1a7a36',
    barText: '#c8ffd6',
    rgb: '51,255,102',
  },
  amber: {
    bg: '#140b00',
    bgCenter: '#2a1803',
    bgEdge: '#080400',
    fg: '#ffb000',
    bright: '#ffd27a',
    dim: '#b07a00',
    bar: '#7a5200',
    barText: '#ffeccc',
    rgb: '255,176,0',
  },
  white: {
    bg: '#0a0c0a',
    bgCenter: '#1a1e1a',
    bgEdge: '#040504',
    fg: '#e8f0e8',
    bright: '#ffffff',
    dim: '#9aa59a',
    bar: '#4d564d',
    barText: '#f6fff6',
    rgb: '232,240,232',
  },
};

/** Text glow for a level 0..12 (6 = reference value 3px + 12px). */
export function glowShadow(level: number, rgb: string): string {
  if (level <= 0) return 'none';
  return `0 0 ${level / 2}px rgba(${rgb},.85), 0 0 ${level * 2}px rgba(${rgb},.35)`;
}

export interface ThemeSettings {
  phosphor: PhosphorName;
  glow: number;
  scanlines: boolean;
  cursorBlinkMs: number;
}

/** Applies a theme to the document root as CSS variables. */
export function applyTheme(root: HTMLElement, s: ThemeSettings): void {
  const p = PALETTES[s.phosphor] ?? PALETTES.green;
  const st = root.style;
  st.setProperty('--bg', p.bg);
  st.setProperty('--bg-center', p.bgCenter);
  st.setProperty('--bg-edge', p.bgEdge);
  st.setProperty('--fg', p.fg);
  st.setProperty('--bright', p.bright);
  st.setProperty('--dim', p.dim);
  st.setProperty('--bar', p.bar);
  st.setProperty('--bar-text', p.barText);
  st.setProperty('--rgb', p.rgb);
  st.setProperty('--glow', glowShadow(s.glow, p.rgb));
  st.setProperty('--blink', `${s.cursorBlinkMs}ms`);
  root.classList.toggle('no-scanlines', !s.scanlines);
}
