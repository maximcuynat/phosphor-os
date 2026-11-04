// [20] DIAL: modem call to the simulated Green Room BBS.

import { duration } from '../kernel/clock';
import { OsError } from '../kernel/errors';
import type { KeyEvent } from '../input';
import { answers, BBS, BULLETINS, CHAT_GREETING, CHAT_REPLIES, DOWNLOAD, FILES, FILE_COUNT, MESSAGES, type BbsItem } from '../data/bbs';
import { type Screen, type Style } from '../render/screen';
import { drawMsg, type Msg } from './ui';
import type { App, Ctx } from './types';

const DIAL_TEXT = 'DIALING . . . . . . RING . . RING';
const BOX_Y = 5;
const BOX_H = 18;
const PROMPT_Y = 21;
const DL_MS = 3000;
const BLOCK = 128;

type Phase = 'dialing' | 'busy' | 'online' | 'bye';
type Screen_ = 'menu' | 'list' | 'read' | 'files' | 'chat' | 'dl';

const MENU: Array<[string, string, string]> = [
  ['M', 'MESSAGES', '3 NEW'],
  ['F', 'FILE LIBRARY', String(FILE_COUNT)],
  ['C', 'CHAT WITH SYSOP', ''],
  ['B', 'BULLETINS', '2 NEW'],
  ['D', 'DOWNLOAD (XMODEM)', ''],
  ['G', 'GOODBYE', ''],
];

export class DialApp implements App {
  id = 'dial';
  memK = 22;
  private number = '';
  private phase: Phase = 'dialing';
  private ms = 0;
  private onlineMs = 0;
  private connected = false;
  private scr: Screen_ = 'menu';
  private list: 'messages' | 'bulletins' = 'messages';
  private sel = 0;
  private chat: Array<{ text: string; style: Style }> = [];
  private chatInput = '';
  private replies = 0;
  private dlMs = 0;
  private dlState: 'run' | 'done' | 'fail' = 'run';
  private dlMsg: Msg | null = null;
  private byeMs = 0;
  private byeCarrier = false;
  private msg: Msg | null = null;

  onEnter(ctx: Ctx, args: string[]): void {
    this.userName = ctx.user?.name ?? 'GUEST';
    this.number = (args[0] ?? '').toUpperCase();
    this.startDial();
  }

  private startDial(): void {
    this.phase = 'dialing';
    this.ms = 0;
    this.msg = null;
  }

  private get items(): BbsItem[] {
    return this.list === 'messages' ? MESSAGES : BULLETINS;
  }

  private connect(ctx: Ctx): void {
    this.phase = 'online';
    this.scr = 'menu';
    this.onlineMs = 0;
    this.connected = true;
    ctx.os.online = true;
    ctx.log('INFO', 'COM1 CONNECT 2400');
  }

  private hangUp(ctx: Ctx): void {
    if (this.connected) {
      this.connected = false;
      ctx.os.online = false;
      ctx.log('INFO', 'COM1 NO CARRIER');
    }
    ctx.tty.console.io.info('NO CARRIER');
    ctx.exit();
  }

  onExit(ctx: Ctx): void {
    if (this.connected) {
      this.connected = false;
      ctx.os.online = false;
    }
  }

  onTick(ctx: Ctx, dt: number): void {
    if (this.phase === 'dialing') {
      this.ms += dt;
      if (this.ms >= BBS.dialMs) {
        if (answers(this.number)) this.connect(ctx);
        else {
          this.phase = 'busy';
          const text = 'BUSY.  NO CARRIER.  R TO REDIAL, ESC TO CANCEL.';
          this.msg = { text, level: 'ERROR' };
          ctx.log('ERROR', `DIAL ${this.number}: BUSY, NO CARRIER`);
        }
      }
      return;
    }
    if (this.phase === 'online') {
      if (!ctx.os.online) {
        // hung up from another console
        this.connected = false;
        ctx.tty.console.io.info('NO CARRIER');
        ctx.exit();
        return;
      }
      this.onlineMs += dt;
      if (this.scr === 'dl' && this.dlState === 'run') this.tickDownload(ctx, dt);
    }
    if (this.phase === 'bye') {
      this.byeMs += dt;
      if (this.byeMs >= 1200 && !this.byeCarrier) {
        this.byeCarrier = true;
        if (this.connected) {
          this.connected = false;
          ctx.os.online = false;
          ctx.log('INFO', 'COM1 NO CARRIER');
        }
      }
      if (this.byeMs >= 2000) {
        ctx.tty.console.io.info('NO CARRIER');
        ctx.exit();
      }
    }
  }

