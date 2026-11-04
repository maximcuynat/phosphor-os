// The console of one TTY: scrollback, prompt, line editing, history, Tab,
// questions (Y/N, ABORT/RETRY/FAIL, passwords), foreground jobs, status bar.

import { MEM_TOTAL_K, VERSION } from '../config';
import type { KeyEvent } from '../input';
import { clipLabel } from '../kernel/clipboard';
import { dateStr, hhmm, stampDate, stampTime } from '../kernel/clock';
import { nextTask } from '../kernel/scheduler';
import { pushHistory } from '../kernel/sessions';
import type { OS } from '../os';
import { COLS, ROWS, type Screen, type Seg, type Style } from '../render/screen';
import type { Tty } from '../tty';
import { runBatch } from './batch';
import { commonPrefix, complete } from './complete';
import { execLine, type ExecOpts } from './exec';
import type { Ask, IO, Line } from './types';

const SCROLLBACK = 500;
const VIEW_ROWS = ROWS - 1; // last row is the status bar

/** Splits a styled line into rows of at most width cells. */
export function wrapSegs(line: Line, width = COLS): Line[] {
  const rows: Line[] = [];
  let row: Line = [];
  let len = 0;
  for (const seg of line) {
    let text = seg.text;
    while (text.length) {
      const room = width - len;
      const part = text.slice(0, room);
      row.push({ text: part, style: seg.style });
      len += part.length;
      text = text.slice(part.length);
      if (len >= width) {
        rows.push(row);
        row = [];
        len = 0;
      }
    }
  }
  if (row.length || !rows.length) rows.push(row);
  return rows;
}

export function expandPrompt(fmt: string, user: string, cwd: string): string {
  return fmt.replace(/\$(.)/g, (_, c: string) => {
    switch (c.toUpperCase()) {
      case 'U':
        return user;
      case 'P':
        return cwd;
      case 'G':
        return '>';
      case 'L':
        return '<';
      case 'T':
        return hhmm();
      case 'D':
        return dateStr();
      case 'N':
        return cwd[0];
      case '$':
        return '$';
      case '_':
        return ' ';
      default:
        return '';
    }
  });
}

export class Console {
  lines: Line[] = [];
  input = '';
  cur = 0;
  private hist: number | null = null;
  private histSaved = '';
  comp: { start: number; end: number; options: string[]; index: number } | null = null;
  pending: Ask | null = null;
  private askInput = '';
  fgPid: number | null = null;
  scroll = 0;
  pendingLaunch: { appId: string; args: string[] } | null = null;
  readonly io: IO;

  constructor(
    private os: OS,
    private tty: Tty,
  ) {
    const user = () => tty.session.user ?? 'SYSTEM';
    this.io = {
      print: (text = '', style?: Style) => {
        for (const l of text.split('\n')) this.push([{ text: l, style }]);
      },
      line: (segs: Seg[]) => this.push(segs),
      error: (msg: string) => {
        this.push([{ text: msg, style: 'i' }]);
        os.log('ERROR', msg, user());
      },
      warn: (msg: string) => {
        this.push([{ text: msg, style: 'b' }]);
        os.log('WARN', msg, user());
      },
      info: (msg: string) => this.push([{ text: msg, style: 'd' }]),
      stdin: null,
      captured: false,
    };
  }

  get busy(): boolean {
    return this.pending !== null || this.fgPid !== null;
  }

  push(l: Line): void {
    if (this.tty.detached) return;
    this.lines.push(l);
    if (this.lines.length > SCROLLBACK) this.lines.splice(0, this.lines.length - SCROLLBACK);
    this.scroll = 0;
  }

  reset(): void {
    this.lines = [];
    this.input = '';
    this.cur = 0;
    this.hist = null;
    this.comp = null;
    this.pending = null;
    this.fgPid = null;
    this.scroll = 0;
    this.pendingLaunch = null;
  }

  clear(): void {
    this.lines = [];
    this.scroll = 0;
  }

  prompt(): string {
    const s = this.tty.session;
    return expandPrompt(s.env.PROMPT ?? '$U@$P$G', s.user ?? '', s.cwd);
  }

