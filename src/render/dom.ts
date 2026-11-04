// DOM renderer: one div per row, runs of equal style grouped in spans.
// Only rows that changed are rewritten.

import { COLS, ROWS, Screen, type Overlay, type Style } from './screen';

const TARGET_CW = 12; // px per column: 80 columns = 960 px

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class DomRenderer {
  readonly crt: HTMLElement;
  private rows: HTMLElement[] = [];
  private rowCache: string[] = [];
  private overlayLayer: HTMLElement;
  private overlayCache = '';
  private cursorEl: HTMLElement;
  private cw = TARGET_CW;
  private ch = 25;
  private modeCache = '';

  constructor(host: HTMLElement) {
    host.innerHTML = '';
    this.crt = document.createElement('div');
    this.crt.className = 'crt';
    const grid = document.createElement('div');
    grid.className = 'grid';
    this.overlayLayer = document.createElement('div');
    this.overlayLayer.className = 'layer overlays';
    const text = document.createElement('div');
    text.className = 'layer text';
    for (let y = 0; y < ROWS; y++) {
      const r = document.createElement('div');
      r.className = 'row';
      text.appendChild(r);
      this.rows.push(r);
      this.rowCache.push('');
    }
    this.cursorEl = document.createElement('div');
    this.cursorEl.className = 'cursor hidden';
    grid.append(this.overlayLayer, text, this.cursorEl);
    const scan = document.createElement('div');
    scan.className = 'scanlines';
    this.crt.append(grid, scan);
    host.appendChild(this.crt);
    this.measure();
    this.fit();
    window.addEventListener('resize', () => this.fit());
    if (document.fonts?.ready) document.fonts.ready.then(() => this.measure());
  }

  /** Measures VT323's advance and sets letter-spacing so a column is exactly TARGET_CW px. */
  measure(): void {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-family:VT323,monospace;font-size:22px;letter-spacing:0';
    probe.textContent = 'M'.repeat(80);
    document.body.appendChild(probe);
    const w = probe.getBoundingClientRect().width / 80;
    probe.remove();
    const ls = w > 0 ? TARGET_CW - w : 0;
    const root = document.documentElement.style;
    root.setProperty('--cw', `${TARGET_CW}px`);
    root.setProperty('--ch', `${this.ch}px`);
    root.setProperty('--ls', `${ls}px`);
    this.cw = TARGET_CW;
  }

  /** Scales the tube to fit the window, keeping its proportions. */
  fit(): void {
    const w = this.cw * COLS + 96;
    const h = this.ch * ROWS + 80;
    const k = Math.min((window.innerWidth - 24) / w, (window.innerHeight - 24) / h);
    const s = `scale(${Math.max(0.3, k).toFixed(4)})`;
    this.crt.style.setProperty('--scale', s);
    this.crt.style.transform = s;
  }

  /** Plays a CSS class animation on the tube and resolves when done. */
  animate(cls: 'power-on' | 'power-off', ms: number): Promise<void> {
    this.crt.classList.remove('power-on', 'power-off', 'off');
    void this.crt.offsetWidth; // restart the animation
    this.crt.classList.add(cls);
    return new Promise((res) =>
      setTimeout(() => {
        this.crt.classList.remove(cls);
        res();
      }, ms),
    );
  }

  setOff(off: boolean): void {
    this.crt.classList.toggle('off', off);
  }

  draw(s: Screen): void {
    for (let y = 0; y < ROWS; y++) {
      const html = this.rowHtml(s, y);
      if (html !== this.rowCache[y]) {
        this.rowCache[y] = html;
        this.rows[y].innerHTML = html;
      }
    }
    const ov = s.overlays.map((o) => this.overlayHtml(o)).join('');
    if (ov !== this.overlayCache) {
      this.overlayCache = ov;
      this.overlayLayer.innerHTML = ov;
    }
    const c = s.cursor;
    this.cursorEl.classList.toggle('hidden', !c.visible);
    this.cursorEl.classList.toggle('under', c.shape === 'under');
    if (c.visible) {
      const left = `${c.x * this.cw}px`;
      const top = `${c.y * this.ch}px`;
      if (this.cursorEl.style.left !== left || this.cursorEl.style.top !== top) {
        this.cursorEl.style.left = left;
        this.cursorEl.style.top = top;
        // restart the blink so the cursor is visible right after a key press
        this.cursorEl.style.animation = 'none';
        void this.cursorEl.offsetWidth;
        this.cursorEl.style.animation = '';
      }
    }
    if (s.mode !== this.modeCache) {
      if (this.modeCache) this.crt.classList.remove(this.modeCache);
      if (s.mode) this.crt.classList.add(s.mode);
      this.modeCache = s.mode;
    }
  }

  private rowHtml(s: Screen, y: number): string {
    let html = '';
    let run = '';
    let cur: Style | null = null;
    const flush = () => {
      if (!run) return;
      html += cur === 'n' ? esc(run) : `<span class="s-${cur}">${esc(run)}</span>`;
      run = '';
    };
    for (let x = 0; x < COLS; x++) {
      const i = y * COLS + x;
      const st = s.styles[i];
      if (st !== cur) {
        flush();
        cur = st;
      }
      run += s.chars[i];
    }
    flush();
    return html;
  }

  private overlayHtml(o: Overlay): string {
    const cw = this.cw;
    const ch = this.ch;
    const tone = `t-${o.tone ?? 'n'}`;
    switch (o.t) {
      case 'box': {
        const bw = o.single ? 2 : 4;
        const l = (o.x + 0.5) * cw - bw / 2;
        const t = (o.y + 0.5) * ch - bw / 2;
        const w = (o.w - 1) * cw + bw;
        const h = (o.h - 1) * ch + bw;
        return `<div class="ov box ${tone}${o.single ? ' single' : ''}${o.glow ? ' glow' : ''}" style="left:${l}px;top:${t}px;width:${w}px;height:${h}px"></div>`;
      }
      case 'rect': {
        const bg = o.color && /^#[0-9a-f]{3,8}$/i.test(o.color) ? `;background:${o.color}` : '';
        return `<div class="ov rect ${tone} ${o.pattern ?? 'solid'}${o.glow ? ' glow' : ''}" style="left:${o.x * cw}px;top:${o.y * ch}px;width:${o.w * cw}px;height:${o.h * ch}px${bg}"></div>`;
      }
      case 'hline':
        return `<div class="ov hline ${tone}" style="left:${o.x * cw}px;top:${(o.y + 0.5) * ch - 1}px;width:${o.w * cw}px"></div>`;
      case 'bar': {
        const pad = o.double ? 0 : 3;
        return `<div class="ov bar ${tone}${o.double ? ' double' : ''}" style="left:${o.x * cw}px;top:${o.y * ch + pad}px;width:${o.w * cw}px;height:${ch - pad * 2}px"><i style="width:${o.pct}%"></i></div>`;
      }
    }
  }
}
