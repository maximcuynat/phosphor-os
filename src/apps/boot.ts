// [02] Boot: BIOS checks, PHOSPHOR logo, loading bar. ESC: SETUP. F8: SAFE MODE.

import { LOGO_BITMAP } from '../data/default-disk';
import type { KeyEvent } from '../input';
import { dateStr, hhmm } from '../kernel/clock';
import type { OS } from '../os';
import { COLS, type Screen } from '../render/screen';

export const BOOT_MS = 3600;

export class BootScreen {
  elapsed = 0;
  safe: boolean;
  private done = false;

  constructor(
    private os: OS,
    opts: { safe?: boolean } = {},
  ) {
    this.safe = !!opts.safe;
  }

  onKey(e: KeyEvent): void {
    if (e.combo === 'escape') this.os.enterSetup();
    else if (e.combo === 'f8') this.safe = true;
  }

  onTick(dt: number): void {
    this.elapsed += dt;
    if (!this.done && this.elapsed >= BOOT_MS + 300) {
      this.done = true;
      this.os.bootDone(this.safe);
    }
  }

  get pct(): number {
    return Math.min(100, Math.floor((this.elapsed / BOOT_MS) * 100));
  }

  render(s: Screen): void {
    s.put(0, 0, 'PHOSPHOR SYSTEMS BIOS V2.1', 'd');
    s.putRight(COLS, 0, '(C) 1984 PHOSPHOR SYSTEMS', 'd');

    // Logo: 5 x 31 pixels of 18 px with 3 px gaps (1.75 cells x 0.84 rows per pixel step)
    const stepX = 1.75;
    const stepY = 0.84;
    const x0 = (COLS - 31 * stepX) / 2;
    LOGO_BITMAP.forEach((row, ry) => {
      row.split('').forEach((ch, rx) => {
        if (ch === '1') s.rect(x0 + rx * stepX, 2 + ry * stepY, 1.5, 0.72, 'n', 'solid', true);
      });
    });
    s.center(7, 'O P E R A T I N G   S Y S T E M     V E R S I O N   1 . 0', 'b');

    const steps: Array<[string, number]> = [
      ['CPU   P-80 @ 4.77 MHZ', 400],
      ['MEMORY TEST  640K', 900],
      ['VIDEO  MONO PHOSPHOR 80X25', 1400],
      [`DRIVE A:  360K`, 1900],
      [`CLOCK  ${dateStr()} ${hhmm()}`, 2400],
      ['LOADING SHELL', BOOT_MS],
    ];
    steps.forEach(([label, at], i) => {
      if (this.elapsed < at - 500 && i > 0) return;
      const ok = this.elapsed >= at;
      s.put(0, 10 + i, label);
      s.put(46, 10 + i, ok ? '[ OK ]' : '[ ... ]', ok ? 'b' : 'd');
    });
    if (this.safe) s.put(0, 17, 'F8 PRESSED: STARTING IN SAFE MODE.', 'b');

    s.put(0, 20, 'LOADING PHOSPHOR.SYS ');
    if (this.pct < 100) s.setCursor(21, 20, 'under');
    s.putRight(COLS, 20, `${this.pct}%`, 'b');
    s.bar(0, 21.2, COLS, this.pct, 'n', true);
    s.put(0, 23, 'PRESS ESC TO ENTER SETUP     PRESS F8 FOR SAFE MODE', 'd');
  }
}
