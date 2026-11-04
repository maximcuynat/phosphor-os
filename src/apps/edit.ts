// [16] EDIT: text editor for files up to 64K.

import type { KeyEvent } from '../input';
import { getClip, setClip } from '../kernel/clipboard';
import { OsError } from '../kernel/errors';
import { FsError, NotReadyError, basename } from '../kernel/vfs';
import { COLS, rfit, type Screen } from '../render/screen';
import { drawMsg, num, type Msg } from './ui';
import type { App, Ctx } from './types';

const MAX_BYTES = 65536;
/** Visible text rows (rows 2..20). */
const PAGE = 19;
/** Text starts at column 7 and is 71 cells wide. */
const TX = 7;
const TW = 71;
const EVENTS_LOG = 'A:\\SYSTEM\\EVENTS.LOG';

/** Key bar with items sized to their text. */
function itemBar(s: Screen, y: number, items: Array<[string, string]>): void {
  let x = 0;
  for (const [k, label] of items) {
    x = s.put(x, y, k);
    x = s.put(x, y, ` ${label} `, 'k') + 1;
  }
}

type Mode = null | 'find' | 'goto' | 'quit';

export class EditApp implements App {
  id = 'edit';
  memK = 36;

  private path = '';
  private lines: string[] = [''];
  private trailingNL = false;
  private newFile = false;
  private dirty = false;
  private blocked: string | null = null;
  /** False until the file has been read once (an abort then leaves the program). */
  private ready = false;
  private cx = 0;
  private cy = 0;
  private want = 0;
  private top = 0;
  private left = 0;
  private insert = true;
  private msg: Msg | null = null;
  private mode: Mode = null;
  private text = '';
  private lastFind = '';
  /** Set when the quit prompt came from a TTY switch. */
  private pending: (() => void) | null = null;
  private nr: { drive: string; retry: () => void } | null = null;

  onEnter(ctx: Ctx, args: string[]): void {
    this.path = args[0] ?? '';
    this.load(ctx);
  }

  // ------------------------------------------------------------ files

  private say(ctx: Ctx, text: string, level: Msg['level'] = 'INFO'): void {
    this.msg = { text, level };
    if (level !== 'INFO') ctx.log(level, text);
  }

  /** Runs a file operation; offers ABORT, RETRY, FAIL on a drive that is not ready. */
  private attempt(ctx: Ctx, op: () => void): void {
    try {
      op();
    } catch (e) {
      if (e instanceof NotReadyError) {
        this.nr = { drive: e.drive, retry: () => this.attempt(ctx, op) };
        ctx.log('ERROR', e.message);
      } else if (e instanceof OsError) this.say(ctx, e.message, e.level);
      else throw e;
    }
  }

  private load(ctx: Ctx): void {
    this.attempt(ctx, () => {
      const n = ctx.vfs.get(this.path);
      this.ready = true;
      if (!n) {
        this.newFile = true;
        return;
      }
      if (n.type === 'dir') {
        this.blocked = `${basename(this.path)} IS A FOLDER.  NAME A FILE TO EDIT.`;
        return;
      }
      if (n.content === null) {
        this.blocked = `${basename(this.path)} IS A BINARY FILE.  OPEN IT WITH VIEW.`;
        return;
      }
      let t = ctx.vfs.read(this.path).replace(/\r\n/g, '\n');
      if (t.endsWith('\n')) {
        this.trailingNL = true;
        t = t.slice(0, -1);
      }
      this.lines = t.split('\n');
    });
    if (this.blocked) this.say(ctx, this.blocked, 'ERROR');
  }

  private bytes(): number {
    let n = this.lines.length - 1 + (this.trailingNL ? 1 : 0);
    for (const l of this.lines) n += l.length;
    return n;
  }

  private save(ctx: Ctx, after?: () => void): void {
    if (this.blocked) return;
    this.attempt(ctx, () => {
      if (this.path === EVENTS_LOG) throw new FsError('ACCESS DENIED: EVENTS.LOG IS MANAGED BY THE SYSTEM.');
      const content = this.lines.join('\n') + (this.trailingNL ? '\n' : '');
      ctx.vfs.write(this.path, content, ctx.user);
      this.dirty = false;
      this.newFile = false;
      const name = basename(this.path);
      this.say(ctx, `SAVED ${name}: ${num(content.length)} BYTES.`);
      ctx.log('INFO', `${name} SAVED`);
      after?.();
    });
  }

