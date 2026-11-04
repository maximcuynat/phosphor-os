// [05] Login: USER and PASSWORD, 3 tries then a 60 s lock with a live countdown.

import type { KeyEvent } from '../input';
import { dateStr, hhmm, now, stampDate, stampTime } from '../kernel/clock';
import { OsError } from '../kernel/errors';
import { attemptLogin, findUser, lockSecondsLeft } from '../kernel/users';
import type { OS } from '../os';
import { COLS, type Screen } from '../render/screen';
import type { Tty } from '../tty';
import { borderTitle, drawMsg, field, type Msg } from './ui';

export class LoginScreen {
  user = '';
  password = '';
  focus: 'user' | 'password' = 'user';
  msg: Msg | null = null;

  constructor(
    private os: OS,
    private tty: Tty,
  ) {}

  private lockedLeft(): number {
    const u = findUser(this.os.state, this.user);
    return u ? lockSecondsLeft(u, now()) : 0;
  }

  onKey(e: KeyEvent): void {
    const c = e.combo;
    if (c === 'f8') {
      this.os.reboot({ safe: true });
      return;
    }
    if (c === 'f10') {
      this.os.shutdown([]);
      return;
    }
    if (c === 'tab' || c === 'arrowdown' || c === 'arrowup') {
      this.focus = this.focus === 'user' ? 'password' : 'user';
      return;
    }
    if (this.lockedLeft() > 0 && this.focus === 'password') return; // input disabled while locked
    if (c === 'enter') {
      if (this.focus === 'user') {
        const u = findUser(this.os.state, this.user);
        if (u && (u.role === 'guest' || !u.passwordHash)) this.submit();
        else this.focus = 'password';
        return;
      }
      this.submit();
      return;
    }
    if (c === 'escape') {
      if (this.focus === 'user') this.user = '';
      else this.password = '';
      return;
    }
    if (c === 'backspace') {
      if (this.focus === 'user') this.user = this.user.slice(0, -1);
      else this.password = this.password.slice(0, -1);
      return;
    }
    if (e.ch && e.ch !== ' ') {
      if (this.focus === 'user' && this.user.length < 8) this.user += e.ch;
      else if (this.focus === 'password' && this.password.length < 16) this.password += e.ch;
    }
  }

  private submit(): void {
    const r = attemptLogin(this.os.state, this.user, this.password, now(), this.tty.n);
    this.password = '';
    if (!r.ok) {
      this.msg = { text: r.message, level: r.locked ? 'ERROR' : 'WARN' };
      this.os.log(r.locked ? 'ERROR' : 'WARN', r.locked ? `ACCOUNT ${this.user} LOCKED` : `LOGIN FAILED ON TTY${this.tty.n}`, this.user || 'SYSTEM');
      this.focus = findUser(this.os.state, this.user) ? 'password' : 'user';
      return;
    }
    try {
      this.os.loginOk(this.tty, r.user, r.previousLogin);
      this.msg = null;
    } catch (e) {
      if (e instanceof OsError) this.msg = { text: e.message, level: 'ERROR' };
      else throw e;
    }
  }

  onTick(_dt: number): void {
    if (this.msg?.text.startsWith('ACCOUNT LOCKED')) {
      const left = this.lockedLeft();
      this.msg = left > 0 ? { text: `ACCOUNT LOCKED.  TRY AGAIN IN ${left} S.`, level: 'ERROR' } : null;
    }
  }

  render(s: Screen): void {
    s.put(0, 0, `PHOSPHOR OS 1.0   TTY${this.tty.n}`, 'd');
    s.putRight(COLS, 0, `${dateStr()}  ${hhmm()}`, 'd');

    const w = 46;
    const x = Math.floor((COLS - w) / 2);
    const y = 6;
    const h = 10;
    s.box(x, y, w, h, 'n', { glow: true });
    borderTitle(s, x, y, w, 'LOGIN');
    const lx = x + 4;
    const fx = x + 15;
    const fw = w - 19;
    s.put(lx, y + 2, 'USER', 'd');
    field(s, fx, y + 2, fw, this.user, this.focus === 'user');
    s.put(lx, y + 4, 'PASSWORD', 'd');
    const locked = this.lockedLeft() > 0;
    field(s, fx, y + 4, fw, '*'.repeat(this.password.length), this.focus === 'password' && !locked);
    drawMsg(s, y + 6, this.msg, lx);
    const u = findUser(this.os.state, this.user);
    if (u?.lastLogin) s.put(lx, y + 7, `LAST LOGIN  ${stampDate(u.lastLogin)} ${stampTime(u.lastLogin)}  ON TTY${u.lastTty ?? 1}`, 'd');

    let ax = Math.floor((COLS - 54) / 2);
    ax = s.put(ax, y + h + 2, 'ACCOUNTS:', 'd') + 3;
    for (const acc of this.os.state.users) {
      const label = acc.role === 'guest' ? `${acc.name} (NO PASSWORD)` : acc.name;
      ax = s.put(ax, y + h + 2, label, acc.name === this.user ? 'b' : 'd') + 3;
    }
    const next = (this.tty.n % 4) + 1;
    s.keyBar(24, [
      ['TAB', 'NEXT FIELD'],
      ['ENTER', 'LOGIN'],
      ['F8', 'SAFE MODE'],
      ['F10', 'SHUTDOWN'],
      [`ALT+F${next}`, `TTY${next}`],
    ]);
  }
}