  loginBanner(previous: string | null): void {
    this.io.print(`PHOSPHOR OS  VERSION ${VERSION}`, 'b');
    this.io.print(`(C) 1984 PHOSPHOR SYSTEMS.  ${MEM_TOTAL_K}K RAM  ${this.os.procs.freeK()}K FREE`, 'd');
    if (previous) this.io.info(`LAST LOGIN  ${stampDate(previous)} ${stampTime(previous)}`);
  }

  safeBanner(): void {
    this.io.print(`PHOSPHOR OS ${VERSION} STARTED IN SAFE MODE (F8).`);
    this.io.info('AUTOEXEC.BAT SKIPPED.  ONLY CON AND KBD DRIVERS LOADED.');
    this.io.info('NO LOGIN REQUIRED.  NETWORK AND JOBS DISABLED.');
    this.io.print('');
  }

  /** AUTOEXEC.BAT at login: no trace, output shown. */
  runSystemBatch(path: string): void {
    try {
      runBatch(this.os, this.tty, path, [], this.io, { silent: true });
    } catch (e) {
      this.io.error(e instanceof Error ? e.message : String(e));
    }
  }

  /** AT task on a detached TTY. */
  runDetached(cmd: string): void {
    execLine(this.os, this.tty, cmd, this.io, { depth: 1, batch: { path: 'AT', params: [], echo: false, silent: true } });
  }

  /** Runs a line as if typed (also used by RETRY). */
  execute(line: string, opts: ExecOpts = { interactive: true }): void {
    execLine(this.os, this.tty, line, this.io, opts);
    const l = this.pendingLaunch;
    this.pendingLaunch = null;
    if (l && this.os.mode === 'running' && this.tty.loggedIn) {
      const err = this.os.openApp(this.tty, l.appId, l.args);
      if (err) {
        this.io.error(err);
        if (err.startsWith('NOT ENOUGH MEMORY')) this.io.line([{ text: 'CLOSE A PROGRAM OR TYPE MEM FOR DETAILS.', style: 'b' }]);
      }
    }
  }

  ask(q: Ask): void {
    this.pending = q;
    this.askInput = '';
  }

  // ------------------------------------------------------------ keys

  onKey(e: KeyEvent): void {
    if (this.pending) return this.keyAsk(e);
    if (this.fgPid !== null) return this.keyFg(e);
    const c = e.combo;
    if (c !== 'tab') this.comp = null;
    switch (c) {
      case 'enter':
        return this.submit();
      case 'tab':
        return this.tab();
      case 'backspace':
        if (this.cur > 0) {
          this.input = this.input.slice(0, this.cur - 1) + this.input.slice(this.cur);
          this.cur--;
        }
        return;
      case 'delete':
        this.input = this.input.slice(0, this.cur) + this.input.slice(this.cur + 1);
        return;
      case 'arrowleft':
        this.cur = Math.max(0, this.cur - 1);
        return;
      case 'arrowright':
        this.cur = Math.min(this.input.length, this.cur + 1);
        return;
      case 'home':
        this.cur = 0;
        return;
      case 'end':
        this.cur = this.input.length;
        return;
      case 'arrowup':
        return this.history(-1);
      case 'arrowdown':
        return this.history(1);
      case 'escape':
        this.input = '';
        this.cur = 0;
        return;
      case 'pageup':
      case 'shift+pageup':
        this.scroll = Math.min(this.scroll + 10, Math.max(0, this.visualRows().length - VIEW_ROWS));
        return;
      case 'pagedown':
      case 'shift+pagedown':
        this.scroll = Math.max(0, this.scroll - 10);
        return;
      case 'shift+arrowup':
        this.scroll = Math.min(this.scroll + 1, Math.max(0, this.visualRows().length - VIEW_ROWS));
        return;
      case 'shift+arrowdown':
        this.scroll = Math.max(0, this.scroll - 1);
        return;
      case 'ctrl+c':
        this.push([{ text: `${this.prompt()} ${this.input}^C` }]);
        this.input = '';
        this.cur = 0;
        return;
      case 'ctrl+v': {
        const clip = this.os.state.clipboard;
        const text = clip ? (clip.kind === 'text' ? clip.text.split('\n')[0] : clip.path) : '';
        this.insert(text.toUpperCase());
        return;
      }
      case 'ctrl+l':
        this.clear();
        return;
    }
    if (e.ch && !e.ctrl && !e.alt) this.insert(e.ch);
  }

