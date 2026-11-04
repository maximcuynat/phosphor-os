// [07] Fatal error: any key reboots, F8 reboots in safe mode.

import type { KeyEvent } from '../input';
import { duration } from '../kernel/clock';
import type { OS } from '../os';
import { COLS, type Screen } from '../render/screen';

export interface CrashInfo {
  module: string;
  pid: number;
  user: string;
  tty: number;
  uptimeMs: number;
  detail: string;
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');

export class FatalScreen {
  private regs: string[];
  private addr: string;

  constructor(
    private os: OS,
    private info: CrashInfo,
  ) {
    let seed = [...info.module].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const r = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed & 0xffff;
    };
    const cs = 0x0f00 + (r() & 0xff);
    const ip = r() & 0x0fff;
    this.addr = `${hex(cs)}:${hex(ip)}`;
    this.regs = [
      ` AX=${hex(r())}  BX=${hex(r())}  CX=${hex(r())}  DX=${hex(r())}  SI=${hex(ip)}  DI=${hex(r())}`,
      ` CS=${hex(cs)}  DS=${hex(r())}  SS=${hex(r())}  SP=${hex(0xffee)}  FLAGS=NV UP EI PL ZR`,
      '',
      'STACK TRACE',
      ` ${this.addr}  ${info.module}.MAIN`,
      ` ${hex(cs)}:${hex((ip >> 1) & 0x0fff)}  ${info.module}.DISPATCH`,
      ` 0E10:0230  KERNEL.DISPATCH`,
    ];
  }

  onKey(e: KeyEvent): void {
    this.os.reboot({ safe: e.combo === 'f8' });
  }

  render(s: Screen): void {
    s.fill(0, 0, COLS, 2, ' ', 'i');
    s.center(0, '*** SYSTEM HALTED ***', 'i');
    s.center(1, 'FATAL ERROR', 'i');
    s.put(0, 3, 'FATAL ERROR 0E: PAGE FAULT', 'b');
    s.put(0, 4, `IN MODULE  ${this.info.module.padEnd(12)}AT ${this.addr}`);
    s.put(0, 5, `PROCESS    PID ${String(this.info.pid).padEnd(8)}USER ${this.info.user.padEnd(8)}TTY${this.info.tty}`);
    s.put(0, 6, `UPTIME     ${duration(this.info.uptimeMs)}`);
    s.box(0, 8, COLS, 11, 'd');
    s.put(2, 9, 'REGISTERS', 'd');
    this.regs.forEach((l, i) => s.put(2, 10 + i, l, 'd'));
    let x = s.put(0, 20, 'UNSAVED WORK MAY BE LOST.  REPORT SAVED TO ', 'd');
    x = s.put(x, 20, 'A:\\SYSTEM\\CRASH.LOG', 'b');
    s.put(0, 23, 'PRESS ANY KEY TO REBOOT');
    s.setCursor(23, 23, 'under');
    s.putRight(COLS, 23, 'F8: REBOOT IN SAFE MODE', 'd');
    void x;
  }
}
