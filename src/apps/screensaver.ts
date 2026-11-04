// [06] Screensaver: big clock, drifting PHOSPHOR words. Any key wakes;
// with LOCK ON WAKE, the password of the visible TTY's user is asked.

import type { KeyEvent } from '../input';
import { dateStr, now, weekday } from '../kernel/clock';
import { checkPassword } from '../kernel/users';
import type { OS } from '../os';
import { COLS, type Screen } from '../render/screen';

// 5x3 block digits drawn with rects
const DIGITS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

interface Drifter {
  x: number;
  y: number;
  dx: number;
  dy: number;
  dim: boolean;
}

export class Screensaver {
  private t = 0;
  private drifters: Drifter[] = [
    { x: 10, y: 3, dx: 0.6, dy: 0.25, dim: false },
    { x: 58, y: 6, dx: -0.5, dy: 0.3, dim: true },
    { x: 50, y: 20, dx: 0.45, dy: -0.35, dim: false },
    { x: 6, y: 18, dx: -0.4, dy: -0.2, dim: true },
  ];
  /** Password prompt when locked. */
  asking = false;
  private pw = '';
  private msg = '';

  constructor(private os: OS) {}

  private locked(): boolean {
    const u = this.os.tty.user;
    return this.os.settings.lockOnWake && !!u && u.role !== 'guest' && !!u.passwordHash;
  }

  onKey(e: KeyEvent): void {
    if (!this.locked()) {
      this.os.wake();
      return;
    }
    if (!this.asking) {
      this.asking = true;
      return;
    }
    if (e.combo === 'enter') {
      const u = this.os.tty.user!;
      if (checkPassword(u, this.pw)) {
        this.os.log('INFO', `SCREEN UNLOCKED ON TTY${this.os.tty.n}`, u.name);
        this.os.wake();
      } else {
        this.msg = 'WRONG PASSWORD.  TRY AGAIN.';
        this.os.log('WARN', `UNLOCK FAILED ON TTY${this.os.tty.n}`, u.name);
      }
      this.pw = '';
    } else if (e.combo === 'escape') {
      this.asking = false;
      this.pw = '';
      this.msg = '';
    } else if (e.combo === 'backspace') this.pw = this.pw.slice(0, -1);
    else if (e.ch && e.ch !== ' ' && this.pw.length < 16) this.pw += e.ch;
  }

  onTick(dt: number): void {
    this.t += dt;
    const k = dt / 100;
    for (const d of this.drifters) {
      d.x += d.dx * k;
      d.y += d.dy * k;
      if (d.x < 0 || d.x > COLS - 8) d.dx = -d.dx;
      if (d.y < 0 || d.y > 23) d.dy = -d.dy;
      d.x = Math.max(0, Math.min(COLS - 8, d.x));
      d.y = Math.max(0, Math.min(23, d.y));
    }
  }

  render(s: Screen): void {
    s.mode = 'saver';
    for (const d of this.drifters) s.put(Math.round(d.x), Math.round(d.y), 'PHOSPHOR', d.dim ? 'f' : 'd');
    const time = new Date(now());
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    const colon = Math.floor(this.t / 500) % 2 === 0;
    // each digit 3 px wide of 2.2 cells, 5 px tall of 0.8 rows
    const pw = 2.2;
    const ph = 0.8;
    const digitW = 3 * pw + 1.6;
    const total = 4 * digitW + 3;
    let x = (COLS - total) / 2;
    const y = 7;
    const drawDigit = (ch: string) => {
      DIGITS[ch].forEach((row, ry) =>
        row.split('').forEach((b, rx) => {
          if (b === '1') s.rect(x + rx * pw, y + ry * ph, pw - 0.3, ph - 0.12, 'n', 'solid', true);
        }),
      );
      x += digitW;
    };
    drawDigit(hh[0]);
    drawDigit(hh[1]);
    if (colon) {
      s.rect(x + 0.6, y + ph * 1, 1.2, ph - 0.12, 'n', 'solid', true);
      s.rect(x + 0.6, y + ph * 3, 1.2, ph - 0.12, 'n', 'solid', true);
    }
    x += 3;
    drawDigit(mm[0]);
    drawDigit(mm[1]);
    s.center(y + 6, `${weekday()} ${dateStr()}`.split('').join(' '), 'd');

    if (this.asking) {
      const w = 40;
      const bx = Math.floor((COLS - w) / 2);
      s.overlays.push({ t: 'rect', x: bx, y: 16, w, h: 5, tone: 'bg' });
      s.box(bx, 16, w, 5, 'n', { glow: true });
      s.put(bx + 3, 17, `LOCKED.  PASSWORD FOR ${this.os.tty.session.user}:`, 'd');
      s.put(bx + 3, 18, '*'.repeat(this.pw.length));
      s.setCursor(bx + 3 + this.pw.length, 18);
      if (this.msg) s.put(bx + 3, 19, this.msg, 'i');
    } else {
      const lock = this.locked() ? '     LOCKED: PASSWORD ON WAKE' : '';
      s.center(22, `PRESS ANY KEY${lock}`, 'd');
    }
  }
}