  private insert(text: string): void {
    if (!text) return;
    this.input = this.input.slice(0, this.cur) + text + this.input.slice(this.cur);
    this.cur += text.length;
    this.scroll = 0;
  }

  private history(dir: number): void {
    const h = this.tty.session.history;
    if (!h.length) return;
    if (this.hist === null) {
      if (dir > 0) return;
      this.histSaved = this.input;
      this.hist = h.length;
    }
    const next = this.hist + dir;
    if (next >= h.length) {
      this.hist = null;
      this.input = this.histSaved;
    } else {
      this.hist = Math.max(0, next);
      this.input = h[this.hist];
    }
    this.cur = this.input.length;
  }

  private tab(): void {
    if (this.comp && this.comp.options.length > 1) {
      const c = this.comp;
      c.index = (c.index + 1) % c.options.length;
      this.replaceWord(c, c.options[c.index]);
      return;
    }
    const r = complete(this.os, this.tty, this.input, this.cur);
    if (!r.options.length) return;
    if (r.options.length === 1) {
      this.replaceWord(r, r.options[0] + (r.options[0].endsWith('\\') ? '' : ' '));
      this.comp = null;
      return;
    }
    const prefix = commonPrefix(r.options);
    const c = { ...r, index: -1 };
    this.replaceWord(c, prefix);
    this.comp = c;
  }

  private replaceWord(c: { start: number; end: number }, text: string): void {
    this.input = this.input.slice(0, c.start) + text + this.input.slice(c.end);
    c.end = c.start + text.length;
    this.cur = c.end;
  }

  private submit(): void {
    const line = this.input;
    this.push([{ text: `${this.prompt()} ${line}` }]);
    this.input = '';
    this.cur = 0;
    this.hist = null;
    pushHistory(this.tty.session, line);
    if (line.trim()) this.execute(line, { interactive: true });
  }

  private keyAsk(e: KeyEvent): void {
    const q = this.pending!;
    if (q.line) {
      if (e.combo === 'enter') {
        this.pending = null;
        this.push([{ text: q.prompt + ' ', style: q.style }, { text: q.mask ? '*'.repeat(this.askInput.length) : this.askInput }]);
        q.onAnswer(this.askInput);
      } else if (e.combo === 'escape') {
        this.pending = null;
        this.push([{ text: q.prompt + ' ', style: q.style }, { text: '^C' }]);
        q.onCancel?.();
      } else if (e.combo === 'backspace') this.askInput = this.askInput.slice(0, -1);
      else if (e.ch) this.askInput += e.ch;
      return;
    }
    const k = e.combo === 'escape' ? 'ESC' : e.combo === 'enter' ? 'ENTER' : (e.ch ?? '').toUpperCase();
    if (!q.keys || q.keys.includes(k)) {
      this.pending = null;
      this.push([{ text: q.prompt, style: q.style }, { text: ' ' + (k.length === 1 ? k : '') }]);
      q.onAnswer(k);
    }
  }

  private keyFg(e: KeyEvent): void {
    const pid = this.fgPid!;
    const p = this.os.procs.get(pid);
    if (!p) {
      this.fgPid = null;
      return;
    }
    if (e.combo === 'ctrl+z') {
      this.fgPid = null;
      p.background = true;
      this.push([{ text: '^Z' }]);
    } else if (e.combo === 'ctrl+c') {
      const r = this.os.kill(pid, this.tty.user!);
      this.fgPid = null;
      this.push([{ text: '^C' }]);
      if (r.msg) this.io.info(r.msg);
    }
  }

  // ------------------------------------------------------------ render

  /** All rows of the console as they would be drawn, before the view window. */
  private visualRows(): Line[] {
    const rows: Line[] = [];
    for (const l of this.lines) rows.push(...wrapSegs(l));
    return rows;
  }

