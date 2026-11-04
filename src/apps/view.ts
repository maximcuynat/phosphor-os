// [15] VIEW: read-only pager with word search and go-to-line.

import type { KeyEvent } from '../input';
import { OsError } from '../kernel/errors';
import { NotReadyError, basename } from '../kernel/vfs';
import { COLS, type Screen } from '../render/screen';
import { drawMsg, num, type Msg } from './ui';
import type { App, Ctx } from './types';

/** Text rows inside the box (rows 2..20). */
const PAGE = 19;
/** Text columns inside the box (columns 2..75). */
const TW = 74;

interface Row {
  line: number;
  off: number;
  text: string;
}

interface Match {
  line: number;
  col: number;
}

/** Key bar with items sized to their text (the standard one is too narrow for PGUP/DN). */
function itemBar(s: Screen, y: number, items: Array<[string, string]>): void {
  let x = 0;
  for (const [k, label] of items) {
    x = s.put(x, y, k);
    x = s.put(x, y, ` ${label} `, 'k') + 1;
  }
}

export class ViewApp implements App {
  id = 'view';
  memK = 20;

  private path = '';
  private raw = '';
  private loaded = false;
  private lines: string[] = [];
  private rows: Row[] = [];
  private top = 0;
  private term = '';
  private matches: Match[] = [];
  private byLine = new Map<number, number[]>();
  private cur = 0;
  private prompt: { kind: 'find' | 'goto'; text: string } | null = null;
  private msg: Msg | null = null;
  private nr: { drive: string; retry: () => void } | null = null;

  onEnter(ctx: Ctx, args: string[]): void {
    this.path = args[0] ?? '';
    this.load(ctx);
  }

  // ------------------------------------------------------------ loading

  private say(ctx: Ctx, text: string, level: Msg['level'] = 'INFO'): void {
    this.msg = { text, level };
    if (level !== 'INFO') ctx.log(level, text);
  }

  private load(ctx: Ctx): void {
    try {
      this.setText(ctx.vfs.read(this.path));
      this.loaded = true;
    } catch (e) {
      if (e instanceof NotReadyError) {
        this.nr = { drive: e.drive, retry: () => this.load(ctx) };
        ctx.log('ERROR', e.message);
        return;
      }
      if (e instanceof OsError) {
        this.say(ctx, e.message, e.level);
        return;
      }
      throw e;
    }
  }

  private setText(t: string): void {
    this.raw = t;
    const lines = t.replace(/\r\n/g, '\n').replace(/\t/g, '  ').split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    this.lines = lines;
    this.rows = [];
    const lineRow: number[] = [];
    lines.forEach((text, i) => {
      lineRow.push(this.rows.length);
      if (!text) this.rows.push({ line: i, off: 0, text: '' });
      else for (let off = 0; off < text.length; off += TW) this.rows.push({ line: i, off, text: text.slice(off, off + TW) });
    });
    this.lineRow = lineRow;
    if (this.term) this.findAll();
    this.top = Math.min(this.top, this.maxTop());
  }

  private lineRow: number[] = [];

  private maxTop(): number {
    return Math.max(0, this.rows.length - PAGE);
  }

  // ------------------------------------------------------------ search

  private findAll(): void {
    const t = this.term.toLowerCase();
    this.matches = [];
    this.byLine = new Map();
    this.lines.forEach((l, i) => {
      const low = l.toLowerCase();
      let from = 0;
      for (;;) {
        const p = low.indexOf(t, from);
        if (p < 0) break;
        this.byLine.set(i, [...(this.byLine.get(i) ?? []), this.matches.length]);
        this.matches.push({ line: i, col: p });
        from = p + Math.max(1, t.length);
      }
    });
    this.cur = Math.min(this.cur, Math.max(0, this.matches.length - 1));
  }

  private rowOf(m: Match): number {
    return (this.lineRow[m.line] ?? 0) + Math.floor(m.col / TW);
  }

  private show(i: number): void {
    this.cur = i;
    const r = this.rowOf(this.matches[i]);
    if (r < this.top || r >= this.top + PAGE) this.top = Math.max(0, Math.min(this.maxTop(), r - 3));
  }

  private search(ctx: Ctx, text: string): void {
    this.term = text;
    if (!text) {
      this.matches = [];
      this.byLine = new Map();
      return;
    }
    this.findAll();
    if (!this.matches.length) {
      this.say(ctx, `NO MATCH FOR /${text}.  PRESS / TO TRY ANOTHER WORD.`);
      return;
    }
    const first = this.matches.findIndex((m) => this.rowOf(m) >= this.top);
    this.show(first < 0 ? 0 : first);
    this.msg = null;
  }

