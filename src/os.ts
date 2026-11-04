// The machine: power states, TTYs, programs, jobs, scheduler, screensaver, crashes.
// Time only moves through tick(dt), so tests can drive it deterministically.

import type { App, AppFactory, Ctx } from './apps/types';
import { BootScreen } from './apps/boot';
import { FatalScreen } from './apps/fatal';
import { Screensaver } from './apps/screensaver';
import { SetupScreen } from './apps/setup';
import { ShutdownScreen } from './apps/shutdown';
import { MEM_SHELL_K } from './config';
import type { KeyEvent } from './input';
import { dateStr, hhmmss, now, stamp } from './kernel/clock';
import { MemoryError, OsError } from './kernel/errors';
import { addLog, EVENTS_LOG_PATH, formatLog } from './kernel/log';
import { ProcessTable } from './kernel/processes';
import { takeDue } from './kernel/scheduler';
import { baseEnv, resetSession, startSession } from './kernel/sessions';
import { loadState, saveState } from './kernel/state';
import type { Level, OSState, User } from './kernel/types';
import { Vfs } from './kernel/vfs';
import { Screen } from './render/screen';
import type { Command, IO, JobSpec } from './shell/types';
import { Tty, type AppFrame } from './tty';

export type Mode = 'off' | 'poweron' | 'boot' | 'setup' | 'running' | 'shutdown' | 'fatal';
export type Fx = 'power-on' | 'power-off' | 'off' | 'on';

export interface SysScreen {
  onKey(e: KeyEvent): void;
  render(s: Screen): void;
  onTick?(dtMs: number): void;
}

interface JobRuntime {
  pid: number;
  tty: Tty;
  spec: JobSpec;
  elapsed: number;
  io: IO;
}

export interface OSOptions {
  state?: OSState;
  /** Disable persistence (tests). */
  noSave?: boolean;
  fx?: (fx: Fx) => void;
  apps?: Record<string, AppFactory>;
  commands?: Command[];
}

const POWER_ON_MS = 720; // 420 ms tube + 300 ms settle
const POWER_OFF_MS = 300;

export class OS {
  state: OSState;
  readonly vfs: Vfs;
  readonly procs: ProcessTable;
  ttys: Tty[] = [];
  /** Index of the visible TTY (0..3). */
  active = 0;
  mode: Mode = 'off';
  /** Safe mode: TTY1 only, no AUTOEXEC, no login, no jobs or modem. */
  safe = false;
  /** Pending transition after power-off / power-on animations. */
  private timer: { ms: number; then: () => void } | null = null;
  idleMs = 0;
  saver: Screensaver | null = null;
  boot: BootScreen | null = null;
  setup: SetupScreen | null = null;
  shutdownScreen: ShutdownScreen | null = null;
  fatal: FatalScreen | null = null;
  apps: Record<string, AppFactory> = {};
  commands = new Map<string, Command>();
  commandList: Command[] = [];
  /** Modem connected (DIAL). */
  online = false;
  /** Drivers loaded by AUTOEXEC. */
  loaded = new Set<string>(['CON.DRV', 'KBD.DRV']);
  jobs = new Map<number, JobRuntime>();
  /** Message of the last refused program launch. */
  lastError: string | null = null;
  bootedAt = 0;
  private saveAcc = 0;
  private noSave: boolean;
  fx: (fx: Fx) => void;

  constructor(opts: OSOptions = {}) {
    this.state = opts.state ?? loadState();
    this.noSave = !!opts.noSave;
    this.fx = opts.fx ?? (() => {});
    this.vfs = new Vfs(() => this.state, {
      virtual: (p) => (p === EVENTS_LOG_PATH ? formatLog(this.state) : null),
    });
    this.procs = new ProcessTable(() => this.state);
    if (opts.apps) this.apps = { ...opts.apps };
    for (const c of opts.commands ?? []) this.registerCommand(c);
    this.ttys = [1, 2, 3, 4].map((n) => new Tty(this, n));
  }

  registerCommand(c: Command): void {
    this.commandList.push(c);
    this.commands.set(c.name, c);
    for (const a of c.aliases ?? []) this.commands.set(a, c);
  }

  registerApp(id: string, f: AppFactory): void {
    this.apps[id] = f;
  }

  get tty(): Tty {
    return this.ttys[this.active];
  }

  get settings() {
    return this.state.settings;
  }

  // ---------------------------------------------------------------- persistence and log

  save(): void {
    if (!this.noSave) saveState(this.state);
  }

  log(level: Level, msg: string, user = 'SYSTEM'): void {
    addLog(this.state, level, user, msg);
  }

