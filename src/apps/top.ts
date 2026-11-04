// TOP: live process monitor (board [17]).

import { MEM_TOTAL_K } from '../config';
import type { KeyEvent } from '../input';
import { dateStr, duration, hhmmss, now } from '../kernel/clock';
import type { ProcInfo } from '../kernel/types';
import { fit, rfit, type Screen } from '../render/screen';
import type { App, Ctx } from './types';
import { borderTitle, drawMsg, type Msg } from './ui';

type SortKey = 'cpu' | 'mem' | 'pid';
const SORTS: SortKey[] = ['cpu', 'mem', 'pid'];
const RATES = [500, 1000, 2000, 5000];
const HIST_LEN = 40;
const PAGE = 10;

interface Row {
  pid: number;
  name: string;
  state: ProcInfo['state'];
  cpu: number;
  memK: number;
  cpuTime: number;
}

interface Meters {
  cpu: number;
  usedK: number;
  r: number;
  w: number;
  tasks: number;
  running: number;
  sleeping: number;
}

const rateLabel = (ms: number) => `${ms / 1000}S`;

export class TopApp implements App {
  id = 'top';
  memK = 18;

  private rows: Row[] = [];
  private m: Meters = { cpu: 0, usedK: 0, r: 0, w: 0, tasks: 0, running: 0, sleeping: 0 };
  private hist: number[] = [];
  private sort: SortKey = 'cpu';
  private rate = 1;
  private acc = 0;
  private histAcc = 0;
  private selPid = -1;
  private selIdx = 0;
  private top = 0;
  private confirm: { pid: number; name: string } | null = null;
  private msg: Msg | null = null;

  onEnter(ctx: Ctx): void {
    this.snapshot(ctx);
    this.hist.push(this.m.cpu);
  }

  onTick(ctx: Ctx, dt: number): void {
    this.histAcc += dt;
    while (this.histAcc >= 1000) {
      this.histAcc -= 1000;
      this.hist.push(ctx.os.procs.totalCpu());
      if (this.hist.length > HIST_LEN) this.hist.shift();
    }
    this.acc += dt;
    if (this.acc >= RATES[this.rate]) {
      this.acc = 0;
      this.snapshot(ctx);
    }
  }

  private sortRows(rows: Row[]): Row[] {
    const by: Record<SortKey, (a: Row, b: Row) => number> = {
      cpu: (a, b) => b.cpu - a.cpu || a.pid - b.pid,
      mem: (a, b) => b.memK - a.memK || a.pid - b.pid,
      pid: (a, b) => a.pid - b.pid,
    };
    return rows.sort(by[this.sort]);
  }

  private snapshot(ctx: Ctx): void {
    const os = ctx.os;
    const list = os.procs.list;
    const jobs = list.filter((p) => p.kind === 'job' && p.state === 'run').length;
    this.m = {
      cpu: os.procs.totalCpu(),
      usedK: os.procs.usedK(),
      r: Math.round(2 + jobs * (14 + Math.random() * 10) + Math.random() * 3),
      w: Math.round(1 + jobs * (5 + Math.random() * 6) + Math.random() * 2),
      tasks: list.length,
      running: list.filter((p) => p.state === 'run').length,
      sleeping: list.filter((p) => p.state === 'sleep').length,
    };
    this.rows = this.sortRows(list.map((p) => ({ pid: p.pid, name: p.name, state: p.state, cpu: p.cpu, memK: p.memK, cpuTime: p.cpuTime })));
    this.reselect();
  }

  /** Keeps the selection on the same PID when it still exists. */
  private reselect(): void {
    const i = this.rows.findIndex((r) => r.pid === this.selPid);
    this.selIdx = i >= 0 ? i : Math.max(0, Math.min(this.selIdx, this.rows.length - 1));
    this.selPid = this.rows[this.selIdx]?.pid ?? -1;
    this.scrollTo();
  }

  private scrollTo(): void {
    if (this.selIdx < this.top) this.top = this.selIdx;
    if (this.selIdx >= this.top + PAGE) this.top = this.selIdx - PAGE + 1;
    this.top = Math.max(0, Math.min(this.top, Math.max(0, this.rows.length - PAGE)));
  }

