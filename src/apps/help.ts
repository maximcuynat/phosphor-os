// [12] HELP: the manual. Index on the left, one topic on the right.

import type { KeyEvent } from '../input';
import { COLS, type Screen, type Seg } from '../render/screen';
import { findTopic, HELP_TOPICS, topicText, type HelpTopic } from '../data/help';
import { drawMsg, type Msg } from './ui';
import type { App, Ctx } from './types';

const IDX_W = 20;
const BOX_X = IDX_W + 1;
const TEXT_X = BOX_X + 2;
const TEXT_W = COLS - 1 - TEXT_X - 1;
const TOP_Y = 2;
const ROWS_VIS = 20;
const LIST_ROWS = 19;

interface Line {
  segs: Seg[];
}
interface LinkPos {
  idx: number;
  line: number;
  x: number;
  len: number;
}
interface Page {
  lines: Line[];
  links: LinkPos[];
}

function wrapWords(text: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if (cur && (cur + ' ' + w).length > width) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

export function buildPage(t: HelpTopic): Page {
  const lines: Line[] = [];
  const links: LinkPos[] = [];
  const add = (text: string, style: Seg['style'] = 'n') => lines.push({ segs: [{ text, style }] });
  add(t.title, 'b');
  add(t.summary, 'd');
  add('');
  if (t.syntax.length) {
    add('SYNTAX', 'b');
    for (const l of t.syntax) add('  ' + l);
  } else if (t.body) {
    for (const l of t.body) add(l, l && !l.startsWith(' ') ? 'b' : 'n');
  }
  if (t.args.length) {
    add('');
    add('ARGUMENTS', 'b');
    const nw = Math.min(14, Math.max(...t.args.map((a) => a.name.length)) + 2);
    for (const a of t.args) {
      const d = wrapWords(a.desc, TEXT_W - 2 - nw);
      lines.push({ segs: [{ text: '  ' }, { text: a.name.padEnd(nw), style: 'b' }, { text: d[0] }] });
      for (const more of d.slice(1)) add(' '.repeat(2 + nw) + more);
    }
  }
  if (t.syntax.length && t.body) {
    add('');
    add('KEYS', 'b');
    for (const l of t.body) add('  ' + l);
  }
  if (t.examples.length) {
    add('');
    add('EXAMPLES', 'b');
    for (const e of t.examples) {
      add('  ' + e.cmd);
      for (const d of wrapWords(e.desc, TEXT_W - 4)) add('    ' + d, 'd');
    }
  }
  if (t.seeAlso.length) {
    add('');
    add('SEE ALSO', 'b');
    let segs: Seg[] = [{ text: '  ' }];
    let x = 2;
    t.seeAlso.forEach((name, idx) => {
      if (x + name.length > TEXT_W && x > 2) {
        lines.push({ segs });
        segs = [{ text: '  ' }];
        x = 2;
      }
      links.push({ idx, line: lines.length, x, len: name.length });
      segs.push({ text: name, style: 'u' }, { text: '  ' });
      x += name.length + 2;
    });
    lines.push({ segs });
  }
  return { lines, links };
}

export class HelpApp implements App {
  id = 'help';
  memK = 30;
  private cur = 0;
  private scroll = 0;
  private focus = -1;
  private idxScroll = 0;
  private msg: Msg | null = null;
  private search: string | null = null;

  onEnter(_ctx: Ctx, args: string[]): void {
    const want = args.join(' ').trim();
    if (!want) return;
    const t = findTopic(want);
    if (t) this.go(HELP_TOPICS.indexOf(t));
    else this.msg = { text: `NO HELP FOR ${want.toUpperCase()}.  PICK A TOPIC IN THE INDEX.`, level: 'INFO' };
  }

  private go(i: number): void {
    this.cur = Math.max(0, Math.min(HELP_TOPICS.length - 1, i));
    this.scroll = 0;
    this.focus = -1;
    if (this.cur < this.idxScroll) this.idxScroll = this.cur;
    if (this.cur >= this.idxScroll + LIST_ROWS) this.idxScroll = this.cur - LIST_ROWS + 1;
  }

  private page(): Page {
    return buildPage(HELP_TOPICS[this.cur]);
  }

  private clampScroll(p: Page): void {
    this.scroll = Math.max(0, Math.min(Math.max(0, p.lines.length - ROWS_VIS), this.scroll));
  }

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (this.search !== null) {
      this.searchKey(e);
      return;
    }
    this.msg = null;
    const p = this.page();
    switch (e.combo) {
      case 'escape':
        ctx.exit();
        return;
      case 'arrowup':
        this.go(this.cur - 1);
        return;
      case 'arrowdown':
        this.go(this.cur + 1);
        return;
      case 'pageup':
        this.scroll -= ROWS_VIS - 2;
        this.clampScroll(p);
        return;
      case 'pagedown':
        this.scroll += ROWS_VIS - 2;
        this.clampScroll(p);
        return;
      case 'tab': {
        if (!p.links.length) return;
        this.focus = (this.focus + 1) % p.links.length;
        const ln = p.links[this.focus].line;
        if (ln < this.scroll) this.scroll = ln;
        if (ln >= this.scroll + ROWS_VIS) this.scroll = ln - ROWS_VIS + 1;
        return;
      }
      case 'enter': {
        if (this.focus < 0) return;
        const target = findTopic(HELP_TOPICS[this.cur].seeAlso[p.links[this.focus].idx]);
        if (target) this.go(HELP_TOPICS.indexOf(target));
        return;
      }
      case '/':
        this.search = '';
        return;
    }
  }

  private searchKey(e: KeyEvent): void {
    if (e.combo === 'escape') {
      this.search = null;
      return;
    }
    if (e.combo === 'backspace') {
      this.search = (this.search ?? '').slice(0, -1);
      return;
    }
    if (e.combo === 'enter') {
      const q = (this.search ?? '').trim().toUpperCase();
      this.search = null;
      if (!q) return;
      const hit = HELP_TOPICS.findIndex((t) => t.title.includes(q) || topicText(t).includes(q));
      if (hit < 0) this.msg = { text: `NOT FOUND: ${q}.`, level: 'INFO' };
      else this.go(hit);
      return;
    }
    if (e.ch && (this.search ?? '').length < 40) this.search += e.ch;
  }

  render(s: Screen): void {
    const n = HELP_TOPICS.length;
    s.titleBar(0, 'HELP  PHOSPHOR OS MANUAL', `TOPIC ${this.cur + 1} OF ${n}`);

    // index
    s.box(0, 1, IDX_W, 22, 'd');
    s.put(2, 2, 'INDEX', 'd');
    for (let r = 0; r < LIST_ROWS; r++) {
      const i = this.idxScroll + r;
      if (i >= n) break;
      const name = HELP_TOPICS[i].title;
      const on = i === this.cur;
      const label = (' ' + name).slice(0, IDX_W - 2).padEnd(IDX_W - 2);
      s.put(1, 3 + r, label, on ? 'i' : i < 2 ? 'b' : 'n');
    }

    // topic
    s.box(BOX_X, 1, COLS - BOX_X, 22, 'b', { glow: true });
    const p = this.page();
    this.clampScroll(p);
    for (let r = 0; r < ROWS_VIS; r++) {
      const ln = p.lines[this.scroll + r];
      if (!ln) break;
      const y = TOP_Y + r;
      s.putSegs(TEXT_X, y, ln.segs);
    }
    // links
    p.links.forEach((l, i) => {
      const y = TOP_Y + l.line - this.scroll;
      if (y < TOP_Y || y >= TOP_Y + ROWS_VIS) return;
      s.restyle(TEXT_X + l.x, y, l.len, i === this.focus ? 'k' : 'u');
    });
    const hasMore = p.lines.length > ROWS_VIS;
    if (hasMore && this.scroll > 0) s.put(COLS - 4, 1, ' ^ ', 'd');
    if (hasMore && this.scroll + ROWS_VIS < p.lines.length) s.put(COLS - 4, 22, ' v ', 'd');

    if (this.search !== null) {
      const label = 'SEARCH: ';
      s.put(0, 23, label + this.search, 'b');
      s.setCursor(label.length + this.search.length, 23, 'block');
    } else drawMsg(s, 23, this.msg);

    s.keyBar(24, [
      ['UP/DN', 'TOPIC'],
      ['ENTER', 'OPEN'],
      ['TAB', 'LINKS'],
      ['/', 'SEARCH'],
      ['PGUP/DN', 'SCROLL'],
      ['ESC', 'QUIT'],
    ]);
  }
}