  // ---------------------------------------------------------------- power states

  /** Page load, REBOOT, any key after SHUTDOWN or a crash. */
  powerOn(opts: { safe?: boolean } = {}): void {
    this.resetRuntime();
    this.safe = false;
    this.state.counters.boot++;
    if (this.settings.powerOnEffect) {
      this.mode = 'poweron';
      this.fx('power-on');
      this.after(POWER_ON_MS, () => this.startBoot(opts.safe));
    } else {
      this.fx('on');
      this.startBoot(opts.safe);
    }
  }

  private startBoot(safe = false): void {
    this.mode = 'boot';
    this.boot = new BootScreen(this, { safe });
  }

  /** Plays the power-off animation, then powers on again. */
  reboot(opts: { safe?: boolean } = {}): void {
    this.endAllSessions();
    this.save();
    this.mode = 'off';
    this.fx('power-off');
    this.after(POWER_OFF_MS + 200, () => this.powerOn(opts));
  }

  /** Called by the boot screen when loading is complete. */
  bootDone(safe: boolean): void {
    this.boot = null;
    this.bootedAt = now();
    this.spawnSystem();
    this.log('INFO', `BOOT COMPLETE${safe ? ' IN SAFE MODE' : ''}`);
    this.mode = 'running';
    this.active = 0;
    this.idleMs = 0;
    if (safe) this.enterSafeMode();
    this.save();
  }

  enterSetup(): void {
    this.boot = null;
    this.mode = 'setup';
    this.setup = new SetupScreen(this);
  }

  private enterSafeMode(): void {
    this.safe = true;
    const t = this.ttys[0];
    startSession(t.session, 'ADMIN');
    t.session.env = { ...baseEnv('ADMIN'), PROMPT: '$P$G' };
    t.console.reset();
    this.spawnShell(t);
    t.console.safeBanner();
  }

  /** SHUTDOWN: shows the shutdown steps, then the "safe to turn off" screen. */
  shutdown(cmdLines: string[] = []): void {
    this.mode = 'shutdown';
    this.saver = null;
    this.shutdownScreen = new ShutdownScreen(this, cmdLines);
  }

  /** Called by the shutdown screen once its steps are done. */
  shutdownDone(): void {
    this.log('INFO', 'SYSTEM HALTED BY SHUTDOWN');
    this.endAllSessions();
    this.save();
  }

  /** A program crashed: FATAL ERROR screen and a report in CRASH.LOG. */
  crash(module: string, err: unknown, tty: Tty | null = this.tty): void {
    if (this.mode === 'fatal') return;
    const frame = tty?.top();
    const info = {
      module: module.toUpperCase().slice(0, 10),
      pid: frame?.pid ?? this.procs.shellOf(tty?.n ?? 1)?.pid ?? 1,
      user: tty?.session.user ?? 'SYSTEM',
      tty: tty?.n ?? 1,
      uptimeMs: this.bootedAt ? now() - this.bootedAt : 0,
      detail: err instanceof Error ? err.message : String(err),
    };
    if (typeof console !== 'undefined') console.error('[PHOSPHOR] crash in', module, err);
    this.log('ERROR', `FATAL ERROR 0E IN MODULE ${info.module}`, info.user);
    try {
      const report = `\n${dateStr()} ${hhmmss()}  FATAL ERROR 0E: PAGE FAULT IN ${info.module}  PID ${info.pid}  USER ${info.user}  TTY${info.tty}\n  ${info.detail.toUpperCase().slice(0, 70)}`;
      const n = this.vfs.get('A:\\SYSTEM\\CRASH.LOG');
      if (n && n.content !== null) {
        n.content += report;
        n.size = n.content.length;
        n.modified = stamp();
      }
    } catch {
      /* the crash report must never crash */
    }
    this.mode = 'fatal';
    this.saver = null;
    this.fatal = new FatalScreen(this, info);
    this.save();
  }

  private after(ms: number, then: () => void): void {
    this.timer = { ms, then };
  }

  /** Clears processes, jobs and screens (power cycle). Sessions keep their history. */
  private resetRuntime(): void {
    this.state.processes = [];
    this.state.counters.pid = 1;
    this.jobs.clear();
    this.online = false;
    this.loaded = new Set(['CON.DRV', 'KBD.DRV']);
    this.saver = null;
    this.boot = this.setup = this.shutdownScreen = this.fatal = null;
    for (const s of this.state.sessions) resetSession(s);
    this.ttys = [1, 2, 3, 4].map((n) => new Tty(this, n));
    this.active = 0;
  }

