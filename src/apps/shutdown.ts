// [08] Shutdown: steps one by one, then IT IS NOW SAFE TO TURN OFF YOUR COMPUTER.

import type { KeyEvent } from '../input';
import type { OS } from '../os';
import { COLS, type Screen } from '../render/screen';

const STEP_MS = 280;

export class ShutdownScreen {
  private steps: string[];
  private elapsed = 0;
  private finished = false;

  constructor(
    private os: OS,
    private head: string[],
  ) {
    const others = os.ttys.filter((t) => t.loggedIn && t !== os.tty);
    const jobs = os.state.processes.filter((p) => p.kind === 'job').length;
    this.steps = [
      ...others.map((t) => `LOGGING OUT ${t.session.user} ON TTY${t.n}`),
      `STOPPING JOBS (${jobs})`,
      'SAVING OPEN FILES',
      'WRITING EVENTS.LOG',
      'CLOSING COM1',
      'FLUSHING DISK BUFFERS C:',
    ];
  }

  private get shown(): number {
    return Math.min(this.steps.length, Math.floor(this.elapsed / STEP_MS));
  }

  onTick(dt: number): void {
    this.elapsed += dt;
    if (!this.finished && this.shown >= this.steps.length) {
      this.finished = true;
      this.os.shutdownDone();
    }
  }

  onKey(_e: KeyEvent): void {
    if (this.finished) this.os.powerOn();
  }

  render(s: Screen): void {
    let y = 0;
    for (const h of this.head) s.put(0, y++, h, y === 1 ? 'n' : 'd');
    y += 1;
    for (let i = 0; i < this.shown; i++) {
      s.put(0, y + i, this.steps[i]);
      s.put(44, y + i, '[ OK ]', 'b');
    }
    if (!this.finished) return;
    const w = 40;
    const x = Math.floor((COLS - w) / 2);
    s.box(x, 14, w, 6, 'b', { glow: true });
    s.center(16, 'IT IS NOW SAFE TO TURN OFF', 'b');
    s.center(17, 'YOUR COMPUTER.', 'b');
    s.center(21, 'PRESS ANY KEY TO RESTART', 'd');
  }
}