  private tickDownload(ctx: Ctx, dt: number): void {
    this.dlMs += dt;
    if (this.dlMs < DL_MS) return;
    try {
      ctx.vfs.write(DOWNLOAD.dest, DOWNLOAD.content, ctx.user, { op: 'DOWNLOAD' });
      this.dlState = 'done';
      this.dlMsg = { text: `${DOWNLOAD.name} SAVED TO C:\\TEMP.  ESC FOR THE MAIN MENU.`, level: 'INFO' };
      ctx.log('INFO', `${DOWNLOAD.name} DOWNLOADED FROM ${BBS.number}`);
    } catch (e) {
      const text = e instanceof OsError ? e.message : 'DOWNLOAD FAILED.  TRY AGAIN.';
      this.dlState = 'fail';
      this.dlMsg = { text, level: 'ERROR' };
      ctx.log('ERROR', text.replace(/\.\s.*$/, ''));
    }
  }

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (this.phase === 'dialing') {
      if (e.combo === 'escape') ctx.exit();
      return;
    }
    if (this.phase === 'busy') {
      if (e.combo === 'escape') ctx.exit();
      else if (e.combo === 'r') this.startDial();
      return;
    }
    if (this.phase === 'bye') return;
    // online
    if (e.combo === 'alt+h') {
      this.hangUp(ctx);
      return;
    }
    if (e.combo === 'escape') {
      if (this.scr === 'menu') this.hangUp(ctx);
      else if (this.scr === 'read') this.scr = 'list';
      else this.scr = 'menu';
      return;
    }
    switch (this.scr) {
      case 'menu':
        return this.menuKey(ctx, e);
      case 'list':
        if (e.combo === 'arrowup') this.sel = Math.max(0, this.sel - 1);
        else if (e.combo === 'arrowdown') this.sel = Math.min(this.items.length - 1, this.sel + 1);
        else if (e.combo === 'enter') this.scr = 'read';
        return;
      case 'chat':
        if (e.combo === 'enter') this.chatSend();
        else if (e.combo === 'backspace') this.chatInput = this.chatInput.slice(0, -1);
        else if (e.ch && this.chatInput.length < 50) this.chatInput += e.ch;
        return;
    }
  }

  private menuKey(ctx: Ctx, e: KeyEvent): void {
    switch (e.ch) {
      case 'M':
      case 'B':
        this.list = e.ch === 'M' ? 'messages' : 'bulletins';
        this.sel = 0;
        this.scr = 'list';
        break;
      case 'F':
        this.scr = 'files';
        break;
      case 'C':
        this.scr = 'chat';
        this.chat = [{ text: CHAT_GREETING, style: 'd' }];
        this.chatInput = '';
        break;
      case 'D':
        this.scr = 'dl';
        this.dlMs = 0;
        this.dlState = 'run';
        this.dlMsg = null;
        break;
      case 'G':
        this.phase = 'bye';
        this.byeMs = 0;
        this.byeCarrier = false;
        break;
    }
  }

  private chatSend(): void {
    const text = this.chatInput.trim();
    if (!text) return;
    this.chat.push({ text: `> ${text}`, style: 'n' });
    this.chat.push({ text: `NIGHTOWL: ${CHAT_REPLIES[this.replies++ % CHAT_REPLIES.length]}`, style: 'b' });
    this.chatInput = '';
  }

  private counters(): { tx: number; rx: number } {
    const extra = this.scr === 'dl' ? Math.min(1, this.dlMs / DL_MS) * (DOWNLOAD.content.length / 1024) : 0;
    const done = this.dlState === 'done' ? DOWNLOAD.content.length / 1024 : 0;
    return {
      tx: 2 + Math.floor(this.onlineMs / 15000),
      rx: 14 + Math.floor(this.onlineMs / 3000) + Math.floor(this.scr === 'dl' && this.dlState === 'run' ? extra : done),
    };
  }

  render(s: Screen, ctx: Ctx): void {
    const prompt = ctx.tty.console.prompt();
    s.put(0, 0, `${prompt} DIAL ${this.number}`);
    s.put(0, 1, `ATDT ${this.number}`, 'd');
    const shown = this.phase === 'dialing' ? Math.floor((this.ms / BBS.dialMs) * DIAL_TEXT.length) : DIAL_TEXT.length;
    s.put(0, 2, DIAL_TEXT.slice(0, shown), 'd');

    if (this.phase === 'dialing') {
      s.keyBar(24, [['ESC', 'CANCEL']]);
      return;
    }
    if (this.phase === 'busy') {
      drawMsg(s, 4, this.msg);
      s.keyBar(24, [
        ['R', 'REDIAL'],
        ['ESC', 'CANCEL'],
      ]);
      return;
    }
    s.put(0, 3, 'CONNECT 2400', 'b');
    this.renderBoard(s);

    // status bar
    const { tx, rx } = this.counters();
    s.fill(0, 24, 80, 1, ' ', 'n');
    s.put(0, 24, this.phase === 'bye' && this.byeCarrier ? ' OFFLINE ' : ' ONLINE ', 'i');
    s.put(10, 24, 'COM1  2400 BAUD  8N1', 'd');
    s.put(32, 24, duration(this.onlineMs), 'd');
    s.put(43, 24, `TX ${tx}K  RX ${rx}K`, 'd');
    s.fill(66, 24, 14, 1, ' ', 'k');
    s.put(67, 24, 'ALT+H HANG UP', 'k');
  }

  private renderBoard(s: Screen): void {
    s.box(0, BOX_Y, 80, BOX_H, 'b', { glow: true });
    s.fill(1, 6, 78, 1, ' ', 'i');
    s.put(2, 6, BBS.name, 'i');
    s.putRight(77, 6, BBS.info, 'i');
    let label = 'MAIN MENU > ';
    let input = '';

    if (this.phase === 'bye') {
      s.center(11, 'GOODBYE.  THANKS FOR CALLING THE GREEN ROOM.', 'b', 1, 78);
      s.center(13, this.byeCarrier ? 'NO CARRIER' : 'CLOSING THE LINE . . .', this.byeCarrier ? 'b' : 'd', 1, 78);
      return;
    }

    if (this.scr === 'menu') {
      s.center(8, `WELCOME BACK, ${this.userName}.  LAST CALL ${BBS.lastCall}.  3 NEW MESSAGES.`, 'd', 1, 78);
      MENU.forEach(([k, name, extra], i) => {
        // one column, like board [20]
        const x = 12;
        const y = 10 + i;
        s.put(x, y, `[${k}]`, 'b');
        s.put(x + 5, y, name);
        if (extra) s.put(x + 30, y, extra, 'd');
      });
    } else if (this.scr === 'list') {
      label = this.list === 'messages' ? 'MESSAGES > ' : 'BULLETINS > ';
      s.put(3, 8, this.list === 'messages' ? 'MESSAGES' : 'BULLETINS', 'b');
      this.items.forEach((m, i) => {
        const line = ` ${i + 1}  ${m.date}  ${m.from.padEnd(9)}${m.subject}`;
        s.put(3, 10 + i, line.padEnd(60), i === this.sel ? 'i' : 'n');
      });
      s.put(3, 19, 'UP/DN SELECT   ENTER READ   ESC MAIN MENU', 'd');
    } else if (this.scr === 'read') {
      const m = this.items[this.sel];
      label = 'READ > ';
      s.put(3, 8, `FROM ${m.from}   ${m.date}`, 'd');
      s.put(3, 9, m.subject, 'b');
      m.body.forEach((l, i) => s.put(3, 11 + i, l));
      s.put(3, 19, 'ESC BACK TO THE LIST', 'd');
    } else if (this.scr === 'files') {
      label = 'FILE LIBRARY > ';
      s.put(3, 8, `FILE LIBRARY  ${FILE_COUNT} FILES`, 'b');
      FILES.forEach((f, i) => s.put(3, 10 + i, `${f.name.padEnd(14)}${f.size.padStart(4)}   ${f.desc}`));
      s.put(3, 18, '...', 'd');
      s.put(3, 19, 'D DOWNLOADS THE NEWS FILE FROM THE MAIN MENU.   ESC MAIN MENU', 'd');
    } else if (this.scr === 'chat') {
      label = 'CHAT > ';
      input = this.chatInput;
      s.put(3, 8, 'CHAT WITH SYSOP', 'b');
      this.chat.slice(-9).forEach((l, i) => s.put(3, 10 + i, l.text.slice(0, 74), l.style));
    } else if (this.scr === 'dl') {
      label = 'XMODEM > ';
      const total = Math.ceil(DOWNLOAD.content.length / BLOCK);
      const pct = this.dlState === 'done' ? 100 : Math.min(99, Math.floor((this.dlMs / DL_MS) * 100));
      const blk = Math.min(total, Math.ceil((pct / 100) * total));
      s.put(3, 8, 'DOWNLOAD (XMODEM)', 'b');
      s.put(3, 10, `FILE ${DOWNLOAD.name}   ${DOWNLOAD.content.length} BYTES   ${total} BLOCKS`);
      s.put(3, 12, `BLOCK ${String(blk).padStart(2)} OF ${total}`, 'd');
      s.putRight(77, 12, `${pct}%`, 'b');
      s.bar(3, 14, 74, pct);
      if (this.dlMsg) drawMsg(s, 17, this.dlMsg, 3);
      if (this.dlState === 'run') s.put(3, 19, 'ESC CANCELS THE TRANSFER', 'd');
    }
    s.put(2, PROMPT_Y, label + input);
    s.setCursor(2 + label.length + input.length, PROMPT_Y, 'under');
  }

  private userName = 'GUEST';
}