  private endAllSessions(): void {
    for (const t of this.ttys) {
      while (t.stack.length) this.popApp(t);
      resetSession(t.session);
    }
    this.state.processes = [];
    this.jobs.clear();
    this.online = false;
  }

  private spawnSystem(): void {
    for (const [name, memK] of [
      ['KERNEL', 96],
      ['CLOCKD', 4],
      ['SPOOLER', 8],
      ['IDLE', 1],
    ] as const) {
      this.procs.spawn({ name, user: 'SYSTEM', tty: 0, memK, kind: 'system' });
    }
  }

  // ---------------------------------------------------------------- sessions

  spawnShell(t: Tty): void {
    if (!this.procs.shellOf(t.n)) {
      this.procs.spawn({ name: 'SHELL', cmd: `SHELL TTY${t.n}`, user: t.session.user ?? 'SYSTEM', tty: t.n, memK: MEM_SHELL_K, kind: 'shell' });
    }
  }

  /** Login accepted on a TTY: start the session, the shell process and AUTOEXEC.BAT. */
  loginOk(t: Tty, user: User, previousLogin: string | null): void {
    if (this.procs.freeK() < MEM_SHELL_K) throw new MemoryError(this.procs.freeK(), MEM_SHELL_K);
    startSession(t.session, user.name);
    t.console.reset();
    this.spawnShell(t);
    this.log('INFO', `LOGIN ON TTY${t.n}`, user.name);
    t.console.loginBanner(previousLogin);
    if (!this.safe && this.vfs.exists('A:\\AUTOEXEC.BAT')) {
      t.console.runSystemBatch('A:\\AUTOEXEC.BAT');
      this.log('INFO', 'AUTOEXEC.BAT EXECUTED', user.name);
    }
    if (!user.passwordHash && user.role !== 'guest') t.console.io.warn(`NO PASSWORD SET FOR ${user.name}.  TYPE PASSWD TO SET ONE.`);
    this.save();
  }

  logout(t: Tty): void {
    const name = t.session.user;
    while (t.stack.length) this.popApp(t);
    for (const p of [...this.state.processes].filter((q) => q.tty === t.n)) {
      this.jobs.delete(p.pid);
      this.procs.remove(p.pid);
    }
    resetSession(t.session);
    t.console.reset();
    t.resetLogin();
    if (name) this.log('INFO', `LOGOUT ON TTY${t.n}`, name);
    if (this.safe) this.reboot();
  }

  switchTty(index: number): void {
    if (this.safe || index === this.active || index < 0 || index > 3) return;
    const go = () => {
      this.active = index;
      this.idleMs = 0;
    };
    const top = this.tty.top();
    if (top?.app.onLeave) {
      const held = this.guard(top.app.id, () => top.app.onLeave!(top.ctx, go), this.tty);
      if (held) return;
    }
    go();
  }

  /** Detached TTY for AT tasks (no screen). */
  detachedTty(user: string): Tty {
    const t = new Tty(this, 0);
    startSession(t.session, user);
    t.session.env = { ...baseEnv(user), PATH: 'A:\\SYSTEM;C:\\BIN' };
    return t;
  }

  // ---------------------------------------------------------------- programs

  makeCtx(t: Tty, frame: { pid: number }): Ctx {
    const os = this;
    return {
      os,
      tty: t,
      get session() {
        return t.session;
      },
      get user() {
        return t.user as User;
      },
      vfs: this.vfs,
      get pid() {
        return frame.pid;
      },
      exit: () => this.closeApp(t, frame.pid),
      open: (appId, args = []) => this.openApp(t, appId, args) === null,
      log: (level, msg) => this.log(level, msg, t.session.user ?? 'SYSTEM'),
    } as Ctx;
  }

  /** Opens a program on a TTY. Returns null, or the error message when refused. */
  openApp(t: Tty, appId: string, args: string[] = []): string | null {
    const factory = this.apps[appId];
    if (!factory) {
      this.lastError = `PROGRAM ${appId.toUpperCase()} IS NOT INSTALLED.  TYPE HELP.`;
      return this.lastError;
    }
    const app: App = factory();
    let pid: number;
    try {
      pid = this.procs.spawn({
        name: app.id.toUpperCase(),
        cmd: [app.id.toUpperCase(), ...args].join(' '),
        user: t.session.user ?? 'SYSTEM',
        tty: t.n,
        memK: app.memK,
        kind: 'app',
        state: 'run',
      }).pid;
    } catch (e) {
      if (e instanceof OsError) {
        this.lastError = e.message;
        this.log('ERROR', `${e.message.replace(/\.$/, '')}: ${app.id.toUpperCase()}`, t.session.user ?? 'SYSTEM');
        return e.message;
      }
      throw e;
    }
    const prev = t.top();
    if (prev) {
      const pp = this.procs.get(prev.pid);
      if (pp) pp.state = 'sleep';
    }
    const frame = { app, pid } as AppFrame;
    frame.ctx = this.makeCtx(t, frame);
    t.stack.push(frame);
    t.session.screen = app.id;
    this.lastError = null;
    this.guard(app.id, () => app.onEnter(frame.ctx, args), t);
    return null;
  }