  // ------------------------------------------------------------ keys

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (this.nr) {
      const nr = this.nr;
      if (e.combo === 'a') ctx.exit();
      else if (e.combo === 'r') {
        this.nr = null;
        nr.retry();
      } else if (e.combo === 'f') {
        this.nr = null;
        this.say(ctx, `CANNOT READ ${basename(this.path)}: DRIVE ${nr.drive}: IS NOT READY.`, 'ERROR');
      }
      return;
    }
    if (this.prompt) {
      this.promptKey(ctx, e);
      return;
    }
    this.msg = null;
    switch (e.combo) {
      case 'escape':
        ctx.exit();
        return;
      case 'arrowup':
        this.top = Math.max(0, this.top - 1);
        return;
      case 'arrowdown':
        this.top = Math.min(this.maxTop(), this.top + 1);
        return;
      case 'pageup':
        this.top = Math.max(0, this.top - PAGE);
        return;
      case 'pagedown':
        this.top = Math.min(this.maxTop(), this.top + PAGE);
        return;
      case 'home':
        this.top = 0;
        return;
      case 'end':
        this.top = this.maxTop();
        return;
      case '/':
        this.prompt = { kind: 'find', text: this.term };
        return;
      case 'g':
        this.prompt = { kind: 'goto', text: '' };
        return;
      case 'n':
        if (!this.term) this.say(ctx, 'NOTHING TO FIND YET.  PRESS / AND TYPE A WORD.');
        else if (!this.matches.length) this.say(ctx, `NO MATCH FOR /${this.term}.  PRESS / TO TRY ANOTHER WORD.`);
        else this.show((this.cur + 1) % this.matches.length);
        return;
      case 'f1':
        if (!ctx.open('help', ['VIEW'])) this.say(ctx, ctx.os.lastError ?? 'CANNOT OPEN HELP.', 'ERROR');
        return;
      case 'f4': {
        const n = ctx.vfs.get(this.path);
        if (n && n.content === null) {
          this.say(ctx, `${basename(this.path)} IS A BINARY FILE.  IT CANNOT BE EDITED.`, 'WARN');
          return;
        }
        if (n && n.content !== null && n.content.length > 65536) {
          this.say(ctx, `${basename(this.path)} IS TOO LARGE TO EDIT (MAX 64K).`, 'WARN');
          return;
        }
        if (!ctx.open('edit', [this.path])) this.say(ctx, ctx.os.lastError ?? 'CANNOT OPEN EDIT.', 'ERROR');
      }
    }
  }

  private promptKey(ctx: Ctx, e: KeyEvent): void {
    const p = this.prompt!;
    if (e.combo === 'escape') this.prompt = null;
    else if (e.combo === 'backspace') p.text = p.text.slice(0, -1);
    else if (e.combo === 'enter') {
      this.prompt = null;
      if (p.kind === 'find') this.search(ctx, p.text.trim());
      else {
        const n = parseInt(p.text, 10);
        if (!Number.isFinite(n)) return;
        this.top = Math.max(0, Math.min(this.maxTop(), n - 1));
        if (n > this.rows.length) this.say(ctx, `ONLY ${num(this.rows.length)} LINES.  SHOWING THE END.`);
      }
    } else if (e.ch !== null && e.ch.length === 1 && p.text.length < 40) {
      if (p.kind === 'goto' && !/\d/.test(e.ch)) return;
      p.text += e.ch;
    }
  }

  // ------------------------------------------------------------ drawing

  render(s: Screen, ctx: Ctx): void {
    if (this.loaded && !this.nr) {
      try {
        const t = ctx.vfs.read(this.path);
        if (t !== this.raw) this.setText(t);
      } catch {
        /* file gone or drive out: keep what we have */
      }
    }
    s.titleBar(0, `VIEW  ${this.path}`, 'READ ONLY');
    s.box(0, 1, 78, 21, 'b', { glow: true });
    const total = this.rows.length;
    for (let i = 0; i < PAGE; i++) {
      const r = this.rows[this.top + i];
      if (!r) break;
      const y = 2 + i;
      s.put(2, y, r.text);
      for (const mi of this.byLine.get(r.line) ?? []) {
        const m = this.matches[mi];
        const a = Math.max(m.col, r.off);
        const b = Math.min(m.col + this.term.length, r.off + r.text.length);
        if (b > a) s.restyle(2 + a - r.off, y, b - a, mi === this.cur ? 'i' : 'k');
      }
    }
    // scroll bar
    const ty = 1.2;
    const th = 20.6;
    const bh = Math.max(0.6, th * Math.min(1, PAGE / Math.max(1, total)));
    const by = ty + (this.maxTop() ? (th - bh) * (this.top / this.maxTop()) : 0);
    s.rect(78.35, ty, 0.3, th, 'k');
    s.rect(78.2, by, 0.6, bh, 'n', 'solid', true);

    // status row
    if (this.prompt) {
      if (this.prompt.kind === 'find') {
        const x = s.putSegs(0, 22, [{ text: 'FIND ', style: 'd' }, { text: `/${this.prompt.text}`, style: 'b' }]);
        s.setCursor(x, 22);
      } else {
        const x = s.putSegs(0, 22, [{ text: 'GO TO LINE ', style: 'd' }, { text: this.prompt.text, style: 'b' }]);
        s.setCursor(x, 22);
      }
    } else if (this.term && this.matches.length) {
      s.putSegs(0, 22, [
        { text: 'FIND ', style: 'd' },
        { text: `/${this.term}`, style: 'b' },
        { text: '   MATCH ', style: 'd' },
        { text: String(this.cur + 1), style: 'b' },
        { text: ' OF ', style: 'd' },
        { text: String(this.matches.length), style: 'b' },
      ]);
    }
    const a = total ? this.top + 1 : 0;
    const b = Math.min(total, this.top + PAGE);
    const pct = total ? Math.round((b / total) * 100) : 100;
    s.putRight(COLS - 1, 22, `LINES ${a}-${b} OF ${total}   ${pct}%`, 'd');

    if (this.nr) s.put(0, 23, `NOT READY READING DRIVE ${this.nr.drive}:  ABORT, RETRY, FAIL?`, 'i');
    else drawMsg(s, 23, this.msg);
    itemBar(s, 24, [
      ['UP/DN', 'LINE'],
      ['PGUP/DN', 'PAGE'],
      ['/', 'FIND'],
      ['N', 'NEXT'],
      ['G', 'GO TO'],
      ['F4', 'EDIT'],
      ['ESC', 'QUIT'],
    ]);
  }
}