  private move(to: number): void {
    if (!this.rows.length) return;
    this.selIdx = Math.max(0, Math.min(this.rows.length - 1, to));
    this.selPid = this.rows[this.selIdx].pid;
    this.scrollTo();
  }

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (this.confirm) {
      const c = this.confirm;
      if (e.combo === 'y') {
        this.confirm = null;
        const r = ctx.os.kill(c.pid, ctx.user);
        if (ctx.os.mode !== 'running') return;
        if (!r.ok) {
          this.msg = { text: r.msg, level: 'ERROR' };
          ctx.log('ERROR', r.msg);
        } else this.msg = r.msg ? { text: r.msg, level: 'INFO' } : null;
        this.snapshot(ctx);
      } else if (e.combo === 'n' || e.combo === 'escape') {
        this.confirm = null;
        this.msg = { text: 'KILL CANCELLED.', level: 'INFO' };
      }
      return;
    }
    this.msg = null;
    switch (e.combo) {
      case 'escape':
        ctx.exit();
        return;
      case 'arrowup':
        this.move(this.selIdx - 1);
        return;
      case 'arrowdown':
        this.move(this.selIdx + 1);
        return;
      case 'pageup':
        this.move(this.selIdx - PAGE);
        return;
      case 'pagedown':
        this.move(this.selIdx + PAGE);
        return;
      case 'home':
        this.move(0);
        return;
      case 'end':
        this.move(this.rows.length - 1);
        return;
      case 'k': {
        const r = this.rows[this.selIdx];
        if (r) this.confirm = { pid: r.pid, name: r.name };
        return;
      }
      case 's':
        this.sort = SORTS[(SORTS.indexOf(this.sort) + 1) % SORTS.length];
        this.rows = this.sortRows(this.rows);
        this.reselect();
        return;
      case '+':
      case '=':
        this.rate = Math.max(0, this.rate - 1);
        this.acc = 0;
        return;
      case '-':
        this.rate = Math.min(RATES.length - 1, this.rate + 1);
        this.acc = 0;
        return;
      case 'h':
      case 'f1':
        if (!ctx.open('help', ['TOP'])) {
          const text = ctx.os.lastError ?? 'HELP IS NOT AVAILABLE.  TRY AGAIN LATER.';
          this.msg = { text, level: 'ERROR' };
        }
        return;
    }
  }

  render(s: Screen, ctx: Ctx): void {
    const os = ctx.os;
    const m = this.m;
    s.titleBar(0, 'PHOSPHOR TOP', `${dateStr()}  ${hhmmss()}`);

    const up = duration(Math.max(0, now() - os.bootedAt));
    s.putSegs(2, 2, [
      { text: 'UPTIME ', style: 'd' }, { text: up, style: 'b' },
      { text: '   TASKS ', style: 'd' }, { text: String(m.tasks), style: 'b' },
      { text: '   RUNNING ', style: 'd' }, { text: String(m.running), style: 'b' },
      { text: '   SLEEPING ', style: 'd' }, { text: String(m.sleeping), style: 'b' },
      { text: '   REFRESH ', style: 'd' }, { text: rateLabel(RATES[this.rate]), style: 'b' },
    ]);

    // meters
    const meters: Array<[string, number, string]> = [
      ['CPU', m.cpu, `${m.cpu}%`],
      ['MEM', (m.usedK / MEM_TOTAL_K) * 100, `${m.usedK}K/${MEM_TOTAL_K}K`],
      ['DISK', (m.r + m.w) * 1.5, `R ${m.r}K W ${m.w}K`],
    ];
    meters.forEach(([label, pct, val], i) => {
      const y = 4 + i * 2;
      s.put(2, y, label, 'd');
      s.bar(7, y, 20, pct, 'n');
      s.put(29, y, val, 'b');
    });

    // history
    s.box(41, 3, 38, 7, 'd');
    borderTitle(s, 41, 3, 38, 'CPU HISTORY');
    s.put(41 + 38 - 12, 3, ' LAST 40S ', 'i');
    const slot = 36 / HIST_LEN;
    const pad = HIST_LEN - this.hist.length;
    this.hist.forEach((v, i) => {
      const h = (v / 100) * 4.6;
      if (h < 0.05) return;
      s.rect(42 + (pad + i) * slot + slot * 0.2, 9 - h, slot * 0.6, h, 'n', 'solid');
    });

    // process table
    s.box(1, 10, 78, 13, 'b', { glow: true });
    borderTitle(s, 1, 10, 78, 'PROCESSES');
    const cols = { pid: 3, cmd: 11, state: 28, cpu: 46, mem: 56, time: 62 };
    const mark = (k: SortKey) => (this.sort === k ? 'v' : ' ');
    s.put(cols.pid, 11, 'PID' + mark('pid'), 'd');
    s.put(cols.cmd, 11, 'COMMAND', 'd');
    s.put(cols.state, 11, 'STATE', 'd');
    s.put(cols.cpu - 4, 11, '%CPU' + mark('cpu'), 'd');
    s.put(cols.mem - 3, 11, 'MEM' + mark('mem'), 'd');
    s.put(cols.time, 11, 'TIME', 'd');
    if (this.rows.length > PAGE) {
      s.putRight(77, 11, `${this.top + 1}-${Math.min(this.rows.length, this.top + PAGE)} OF ${this.rows.length}`, 'd');
    }
    s.hline(2, 11.45, 76, 'd');
    for (let i = 0; i < PAGE; i++) {
      const r = this.rows[this.top + i];
      if (!r) break;
      const y = 12 + i;
      const sel = this.top + i === this.selIdx;
      const st = sel ? 'i' : r.state === 'run' ? 'b' : 'n';
      if (sel) s.fill(2, y, 76, 1, ' ', 'i');
      s.put(cols.pid, y, String(r.pid), st);
      s.put(cols.cmd, y, fit(r.name, 16), st);
      s.put(cols.state, y, r.state.toUpperCase(), st);
      s.put(cols.cpu - 5, y, rfit(r.cpu.toFixed(1), 5), st);
      s.put(cols.mem - 4, y, rfit(`${r.memK}K`, 4), st);
      s.put(cols.time, y, duration(r.cpuTime * 1000), st);
    }

    if (this.confirm) s.put(0, 23, `KILL PID ${this.confirm.pid} ${this.confirm.name}? (Y/N)`, 'b');
    else drawMsg(s, 23, this.msg);

    s.keyBar(24, [['UP/DN', 'SELECT'], ['K', 'KILL'], ['S', 'SORT'], ['+/-', 'RATE'], ['H', 'HELP'], ['ESC', 'QUIT']]);
  }
}
