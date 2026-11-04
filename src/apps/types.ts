// Common interface of every full-screen program (brief §3).

import type { KeyEvent } from '../input';
import type { Level, SessionData, User } from '../kernel/types';
import type { Vfs } from '../kernel/vfs';
import type { OS } from '../os';
import type { Screen } from '../render/screen';
import type { Tty } from '../tty';

export interface Ctx {
  os: OS;
  tty: Tty;
  session: SessionData;
  user: User;
  vfs: Vfs;
  /** PID of this program. */
  pid: number;
  /** Closes this program and goes back one level (usually the console). */
  exit(): void;
  /** Opens another program on top of this one (F3 VIEW from FILES). Returns false when refused (memory). */
  open(appId: string, args?: string[]): boolean;
  /** Writes to EVENTS.LOG as the current user. */
  log(level: Level, msg: string): void;
}

export interface App {
  id: string;
  /** Memory reserved at launch, in K. */
  memK: number;
  onEnter(ctx: Ctx, args: string[]): void;
  /** ESC = back to the console (call ctx.exit()). */
  onKey(ctx: Ctx, e: KeyEvent): void;
  render(screen: Screen, ctx: Ctx): void;
  onExit?(ctx: Ctx): void;
  /** Called about every 100 ms while the program is open (even on a hidden TTY). */
  onTick?(ctx: Ctx, dtMs: number): void;
  /**
   * Called before the user switches TTY. Return true to hold the switch
   * (for example to ask SAVE CHANGES?) and call proceed() later.
   */
  onLeave?(ctx: Ctx, proceed: () => void): boolean;
}

export type AppFactory = () => App;
