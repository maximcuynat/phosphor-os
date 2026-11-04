// LOG: viewer for EVENTS.LOG with filter, search and export (board [19]).

import type { KeyEvent } from '../input';
import { dateStr } from '../kernel/clock';
import { formatLogLine } from '../kernel/log';
import type { Level, LogEntry } from '../kernel/types';
import { fit, type Screen, type Style } from '../render/screen';
import type { App, Ctx } from './types';
import { drawMsg, type Msg } from './ui';

type Filter = 'ALL' | Level;
const FILTERS: Filter[] = ['ALL', 'INFO', 'WARN', 'ERROR'];
const PAGE = 18;
const EXPORT_PATH = 'C:\\TEMP\\EVENTS.TXT';

export class LogApp implements App {
  id = 'log';
  memK = 16;

  private filter: Filter = 'ALL';
  private query = '';
  private sel = Number.MAX_SAFE_INTEGER;
  private follow = true;
  private top = 0;
  private searching: string | null = null;
  private msg: Msg | null = null;

  onEnter(): void {}

  private visible(ctx: Ctx): LogEntry[] {
    const q = this.query.toUpperCase();
    return ctx.os.state.log.filter((e) => (this.filter === 'ALL' || e.level === this.filter) && (!q || e.msg.toUpperCase().includes(q)));
  }

  /** Clamps the selection and the scroll window (live: the log can grow while open). */
  private normalize(n: number): void {
    if (this.follow) this.sel = n - 1;
    this.sel = Math.max(0, Math.min(n - 1, this.sel));
    if (this.sel < this.top) this.top = this.sel;
    if (this.sel >= this.top + PAGE) this.top = this.sel - PAGE + 1;
    this.top = Math.max(0, Math.min(this.top, Math.max(0, n - PAGE)));
  }

  private move(ctx: Ctx, to: number): void {
    const n = this.visible(ctx).length;
    this.normalize(n);
    this.sel = Math.max(0, Math.min(n - 1, to));
    this.follow = this.sel >= n - 1;
  }

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (this.searching !== null) {
      if (e.combo === 'enter') {
        this.query = this.searching.trim();
        this.searching = null;
        this.follow = true;
        this.msg = this.query ? { text: `SEARCH: ${this.query}.  PRESS / AND ENTER ON AN EMPTY LINE TO CLEAR.`, level: 'INFO' } : { text: 'SEARCH CLEARED.', level: 'INFO' };
      } else if (e.combo === 'escape') this.searching = null;
      else if (e.combo === 'backspace') this.searching = this.searching.slice(0, -1);
      else if (e.ch && e.ch.length === 1 && this.searching.length < 40) this.searching += e.ch;
      return;
    }
    this.msg = null;
    const n = this.visible(ctx).length;
    switch (e.combo) {
      case 'escape':
        ctx.exit();
        return;
      case 'arrowup':
        this.move(ctx, this.sel - 1);
        return;
      case 'arrowdown':
        this.move(ctx, this.sel + 1);
        return;
      case 'pageup':
        this.move(ctx, this.sel - PAGE);
        return;
      case 'pagedown':
        this.move(ctx, this.sel + PAGE);
        return;
      case 'home':
        this.move(ctx, 0);
        return;
      case 'end':
        this.move(ctx, n - 1);
        this.follow = true;
        return;
      case 'f':
        this.filter = FILTERS[(FILTERS.indexOf(this.filter) + 1) % FILTERS.length];
        this.follow = true;
        return;
      case '/':
        this.searching = this.query;
        return;
      case 'e':
        this.export(ctx);
        return;
      case 'h':
      case 'f1':
        if (!ctx.open('help', ['LOG'])) this.msg = { text: ctx.os.lastError ?? 'HELP IS NOT AVAILABLE.  TRY AGAIN LATER.', level: 'ERROR' };
        return;
    }
  }

  private export(ctx: Ctx): void {
    const list = this.visible(ctx);
    if (!list.length) {
      const text = 'NOTHING TO EXPORT.  PRESS F OR / TO WIDEN THE FILTER.';
      this.msg = { text, level: 'WARN' };
      ctx.log('WARN', 'EXPORT: NO ENTRIES TO WRITE');
      return;
    }
    try {
      ctx.vfs.write(EXPORT_PATH, list.map(formatLogLine).join('\n') + '\n', ctx.user, { op: 'EXPORT' });
      this.msg = { text: `EXPORTED ${list.length} ENTRIES TO ${EXPORT_PATH}`, level: 'INFO' };
    } catch (err) {
      const text = err instanceof Error ? err.message : 'EXPORT FAILED.  CHECK C:\\TEMP AND TRY AGAIN.';
      this.msg = { text, level: 'ERROR' };
      ctx.log('ERROR', text.replace(/\.\s.*$/, ''));
    }
  }

  render(s: Screen, ctx: Ctx): void {
    const all = ctx.os.state.log;
    const list = this.visible(ctx);
    this.normalize(list.length);
    s.titleBar(0, 'LOG  A:\\SYSTEM\\EVENTS.LOG', `${list.length} OF ${all.length} ENTRIES`);

    s.put(1, 1, 'FILTER', 'd');
    let x = 8;
    for (const f of FILTERS) {
      const cur = f === this.filter;
      s.put(x, 1, ` ${f} `, cur ? 'i' : 'd');
      x += f.length + 3;
    }
    s.putRight(78, 1, `TODAY ${dateStr()}`, 'd');

    s.box(1, 2, 78, 21, 'b', { glow: true });
    s.put(3, 3, 'TIME', 'd');
    s.put(13, 3, 'LEVEL', 'd');
    s.put(20, 3, 'USER', 'd');
    s.put(29, 3, 'MESSAGE', 'd');
    s.hline(2, 3.45, 76, 'd');
    if (!list.length) s.center(12, 'NO ENTRIES MATCH.  PRESS F OR / TO CHANGE THE FILTER.', 'd');
    for (let i = 0; i < PAGE; i++) {
      const e = list[this.top + i];
      if (!e) break;
      const y = 4 + i;
      const sel = this.top + i === this.sel;
      const base: Style = sel ? 'i' : e.level === 'INFO' ? 'n' : 'b';
      if (sel) s.fill(2, y, 76, 1, ' ', 'i');
      s.put(3, y, e.t, base);
      s.put(13, y, fit(e.level, 5), e.level === 'ERROR' ? (sel ? 'ib' : 'i') : base);
      s.put(20, y, fit(e.user, 8), base);
      s.put(29, y, e.msg.slice(0, 48), base);
    }

    if (this.searching !== null) {
      s.put(0, 23, `SEARCH: ${this.searching}`, 'b');
      s.setCursor(8 + this.searching.length, 23);
    } else drawMsg(s, 23, this.msg);

    s.keyBar(24, [['UP/DN', 'SCROLL'], ['F', 'FILTER'], ['/', 'SEARCH'], ['END', 'LATEST'], ['E', 'EXPORT'], ['ESC', 'QUIT']]);
  }
}