  // ------------------------------------------------------------ editing

  private line(): string {
    return this.lines[this.cy];
  }

  private clamp(): void {
    this.cy = Math.max(0, Math.min(this.lines.length - 1, this.cy));
    this.cx = Math.max(0, Math.min(this.line().length, this.cx));
  }

  private scroll(): void {
    this.clamp();
    if (this.cy < this.top) this.top = this.cy;
    if (this.cy >= this.top + PAGE) this.top = this.cy - PAGE + 1;
    if (this.cx < this.left) this.left = this.cx;
    if (this.cx >= this.left + TW) this.left = this.cx - TW + 1;
  }

  private moveTo(cy: number, cx: number): void {
    this.cy = cy;
    this.cx = cx;
    this.want = cx;
    this.clamp();
  }

  private full(ctx: Ctx, extra: number): boolean {
    if (this.bytes() + extra <= MAX_BYTES) return false;
    this.say(ctx, 'FILE IS FULL (MAX 64K).  SAVE IT, THEN DELETE SOME TEXT.', 'WARN');
    return true;
  }

  private insertText(ctx: Ctx, t: string): void {
    const parts = t.replace(/\r\n/g, '\n').split('\n');
    if (this.full(ctx, t.length)) return;
    const l = this.line();
    const before = l.slice(0, this.cx);
    const after = l.slice(this.cx);
    if (parts.length === 1) {
      this.lines[this.cy] = before + parts[0] + after;
      this.cx += parts[0].length;
    } else {
      const last = parts[parts.length - 1];
      this.lines.splice(this.cy, 1, before + parts[0], ...parts.slice(1, -1), last + after);
      this.cy += parts.length - 1;
      this.cx = last.length;
    }
    this.want = this.cx;
    this.dirty = true;
  }

  private cutLine(ctx: Ctx, cut: boolean): void {
    setClip(ctx.os.state, { kind: 'text', text: this.line() + '\n' });
    if (!cut) {
      this.say(ctx, 'LINE COPIED TO THE CLIPBOARD.');
      return;
    }
    if (this.lines.length === 1) this.lines[0] = '';
    else this.lines.splice(this.cy, 1);
    this.dirty = true;
    this.moveTo(this.cy, 0);
    this.say(ctx, 'LINE CUT TO THE CLIPBOARD.');
  }

  private findNext(ctx: Ctx): void {
    const t = this.lastFind.toLowerCase();
    const n = this.lines.length;
    for (let k = 0; k <= n; k++) {
      const i = (this.cy + k) % n;
      const p = this.lines[i].toLowerCase().indexOf(t, k === 0 ? this.cx + 1 : 0);
      if (p >= 0) {
        this.moveTo(i, p);
        this.msg = null;
        return;
      }
    }
    this.say(ctx, `NOT FOUND: ${this.lastFind}.  PRESS CTRL+F TO TRY ANOTHER WORD.`);
  }

  private finish(ctx: Ctx): void {
    const p = this.pending;
    this.pending = null;
    this.mode = null;
    if (p) p();
    else ctx.exit();
  }

  // ------------------------------------------------------------ keys

