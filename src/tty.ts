// A virtual console: its session, its console (shell), its stack of open programs, its login screen.

import type { App, Ctx } from './apps/types';
import { LoginScreen } from './apps/login';
import type { SessionData, User } from './kernel/types';
import { newSession } from './kernel/sessions';
import type { OS } from './os';
import { Console } from './shell/console';

export interface AppFrame {
  app: App;
  pid: number;
  ctx: Ctx;
}

export class Tty {
  readonly console: Console;
  readonly stack: AppFrame[] = [];
  login: LoginScreen;
  /** Session of a detached TTY (n = 0, used by AT tasks). */
  private local: SessionData | null = null;

  constructor(
    readonly os: OS,
    readonly n: number,
  ) {
    if (n === 0) this.local = newSession(0);
    this.console = new Console(os, this);
    this.login = new LoginScreen(os, this);
  }

  get session(): SessionData {
    return this.local ?? this.os.state.sessions[this.n - 1];
  }

  get user(): User | undefined {
    const name = this.session.user;
    return name ? this.os.state.users.find((u) => u.name === name) : undefined;
  }

  get loggedIn(): boolean {
    return !!this.session.user;
  }

  get detached(): boolean {
    return this.n === 0;
  }

  top(): AppFrame | undefined {
    return this.stack[this.stack.length - 1];
  }

  resetLogin(): void {
    this.login = new LoginScreen(this.os, this);
  }
}