  /** Closes a program (and anything opened above it). */
  closeApp(t: Tty, pid: number): void {
    const i = t.stack.findIndex((f) => f.pid === pid);
    if (i < 0) return;
    while (t.stack.length > i) this.popApp(t);
  }

  private popApp(t: Tty): void {
    const f = t.stack.pop();
    if (!f) return;
    try {
      f.app.onExit?.(f.ctx);
    } catch {
      /* ignore errors on exit */
    }
    this.procs.remove(f.pid);
    const top = t.top();
    if (top) {
      const p = this.procs.get(top.pid);
      if (p) p.state = 'run';
    }
    t.session.screen = top ? top.app.id : 'console';
  }

  /** Runs program code; any unexpected exception becomes a FATAL ERROR. */
  guard<T>(module: string, fn: () => T, t: Tty | null = this.tty): T | undefined {
    try {
      return fn();
    } catch (e) {
      this.crash(module, e, t);
      return undefined;
    }
  }

  // ---------------------------------------------------------------- jobs

  startJob(t: Tty, spec: JobSpec, background: boolean, io: IO): number {
    const p = this.procs.spawn({ name: spec.name, cmd: spec.cmd, user: t.session.user ?? 'SYSTEM', tty: t.n, memK: spec.memK, kind: 'job', background, state: 'run' });
    p.progress = 0;
    this.jobs.set(p.pid, { pid: p.pid, tty: t, spec, elapsed: 0, io });
    this.log('INFO', `JOB ${p.jobId} STARTED: ${spec.name}`, t.session.user ?? 'SYSTEM');
    return p.pid;
  }

  /** Stops a job or a program. Returns a message for the console. */
  kill(pid: number, by: User): { ok: boolean; msg: string } {
    const p = this.procs.get(pid);
    if (!p) return { ok: false, msg: `NO PROCESS WITH PID ${pid}.  TYPE PS TO LIST THEM.` };
    if (p.name === 'KERNEL') {
      this.crash('KERNEL', new Error('KERNEL KILLED BY ' + by.name));
      return { ok: true, msg: '' };
    }
    if (p.kind === 'system') return { ok: false, msg: `${p.name} IS A SYSTEM PROCESS.  IT CANNOT BE KILLED.` };
    if (p.user !== by.name && by.role !== 'admin') return { ok: false, msg: `ACCESS DENIED: PID ${pid} BELONGS TO ${p.user}.` };
    if (p.kind === 'shell') return { ok: false, msg: `PID ${pid} IS THE SHELL OF TTY${p.tty}.  TYPE LOGOUT ON THAT CONSOLE.` };
    if (p.kind === 'job') {
      this.jobs.delete(pid);
      this.procs.remove(pid);
      const t = this.ttys[p.tty - 1];
      if (t && t.console.fgPid === pid) t.console.fgPid = null;
      this.log('WARN', `JOB ${p.jobId} KILLED BY USER`, by.name);
      return { ok: true, msg: `[${p.jobId}] TERMINATED  ${p.cmd}` };
    }
    const t = this.ttys[p.tty - 1];
    if (t) this.closeApp(t, pid);
    else this.procs.remove(pid);
    this.log('WARN', `PID ${pid} ${p.name} KILLED BY USER`, by.name);
    return { ok: true, msg: `PID ${pid} TERMINATED  ${p.name}` };
  }

  private tickJobs(dt: number): void {
    for (const j of [...this.jobs.values()]) {
      const p = this.procs.get(j.pid);
      if (!p) {
        this.jobs.delete(j.pid);
        continue;
      }
      j.elapsed += dt;
      p.progress = Math.min(100, Math.floor((j.elapsed / j.spec.totalMs) * 100));
      if (j.elapsed >= j.spec.totalMs) {
        this.jobs.delete(j.pid);
        this.procs.remove(j.pid);
        const c = j.tty.console;
        const fg = c.fgPid === j.pid;
        if (fg) c.fgPid = null;
        try {
          j.spec.done(j.io);
        } catch (e) {
          if (e instanceof OsError) j.io.error(e.message);
          else this.crash(j.spec.name, e, j.tty);
        }
        if (!fg && !j.tty.detached) c.io.info(`[${p.jobId}] DONE  ${p.cmd}`);
        this.log('INFO', `JOB ${p.jobId} DONE: ${j.spec.name}`, p.user);
      }
    }
  }

