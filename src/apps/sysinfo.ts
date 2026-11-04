// SYSINFO: disks, CHKDSK, devices and memory map (board [18]).

import { MEM_TOTAL_K } from '../config';
import type { KeyEvent } from '../input';
import { deviceTable } from '../kernel/devices';
import type { DriveId } from '../kernel/types';
import type { OS } from '../os';
import { fit, rfit, type Screen, type Style, type Tone } from '../render/screen';
import type { App, Ctx } from './types';
import { borderTitle, drawMsg, num, type Msg } from './ui';

const DRIVES: DriveId[] = ['A', 'B', 'C'];
const SCAN_MS = 2000;

interface CheckResult {
  drive: DriveId;
  totalK: number;
  usedK: number;
  freeK: number;
  bad: number;
}

/** CHKDSK history since boot (a reboot starts a new record). */
const history = new WeakMap<OS, { boot: number; checked: Set<DriveId>; last: CheckResult | null }>();

function hist(os: OS) {
  let h = history.get(os);
  if (!h || h.boot !== os.bootedAt) {
    h = { boot: os.bootedAt, checked: new Set(), last: null };
    history.set(os, h);
  }
  return h;
}

export class SysinfoApp implements App {
  id = 'sysinfo';
  memK = 20;

  private sel = 2;
  private view: 'map' | 'mem' = 'map';
  private focusDev = false;
  private devSel = 0;
  private memTop = 0;
  private scan: { drive: DriveId; ms: number } | null = null;
  private prompt: DriveId | null = null;
  private msg: Msg | null = null;

  onEnter(ctx: Ctx, args: string[]): void {
    const a0 = (args[0] ?? '').toUpperCase();
    if (a0 === 'MEM') this.view = 'mem';
    if (a0 === 'CHKDSK') {
      const d = (args[1] ?? 'C:').replace(':', '').toUpperCase() as DriveId;
      this.sel = Math.max(0, DRIVES.indexOf(d));
      this.startCheck(ctx);
    }
  }

  private drive(): DriveId {
    return DRIVES[this.sel];
  }

  private startCheck(ctx: Ctx): void {
    const d = this.drive();
    this.msg = null;
    if (!ctx.os.state.drives[d].ready) {
      this.scan = null;
      this.prompt = d;
      ctx.log('ERROR', `NOT READY READING DRIVE ${d}:`);
      return;
    }
    this.prompt = null;
    this.scan = { drive: d, ms: 0 };
  }

  private finishCheck(ctx: Ctx): void {
    const d = this.scan!.drive;
    this.scan = null;
    const h = hist(ctx.os);
    const bad = d === 'C' && !h.checked.has('C') ? 2 : 0;
    h.checked.add(d);
    const st = ctx.os.state.drives[d];
    const used = ctx.vfs.used(d);
    h.last = { drive: d, totalK: Math.round(st.capacity / 1024), usedK: Math.round(used / 1024), freeK: Math.round((st.capacity - used) / 1024), bad };
    if (bad) {
      const text = `${d}: ${bad} BAD SECTORS MARKED`;
      ctx.log('WARN', text);
      this.msg = { text: `${text}.  THEY WILL NOT BE USED.`, level: 'WARN' };
    } else this.msg = { text: `CHKDSK ${d}: DONE.  NO ERRORS FOUND.`, level: 'INFO' };
  }