  onLeave(ctx: Ctx, proceed: () => void): boolean {
    if (!this.dirty) return false;
    void ctx;
    this.mode = 'quit';
    this.pending = proceed;
    return true;
  }

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (this.nr) {
      const nr = this.nr;
      if (e.combo === 'a') {
        this.nr = null;
        if (!this.ready) ctx.exit();
      } else if (e.combo === 'r') {
        this.nr = null;
        nr.retry();
      } else if (e.combo === 'f') {
        this.nr = null;
        this.say(ctx, `DRIVE ${nr.drive}: IS NOT READY.  THE OPERATION FAILED.`, 'ERROR');
      }
      return;
    }
    if (this.mode === 'quit') {
      this.quitKey(ctx, e);
      return;
    }
    if (this.mode) {
      this.promptKey(ctx, e);
      return;
    }
    if (this.blocked) {
      if (e.combo === 'escape') ctx.exit();
      return;
    }
    this.msg = null;
    const c = e.combo;
    switch (c) {
      case 'escape':
        if (this.dirty) this.mode = 'quit';
        else ctx.exit();
        return;
      case 'f1':
        if (!ctx.open('help', ['EDIT'])) this.say(ctx, ctx.os.lastError ?? 'CANNOT OPEN HELP.', 'ERROR');
        return;
      case 'ctrl+s':
        this.save(ctx);
        return;
      case 'ctrl+f':
        this.mode = 'find';
        this.text = this.lastFind;
        return;
      case 'f3':
        if (this.lastFind) this.findNext(ctx);
        return;
      case 'ctrl+g':
        this.mode = 'goto';
        this.text = '';
        return;
      case 'ctrl+x':
        this.cutLine(ctx, true);
        break;
      case 'ctrl+c':
        this.cutLine(ctx, false);
        return;
      case 'ctrl+v': {
        const clip = getClip(ctx.os.state);
        if (!clip) this.say(ctx, 'CLIPBOARD IS EMPTY.  USE CTRL+C OR CTRL+X FIRST.');
        else if (clip.kind === 'file') this.say(ctx, 'CLIPBOARD HOLDS A FILE, NOT TEXT.  PASTE IT IN FILES.', 'WARN');
        else this.insertText(ctx, clip.text);
        break;
      }
      case 'insert':
        this.insert = !this.insert;
        return;
      case 'arrowleft':
        if (this.cx > 0) this.moveTo(this.cy, this.cx - 1);
        else if (this.cy > 0) this.moveTo(this.cy - 1, this.lines[this.cy - 1].length);
        break;
      case 'arrowright':
        if (this.cx < this.line().length) this.moveTo(this.cy, this.cx + 1);
        else if (this.cy < this.lines.length - 1) this.moveTo(this.cy + 1, 0);
        break;
      case 'arrowup':
      case 'arrowdown':
      case 'pageup':
      case 'pagedown': {
        const d = c === 'arrowup' ? -1 : c === 'arrowdown' ? 1 : c === 'pageup' ? -PAGE : PAGE;
        this.cy += d;
        this.clamp();
        this.cx = Math.min(this.want, this.line().length);
        break;
      }
      case 'home':
        this.moveTo(this.cy, 0);
        break;
      case 'end':
        this.moveTo(this.cy, this.line().length);
        break;
      case 'ctrl+home':
        this.moveTo(0, 0);
        break;
      case 'ctrl+end':
        this.moveTo(this.lines.length - 1, this.lines[this.lines.length - 1].length);
        break;
      case 'enter': {
        if (this.full(ctx, 1)) return;
        const l = this.line();
        this.lines.splice(this.cy, 1, l.slice(0, this.cx), l.slice(this.cx));
        this.dirty = true;
        this.moveTo(this.cy + 1, 0);
        break;
      }
      case 'backspace':
        if (this.cx > 0) {
          const l = this.line();
          this.lines[this.cy] = l.slice(0, this.cx - 1) + l.slice(this.cx);
          this.moveTo(this.cy, this.cx - 1);
          this.dirty = true;
        } else if (this.cy > 0) {
          const prev = this.lines[this.cy - 1];
          this.lines.splice(this.cy - 1, 2, prev + this.line());
          this.moveTo(this.cy - 1, prev.length);
          this.dirty = true;
        }
        break;
      case 'delete':
        if (this.cx < this.line().length) {
          const l = this.line();
          this.lines[this.cy] = l.slice(0, this.cx) + l.slice(this.cx + 1);
          this.dirty = true;
        } else if (this.cy < this.lines.length - 1) {
          this.lines.splice(this.cy, 2, this.line() + this.lines[this.cy + 1]);
          this.dirty = true;
        }
        break;
      case 'tab':
        this.insertText(ctx, '  ');
        break;
      default:
        if (e.ch !== null && e.ch.length === 1 && !e.ctrl && !e.alt) this.typeChar(ctx, e.ch);
    }
    this.scroll();
  }

  private typeChar(ctx: Ctx, ch: string): void {
    const l = this.line();
    const over = !this.insert && this.cx < l.length;
    if (!over && this.full(ctx, 1)) return;
    this.lines[this.cy] = l.slice(0, this.cx) + ch + l.slice(this.cx + (over ? 1 : 0));
    this.moveTo(this.cy, this.cx + 1);
    this.dirty = true;
  }

  private quitKey(ctx: Ctx, e: KeyEvent): void {
    if (e.combo === 'y') {
      const p = this.pending;
      this.pending = null;
      this.mode = null;
      this.save(ctx, () => (p ? p() : ctx.exit()));
    } else if (e.combo === 'n') this.finish(ctx);
    else if (e.combo === 'escape') {
      this.mode = null;
      this.pending = null;
    }
  }

  private promptKey(ctx: Ctx, e: KeyEvent): void {
    const mode = this.mode;
    if (e.combo === 'escape') this.mode = null;
    else if (e.combo === 'backspace') this.text = this.text.slice(0, -1);
    else if (e.combo === 'enter') {
      this.mode = null;
      if (mode === 'find') {
        if (!this.text) return;
        this.lastFind = this.text;
        this.findNext(ctx);
      } else {
        const n = parseInt(this.text, 10);
        if (!Number.isFinite(n)) return;
        if (n > this.lines.length) this.say(ctx, `ONLY ${num(this.lines.length)} LINES.  WENT TO THE LAST ONE.`);
        this.moveTo(Math.max(0, n - 1), 0);
      }
      this.scroll();
    } else if (e.ch !== null && e.ch.length === 1 && this.text.length < 40) {
      if (mode === 'goto' && !/\d/.test(e.ch)) return;
      this.text += e.ch;
    }
  }

  // ------------------------------------------------------------ drawing

  render(s: Screen): void {
    this.scroll();
    s.titleBar(0, `EDIT  ${this.path}`, this.dirty ? '* MODIFIED' : this.newFile ? 'NEW FILE' : '');
    s.box(0, 1, COLS, 21, 'b', { glow: true });
    for (let i = 0; i < PAGE; i++) {
      const n = this.top + i;
      if (n >= this.lines.length) break;
      const y = 2 + i;
      s.put(1, y, rfit(String(n + 1), 4) + ' ', n === this.cy ? 'b' : 'd');
      s.put(TX, y, this.lines[n].slice(this.left, this.left + TW));
    }
    s.rect(6.43, 2, 0.15, PAGE, 'k');

    s.put(1, 22, `LN ${this.cy + 1}  COL ${this.cx + 1}   ${this.insert ? 'INS' : 'OVR'}`, 'd');
    s.putRight(COLS - 1, 22, `${num(this.lines.length)} LINES  ${num(this.bytes())} BYTES`, 'd');

    if (this.nr) s.put(0, 23, `NOT READY READING DRIVE ${this.nr.drive}:  ABORT, RETRY, FAIL?`, 'i');
    else if (this.mode === 'quit') s.put(0, 23, `SAVE CHANGES TO ${basename(this.path)}?  (Y/N/ESC)`, 'b');
    else if (this.mode) {
      const label = this.mode === 'find' ? 'FIND: ' : 'GO TO LINE: ';
      const x = s.putSegs(0, 23, [{ text: label, style: 'd' }, { text: this.text, style: 'b' }]);
      s.setCursor(x, 23);
    } else drawMsg(s, 23, this.msg);

    if (!this.mode && !this.nr && !this.blocked) s.setCursor(TX + this.cx - this.left, 2 + this.cy - this.top, this.insert ? 'block' : 'under');
    itemBar(s, 24, [
      ['F1', 'HELP'],
      ['^S', 'SAVE'],
      ['^F', 'FIND'],
      ['^G', 'GOTO LINE'],
      ['^X', 'CUT LINE'],
      ['INS', 'INS/OVR'],
      ['ESC', 'QUIT'],
    ]);
  }
}
