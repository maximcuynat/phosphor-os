// 80x25 text grid with style per cell, plus overlays (frames, bars, rects)
// drawn in cell coordinates under the text layer.

export const COLS = 80;
export const ROWS = 25;

/**
 * Cell styles.
 * n normal, b bright, d dim, i inverse (selection / error), k key bar,
 * ib inverse bright, f faint (hidden files), u underline (links), x black (invisible)
 */
export type Style = 'n' | 'b' | 'd' | 'i' | 'k' | 'ib' | 'f' | 'u' | 'x';

/** Role colours an overlay can use. */
export type Tone = 'n' | 'b' | 'd' | 'k' | 'bg';

export type Overlay =
  /** Double (default) or single border around the cell rect x,y,w,h, drawn through the border cells' centres. */
  | { t: 'box'; x: number; y: number; w: number; h: number; tone?: Tone; single?: boolean; glow?: boolean }
  /** Filled rectangle, fractional cells allowed. */
  | { t: 'rect'; x: number; y: number; w: number; h: number; tone?: Tone; pattern?: 'solid' | 'blocks' | 'hatch'; glow?: boolean; color?: string }
  /** Horizontal rule through the middle of row y. */
  | { t: 'hline'; x: number; y: number; w: number; tone?: Tone }
  /** Progress bar in a single-line frame occupying cells x..x+w-1 on row y. */
  | { t: 'bar'; x: number; y: number; w: number; pct: number; tone?: Tone; double?: boolean };

export interface Cursor {
  x: number;
  y: number;
  visible: boolean;
  /** 'block' = full cell, 'under' = underscore. */
  shape?: 'block' | 'under';
}

export class Screen {
  chars: string[] = new Array(COLS * ROWS).fill(' ');
  styles: Style[] = new Array(COLS * ROWS).fill('n');
  overlays: Overlay[] = [];
  cursor: Cursor = { x: 0, y: 0, visible: false, shape: 'block' };
  /** Optional whole-screen class (e.g. 'saver' for the darker screensaver ground). */
  mode = '';

  clear(): void {
    this.chars.fill(' ');
    this.styles.fill('n');
    this.overlays = [];
    this.cursor = { x: 0, y: 0, visible: false, shape: 'block' };
    this.mode = '';
  }

  /** Writes text at x,y. Clips at the right edge. Returns the x after the text. */
  put(x: number, y: number, text: string, style: Style = 'n'): number {
    if (y < 0 || y >= ROWS) return x + text.length;
    for (let i = 0; i < text.length; i++) {
      const cx = x + i;
      if (cx < 0) continue;
      if (cx >= COLS) break;
      const idx = y * COLS + cx;
      this.chars[idx] = text[i];
      this.styles[idx] = style;
    }
    return x + text.length;
  }

  /** Writes a sequence of styled segments. */
  putSegs(x: number, y: number, segs: Seg[]): number {
    let cx = x;
    for (const s of segs) cx = this.put(cx, y, s.text, s.style ?? 'n');
    return cx;
  }

  /** Writes text right-aligned so that it ends at column xEnd (exclusive). */
  putRight(xEnd: number, y: number, text: string, style: Style = 'n'): void {
    this.put(xEnd - text.length, y, text, style);
  }

  center(y: number, text: string, style: Style = 'n', x0 = 0, w = COLS): void {
    this.put(x0 + Math.floor((w - text.length) / 2), y, text, style);
  }

  fill(x: number, y: number, w: number, h: number, ch = ' ', style: Style = 'n'): void {
    for (let yy = y; yy < y + h; yy++) this.put(x, yy, ch.repeat(Math.max(0, w)), style);
  }

  /** Changes the style of a range without touching characters. */
  restyle(x: number, y: number, w: number, style: Style): void {
    if (y < 0 || y >= ROWS) return;
    for (let cx = Math.max(0, x); cx < Math.min(COLS, x + w); cx++) this.styles[y * COLS + cx] = style;
  }

  /** Full-width inverse title bar: left text, right text. */
  titleBar(y: number, left: string, right = ''): void {
    this.fill(0, y, COLS, 1, ' ', 'i');
    this.put(1, y, left, 'i');
    if (right) this.putRight(COLS - 1, y, right, 'i');
  }

  /**
   * Key bar on row y: items spread over the full width,
   * each drawn as `KEY` (normal) followed by `LABEL` on the key bar fill.
   */
  keyBar(y: number, items: Array<[string, string]>, disabled: string[] = []): void {
    if (!items.length) return;
    // Each item gets its natural width (KEY + space + LABEL), then the
    // spare columns are shared out so the bar fills the row.
    const natural = items.map(([k, l]) => k.length + l.length + 1);
    const gaps = items.length - 1;
    const spare = Math.max(0, COLS - gaps - natural.reduce((a, b) => a + b, 0));
    const widths = natural.map((n, i) => n + Math.floor(spare / items.length) + (i < spare % items.length ? 1 : 0));
    let x = 0;
    items.forEach(([key, label], i) => {
      const w = i === items.length - 1 ? COLS - x : widths[i];
      const start = x;
      x += w + 1;
      const off = disabled.includes(key);
      this.put(start, y, key, off ? 'd' : 'n');
      const lx = start + key.length;
      const lw = Math.max(0, w - key.length);
      this.fill(lx, y, lw, 1, ' ', off ? 'd' : 'k');
      this.put(lx + 1, y, label.slice(0, Math.max(0, lw - 1)), off ? 'd' : 'k');
    });
  }

  box(x: number, y: number, w: number, h: number, tone: Tone = 'n', opts: { single?: boolean; glow?: boolean } = {}): void {
    this.overlays.push({ t: 'box', x, y, w, h, tone, ...opts });
  }

  rect(x: number, y: number, w: number, h: number, tone: Tone = 'n', pattern: 'solid' | 'blocks' | 'hatch' = 'solid', glow = false): void {
    this.overlays.push({ t: 'rect', x, y, w, h, tone, pattern, glow });
  }

  hline(x: number, y: number, w: number, tone: Tone = 'd'): void {
    this.overlays.push({ t: 'hline', x, y, w, tone });
  }

  bar(x: number, y: number, w: number, pct: number, tone: Tone = 'n', double = false): void {
    this.overlays.push({ t: 'bar', x, y, w, pct: Math.max(0, Math.min(100, pct)), tone, double });
  }

  setCursor(x: number, y: number, shape: 'block' | 'under' = 'block'): void {
    this.cursor = { x, y, visible: true, shape };
  }

  hideCursor(): void {
    this.cursor.visible = false;
  }

  /** Text of a row (tests and debugging). */
  rowText(y: number): string {
    return this.chars.slice(y * COLS, (y + 1) * COLS).join('');
  }

  /** Whole screen as text, trailing spaces trimmed (tests and debugging). */
  text(): string {
    const lines: string[] = [];
    for (let y = 0; y < ROWS; y++) lines.push(this.rowText(y).replace(/\s+$/, ''));
    return lines.join('\n');
  }
}

export interface Seg {
  text: string;
  style?: Style;
}

/** Pads or cuts a string to exactly n characters. */
export function fit(s: string, n: number): string {
  if (n <= 0) return '';
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

/** Right-aligns a string in n characters. */
export function rfit(s: string, n: number): string {
  if (s.length >= n) return s.slice(s.length - n);
  return ' '.repeat(n - s.length) + s;
}

/** Splits text into lines of at most width characters (hard wrap). */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (raw.length === 0) {
      out.push('');
      continue;
    }
    for (let i = 0; i < raw.length; i += width) out.push(raw.slice(i, i + width));
  }
  return out;
}