  // ---------------------------------------------------------------- scheduler

  private tickTasks(): void {
    if (this.mode !== 'running' || this.safe) return;
    for (const task of takeDue(this.state, now())) {
      this.log('INFO', `TASK ${task.id} STARTED: ${task.cmd}`, task.user);
      const t = this.detachedTty(task.user);
      t.console.runDetached(task.cmd);
    }
  }

  // ---------------------------------------------------------------- input and time

  key(e: KeyEvent): void {
    this.idleMs = 0;
    switch (this.mode) {
      case 'off':
      case 'poweron':
        break;
      case 'boot':
        this.boot?.onKey(e);
        break;
      case 'setup':
        this.setup?.onKey(e);
        break;
      case 'shutdown':
        this.shutdownScreen?.onKey(e);
        break;
      case 'fatal':
        this.fatal?.onKey(e);
        break;
      case 'running':
        this.keyRunning(e);
        break;
    }
    this.save();
  }

  private keyRunning(e: KeyEvent): void {
    if (this.saver) {
      this.saver.onKey(e);
      return;
    }
    const m = /^alt\+(?:f([1-4])|([1-4]))$/.exec(e.combo);
    if (m) {
      this.switchTty(Number(m[1] ?? m[2]) - 1);
      return;
    }
    const t = this.tty;
    if (!t.loggedIn) {
      this.guard('LOGIN', () => t.login.onKey(e), t);
      return;
    }
    const top = t.top();
    if (top) {
      this.guard(top.app.id, () => top.app.onKey(top.ctx, e), t);
      return;
    }
    if (e.combo === 'f1' && !t.console.busy) {
      const err = this.openApp(t, 'help', []);
      if (err) t.console.io.error(err);
      return;
    }
    this.guard('SHELL', () => t.console.onKey(e), t);
  }

  tick(dt: number): void {
    if (this.timer) {
      this.timer.ms -= dt;
      if (this.timer.ms <= 0) {
        const then = this.timer.then;
        this.timer = null;
        then();
      }
    }
    switch (this.mode) {
      case 'boot':
        this.boot?.onTick(dt);
        return;
      case 'setup':
        return;
      case 'shutdown':
        this.shutdownScreen?.onTick(dt);
        return;
      case 'running':
        break;
      default:
        return;
    }
    this.procs.updateCpu(dt, this.tty.n);
    this.tickJobs(dt);
    this.tickTasks();
    for (const t of this.ttys) {
      if (!t.loggedIn) t.login.onTick(dt);
      for (const f of [...t.stack]) if (f.app.onTick) this.guard(f.app.id, () => f.app.onTick!(f.ctx, dt), t);
    }
    if (this.saver) this.saver.onTick(dt);
    else {
      this.idleMs += dt;
      const limit = this.settings.screensaverMin * 60_000;
      if (limit > 0 && this.idleMs >= limit) this.saver = new Screensaver(this);
    }
    this.saveAcc += dt;
    if (this.saveAcc >= 2000) {
      this.saveAcc = 0;
      this.save();
    }
  }

  wake(): void {
    this.saver = null;
    this.idleMs = 0;
  }

  // ---------------------------------------------------------------- rendering

  render(s: Screen): void {
    s.clear();
    switch (this.mode) {
      case 'off':
        s.mode = 'off';
        return;
      case 'poweron':
        s.put(1, 0, 'PHOSPHOR SYSTEMS BIOS V2.1', 'b');
        return;
      case 'boot':
        this.boot?.render(s);
        return;
      case 'setup':
        this.setup?.render(s);
        return;
      case 'shutdown':
        this.shutdownScreen?.render(s);
        return;
      case 'fatal':
        this.fatal?.render(s);
        return;
      case 'running':
        break;
    }
    if (this.saver) {
      this.saver.render(s);
      return;
    }
    const t = this.tty;
    if (!t.loggedIn) {
      t.login.render(s);
      return;
    }
    const top = t.top();
    if (top) {
      this.guard(top.app.id, () => top.app.render(s, top.ctx), t);
      if (this.mode !== 'running') this.render(s);
      return;
    }
    t.console.render(s);
  }
}