  onTick(ctx: Ctx, dt: number): void {
    if (!this.scan) return;
    this.scan.ms += dt;
    if (this.scan.ms >= SCAN_MS) this.finishCheck(ctx);
  }

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (this.prompt) {
      const d = this.prompt;
      if (e.combo === 'r') {
        this.startCheck(ctx);
      } else if (e.combo === 'a' || e.combo === 'escape') {
        this.prompt = null;
        this.msg = { text: `CHKDSK ${d}: ABORTED.  PRESS C TO TRY AGAIN.`, level: 'INFO' };
      } else if (e.combo === 'f') {
        this.prompt = null;
        const text = `CHKDSK ${d}: FAILED, NO DISK IN DRIVE.  INSERT ONE AND PRESS C.`;
        this.msg = { text, level: 'ERROR' };
        ctx.log('ERROR', text.replace(/\.\s.*$/, ''));
      }
      return;
    }
    if (e.combo === 'escape') {
      ctx.exit();
      return;
    }
    if (this.scan) return;
    const n = deviceTable(ctx.os.state, { online: ctx.os.online, loaded: ctx.os.loaded, safeMode: ctx.os.safe }).length;
    switch (e.combo) {
      case 'arrowup':
      case 'arrowdown': {
        const dir = e.combo === 'arrowup' ? -1 : 1;
        if (this.view === 'mem' && !this.focusDev) this.memTop = Math.max(0, this.memTop + dir);
        else if (this.focusDev) this.devSel = Math.max(0, Math.min(n - 1, this.devSel + dir));
        else this.sel = Math.max(0, Math.min(DRIVES.length - 1, this.sel + dir));
        this.msg = null;
        return;
      }
      case 'c':
        this.focusDev = false;
        this.startCheck(ctx);
        return;
      case 'm':
        this.view = this.view === 'map' ? 'mem' : 'map';
        this.memTop = 0;
        return;
      case 'd':
        this.focusDev = !this.focusDev;
        this.msg = null;
        return;
      case 'r':
        this.msg = { text: 'REFRESHED.', level: 'INFO' };
        return;
      case 'h':
      case 'f1':
        if (!ctx.open('help', [this.view === 'mem' ? 'MEM' : 'SYSINFO'])) {
          this.msg = { text: ctx.os.lastError ?? 'HELP IS NOT AVAILABLE.  TRY AGAIN LATER.', level: 'ERROR' };
        }
        return;
    }
  }

  render(s: Screen, ctx: Ctx): void {
    const os = ctx.os;
    s.titleBar(0, 'SYSINFO', 'CHKDSK  MEM  DEVICES');
    this.renderDisks(s, ctx);
    this.renderDevices(s, ctx);
    if (this.view === 'map') this.renderMap(s, os);
    else this.renderMemDetail(s, os);

    if (this.prompt) s.put(0, 23, `NOT READY READING DRIVE ${this.prompt}:  ABORT, RETRY, FAIL?`.padEnd(80), 'i');
    else if (this.focusDev) {
      const d = deviceTable(os.state, { online: os.online, loaded: os.loaded, safeMode: os.safe })[this.devSel];
      if (d) s.put(0, 23, `${d.id}  ${d.name}  STATE ${d.state}.  UP/DN SELECT, D TO LEAVE.`, 'd');
    } else drawMsg(s, 23, this.msg);

    s.keyBar(24, [['C', 'CHKDSK'], ['M', 'MEM DETAIL'], ['D', 'DEVICES'], ['R', 'REFRESH'], ['ESC', 'QUIT']]);
  }

  private renderDisks(s: Screen, ctx: Ctx): void {
    const os = ctx.os;
    s.box(1, 2, 42, 10, this.focusDev ? 'd' : 'b', { glow: !this.focusDev });
    borderTitle(s, 1, 2, 42, 'DISKS');
    DRIVES.forEach((d, i) => {
      const y = 3 + i;
      const drive = os.state.drives[d];
      const on = i === this.sel && !this.focusDev;
      s.put(2, y, ` ${d}: `, on ? 'i' : 'n');
      if (!drive.ready) {
        s.put(26, y, 'NO DISK', 'd');
        return;
      }
      const used = ctx.vfs.used(d);
      s.bar(7, y, 18, (used / drive.capacity) * 100, 'n');
      const text =
        d === 'C'
          ? `${(used / 1048576).toFixed(1)}M/${(drive.capacity / 1048576).toFixed(1)}M`
          : `${Math.round(used / 1024)}K/${Math.round(drive.capacity / 1024)}K`;
      s.put(26, y, text, 'b');
    });
    s.hline(2, 6, 40, 'd');
    if (this.scan) {
      const pct = Math.min(100, Math.floor((this.scan.ms / SCAN_MS) * 100));
      s.put(2, 7, `CHECKING ${this.scan.drive}: ${pct}%`, 'b');
      s.bar(2, 8, 40, pct, 'b');
      return;
    }
    const last = hist(os).last;
    if (!last) {
      s.put(2, 7, 'NO CHKDSK YET.  C CHECKS THE DISK.', 'd');
      return;
    }
    s.put(2, 7, `CHKDSK ${last.drive}:  ${num(last.totalK)}K TOTAL`, 'n');
    if (last.bad) s.put(2, 8, `${last.bad} BAD SECTORS FOUND AND MARKED.`, 'b');
    else s.put(2, 8, '0 LOST CHAINS.  DISK OK.', 'd');
    s.put(2, 9, `${num(last.usedK)}K USED  ${num(last.freeK)}K FREE`, 'd');
  }

  private renderDevices(s: Screen, ctx: Ctx): void {
    const os = ctx.os;
    s.box(44, 2, 35, 10, this.focusDev ? 'b' : 'd', { glow: this.focusDev });
    borderTitle(s, 44, 2, 35, 'DEVICES');
    const rows = deviceTable(os.state, { online: os.online, loaded: os.loaded, safeMode: os.safe });
    rows.forEach((d, i) => {
      const y = 3 + i;
      if (y > 10) return;
      const on = this.focusDev && i === this.devSel;
      const st: Style = on ? 'i' : 'd';
      if (on) s.fill(45, y, 33, 1, ' ', 'i');
      s.put(45, y, fit(d.id, 6), on ? 'i' : 'n');
      s.put(51, y, d.name, st);
      s.putRight(78, y, d.state, on ? 'i' : d.state === 'OK' ? 'b' : 'd');
    });
  }

  private renderMap(s: Screen, os: OS): void {
    const procs = os.procs;
    s.box(1, 12, 78, 11, 'b', { glow: true });
    borderTitle(s, 1, 12, 78, 'MEMORY MAP');
    s.put(2, 13, `${MEM_TOTAL_K}K CONVENTIONAL`, 'd');
    const used = `${procs.usedK()}K USED`;
    const free = `${procs.freeK()}K FREE`;
    s.putRight(77, 13, `${used}   ${free}`, 'b');

    const map = procs.memoryMap();
    const pats: Array<{ tone: Tone; pattern: 'solid' | 'hatch' }> = [
      { tone: 'b', pattern: 'solid' },
      { tone: 'n', pattern: 'hatch' },
      { tone: 'k', pattern: 'solid' },
    ];
    const W = 76;
    let x = 2;
    const sw: Array<{ tone: Tone; pattern: 'solid' | 'hatch' } | null> = [];
    let idx = 0;
    for (const r of map) {
      const w = (r.k / MEM_TOTAL_K) * W;
      if (r.kind === 'free') {
        sw.push(null);
      } else {
        const p = pats[idx++ % pats.length];
        s.rect(x, 14.3, Math.max(0.1, w - 0.1), 1.4, p.tone, p.pattern);
        sw.push(p);
      }
      x += w;
    }
    const colW = 25;
    map.slice(0, 18).forEach((r, i) => {
      const cx = 2 + (i % 3) * colW;
      const y = 16 + Math.floor(i / 3);
      const p = sw[i];
      if (p) s.rect(cx, y + 0.3, 1.2, 0.4, p.tone, p.pattern);
      else s.rect(cx, y + 0.3, 1.2, 0.4, 'd', 'solid');
      s.put(cx + 2, y, fit(r.label, 14), r.kind === 'free' ? 'd' : 'n');
      s.put(cx + 17, y, rfit(`${r.k}K`, 5), 'b');
    });
  }

  private renderMemDetail(s: Screen, os: OS): void {
    const procs = os.procs;
    s.box(1, 12, 78, 11, 'b', { glow: true });
    borderTitle(s, 1, 12, 78, 'MEMORY DETAIL');
    s.put(2, 13, `${MEM_TOTAL_K}K CONVENTIONAL`, 'd');
    s.putRight(77, 13, `${procs.usedK()}K USED   ${procs.freeK()}K FREE`, 'b');
    s.put(3, 14, 'PID', 'd');
    s.put(10, 14, 'NAME', 'd');
    s.put(28, 14, 'USER', 'd');
    s.put(40, 14, 'TTY', 'd');
    s.put(50, 14, 'MEM', 'd');
    s.hline(2, 14.45, 76, 'd');
    const list = [...procs.list].sort((a, b) => a.pid - b.pid);
    const page = 7;
    this.memTop = Math.max(0, Math.min(this.memTop, Math.max(0, list.length - page)));
    list.slice(this.memTop, this.memTop + page).forEach((p, i) => {
      const y = 15 + i;
      const st: Style = p.state === 'run' ? 'b' : 'n';
      s.put(3, y, String(p.pid), st);
      s.put(10, y, fit(p.cmd, 17), st);
      s.put(28, y, fit(p.user, 10), st);
      s.put(40, y, p.tty ? `TTY${p.tty}` : '-', st);
      s.put(48, y, rfit(`${p.memK}K`, 5), st);
    });
  }
}