  render(s: Screen): void {
    const rows = this.visualRows();
    let cursor: { row: number; col: number } | null = null;
    let bubble: { row: number; col: number } | null = null;

    if (this.pending) {
      const q = this.pending;
      const live: Line = [{ text: q.prompt, style: q.style }, { text: ' ' }];
      if (q.line) live.push({ text: q.mask ? '*'.repeat(this.askInput.length) : this.askInput });
      const wrapped = wrapSegs(live);
      const len = live.reduce((n, x) => n + x.text.length, 0);
      rows.push(...wrapped);
      cursor = { row: rows.length - 1, col: len % COLS };
    } else if (this.fgPid !== null) {
      const j = this.os.jobs.get(this.fgPid);
      const p = this.os.procs.get(this.fgPid);
      if (j && p) rows.push([{ text: j.spec.status(p.progress ?? 0), style: 'd' }]);
    } else {
      const pr = `${this.prompt()} `;
      const full = pr + this.input;
      const wrapped = wrapSegs([{ text: full }]);
      rows.push(...wrapped);
      const pos = pr.length + this.cur;
      const startRow = rows.length - wrapped.length;
      cursor = { row: startRow + Math.floor(pos / COLS), col: pos % COLS };
      if (cursor.row >= rows.length) rows.push([]);
      if (this.comp && this.comp.options.length > 1) {
        rows.push([]);
        bubble = { row: rows.length - 1, col: (pr.length + this.comp.start) % COLS };
      }
    }

    const maxScroll = Math.max(0, rows.length - VIEW_ROWS);
    const scroll = Math.min(this.scroll, maxScroll);
    const first = Math.max(0, rows.length - VIEW_ROWS - scroll);
    for (let y = 0; y < VIEW_ROWS; y++) {
      const r = rows[first + y];
      if (r) s.putSegs(0, y, r);
    }
    if (cursor && scroll === 0) {
      const y = cursor.row - first;
      if (y >= 0 && y < VIEW_ROWS) s.setCursor(cursor.col, y);
    }
    if (bubble && this.comp && scroll === 0) this.renderBubble(s, bubble.row - first, bubble.col);
    if (scroll > 0) s.putRight(COLS, 0, ` SCROLLED ${scroll} LINES  PGDN OR SHIFT+DOWN TO RETURN `, 'i');
    this.renderStatus(s, ROWS - 1);
  }

  private renderBubble(s: Screen, y: number, col: number): void {
    const c = this.comp!;
    const items = [...c.options.slice(0, 8)];
    const width = items.reduce((n, o) => n + o.length + 2, 0) + 5;
    let x = Math.max(0, Math.min(col, COLS - width));
    s.overlays.push({ t: 'rect', x, y, w: width, h: 1, tone: 'bg' });
    s.box(x, y, width, 1, 'n', { single: true, glow: true });
    items.forEach((o, i) => {
      x = s.put(x, y, ` ${o} `, i === c.index ? 'i' : 'n');
    });
    if (c.options.length > 8) x = s.put(x, y, ` +${c.options.length - 8}`, 'd');
    s.put(x, y, ' TAB', 'd');
  }

  /** Bottom row: TTY indicators, then JOBS / AT / CLIP and the time. */
  renderStatus(s: Screen, y: number): void {
    if (this.os.safe) {
      s.put(0, y, ' SAFE MODE ', 'i');
      s.center(y, 'TYPE REBOOT TO RESTART NORMALLY', 'd');
      s.putRight(COLS, y, ' SAFE MODE ', 'i');
      return;
    }
    let x = 0;
    this.os.ttys.forEach((t, i) => {
      const active = i === this.os.active;
      const label = `${active ? 'ALT+' : ''}F${i + 1} ${t.loggedIn ? `TTY${i + 1} ${t.session.user}` : 'FREE'}`;
      const style: Style = active ? 'i' : t.loggedIn ? 'k' : 'd';
      x = s.put(x, y, ` ${label} `, style) + 1;
    });
    const right: Seg[] = [];
    const jobs = this.os.procs.jobs(this.tty.n).length;
    const task = nextTask(this.os.state);
    if (jobs) right.push({ text: 'JOBS ', style: 'd' }, { text: String(jobs), style: 'b' }, { text: '  ', style: 'd' });
    if (task) right.push({ text: 'AT ', style: 'd' }, { text: stampTime(task.at), style: 'b' }, { text: '  ', style: 'd' });
    if (!jobs && !task) right.push({ text: 'CLIP ', style: 'd' }, { text: clipLabel(this.os.state), style: 'b' }, { text: '  ', style: 'd' });
    right.push({ text: hhmm(), style: 'd' });
    const len = right.reduce((n, r) => n + r.text.length, 0);
    const rx = Math.max(x + 1, COLS - len);
    s.putSegs(rx, y, right);
  }
}
