// Runs one command line: variables, aliases, pipes, redirections, &, .BAT files, permissions.

import { MemoryError, OsError } from '../kernel/errors';
import { NotReadyError, basename, join } from '../kernel/vfs';
import type { OS } from '../os';
import type { Seg } from '../render/screen';
import type { Tty } from '../tty';
import { runBatch } from './batch';
import { expandAliases, expandVars, parse, type SimpleCmd } from './parser';
import type { BatchFrame, CmdCtx, IO, Line } from './types';

export interface ExecOpts {
  batch?: BatchFrame | null;
  depth?: number;
  /** Line typed at the console (questions allowed). */
  interactive?: boolean;
}

const MAX_DEPTH = 16;

/** IO that collects stdout for a pipe or a redirection; errors still reach the console. */
export class CaptureIO implements IO {
  lines: Line[] = [];
  captured = true;
  constructor(
    private base: IO,
    public stdin: string | null,
  ) {}
  print(text = '', style?: Seg['style']): void {
    for (const l of text.split('\n')) this.lines.push([{ text: l, style }]);
  }
  line(segs: Seg[]): void {
    this.lines.push(segs);
  }
  error(msg: string): void {
    this.base.error(msg);
  }
  warn(msg: string): void {
    this.base.warn(msg);
  }
  info(msg: string): void {
    this.print(msg, 'd');
  }
  text(): string {
    return this.lines.map((l) => l.map((s) => s.text).join('')).join('\n');
  }
}

/** Same sink as base but with a given stdin. */
function withStdin(base: IO, stdin: string | null): IO {
  return {
    print: (t, s) => base.print(t, s),
    line: (s) => base.line(s),
    error: (m) => base.error(m),
    warn: (m) => base.warn(m),
    info: (m) => base.info(m),
    stdin,
    captured: base.captured,
  };
}

/** Finds a .BAT file for a command name: current folder, then PATH. */
export function findBatch(os: OS, tty: Tty, name: string): string | null {
  const file = name.toUpperCase().endsWith('.BAT') ? name.toUpperCase() : `${name.toUpperCase()}.BAT`;
  if (name.includes('\\') || name.includes(':')) {
    const abs = os.vfs.abs(file, tty.session.cwd);
    return os.vfs.exists(abs) ? abs : null;
  }
  const dirs = [tty.session.cwd, ...(tty.session.env.PATH ?? '').split(';').filter(Boolean)];
  for (const d of dirs) {
    try {
      const p = join(os.vfs.abs(d, tty.session.cwd), file);
      if (os.vfs.get(p)?.type === 'file') return p;
    } catch {
      /* drive not ready or bad path in PATH: skip */
    }
  }
  return null;
}

export function execLine(os: OS, tty: Tty, raw: string, io: IO, opts: ExecOpts = {}): void {
  const depth = opts.depth ?? 0;
  if (depth > MAX_DEPTH) {
    io.error('TOO MANY NESTED COMMANDS.  CHECK YOUR .BAT FILES FOR LOOPS.');
    return;
  }
  let line = raw.trim();
  if (!line || line.startsWith(':') || /^REM(\s|$)/i.test(line)) return;
  line = line.toUpperCase();
  const s = tty.session;

  // Drive change: "B:"
  const dm = /^([A-Za-z]):$/.exec(line);
  if (dm) {
    const d = dm[1].toUpperCase();
    if (!'ABC'.includes(d)) {
      io.error(`INVALID DRIVE ${d}:.  DRIVES ARE A:, B: AND C:.`);
      return;
    }
    guarded(os, tty, io, line, opts, () => {
      os.vfs.ensureReady(d as 'A' | 'B' | 'C');
      s.cwd = `${d}:\\`;
    });
    return;
  }

  line = expandVars(line, s.env);
  line = expandAliases(line, s.aliases);
  let pipeline;
  try {
    pipeline = parse(line);
  } catch (e) {
    if (e instanceof OsError) io.error(e.message);
    else throw e;
    return;
  }
  if (!pipeline.cmds.length) return;
  if (pipeline.background && os.safe) {
    io.error('JOBS ARE DISABLED IN SAFE MODE.  TYPE REBOOT TO RESTART NORMALLY.');
    return;
  }

  let stdin: string | null = null;
  pipeline.cmds.forEach((cmd, i) => {
    const last = i === pipeline.cmds.length - 1;
    const capture = !last || !!cmd.redirect;
    const cio = capture ? new CaptureIO(io, stdin) : withStdin(io, stdin);
    runOne(os, tty, cmd, cio, line, { ...opts, depth }, last && pipeline.background, raw);
    if (capture) {
      const text = (cio as CaptureIO).text();
      if (cmd.redirect) {
        guarded(os, tty, io, raw, opts, () => {
          const n = (cio as CaptureIO).lines.length;
          const content = text + (text ? '\n' : '');
          os.vfs.write(cmd.redirect!.path, content, tty.user!, { append: cmd.redirect!.append }, s.cwd);
          io.info(`OUTPUT ${cmd.redirect!.append ? 'APPENDED' : 'WRITTEN'} TO ${basename(os.vfs.abs(cmd.redirect!.path, s.cwd))} (${n} LINE${n === 1 ? '' : 'S'})`);
        });
        stdin = '';
      } else stdin = text;
    }
  });
}

/** Runs fs code and turns errors into console messages (NOT READY asks ABORT, RETRY, FAIL). */
function guarded(os: OS, tty: Tty, io: IO, raw: string, opts: ExecOpts, fn: () => void, module = 'SHELL'): void {
  try {
    fn();
  } catch (e) {
    report(os, tty, io, raw, opts, e, module);
  }
}

function report(os: OS, tty: Tty, io: IO, raw: string, opts: ExecOpts, e: unknown, module: string): void {
  if (e instanceof NotReadyError) {
    if (opts.interactive && !opts.batch && !tty.detached) {
      os.log('ERROR', e.message.replace(/\s+ABORT.*$/, ''), tty.session.user ?? 'SYSTEM');
      tty.console.ask({
        prompt: e.message,
        style: 'i',
        keys: ['A', 'R', 'F'],
        onAnswer: (k) => {
          if (k === 'R') tty.console.execute(raw, { interactive: true });
          else if (k === 'F') tty.console.io.info(`FAIL ON DRIVE ${e.drive}:.  INSERT A DISK, THEN RETRY.`);
        },
      });
    } else io.error(`NOT READY READING DRIVE ${e.drive}:  COMMAND FAILED.`);
    return;
  }
  if (e instanceof MemoryError) {
    io.error(e.message);
    if (!tty.detached) tty.console.io.line([{ text: 'CLOSE A PROGRAM OR TYPE MEM FOR DETAILS.', style: 'b' }]);
    return;
  }
  if (e instanceof OsError) {
    if (e.level === 'WARN') io.warn(e.message);
    else io.error(e.message);
    return;
  }
  os.crash(module, e, tty.detached ? null : tty);
}

function runOne(os: OS, tty: Tty, sc: SimpleCmd, io: IO, line: string, opts: ExecOpts, background: boolean, raw: string): void {
  const user = tty.user!;
  const cmd = os.commands.get(sc.name);
  if (!cmd) {
    // .BAT in the current folder or PATH
    const bat = (() => {
      try {
        return findBatch(os, tty, sc.name);
      } catch {
        return null;
      }
    })();
    if (bat) {
      guarded(os, tty, io, raw, opts, () => runBatch(os, tty, bat, sc.args, io, { depth: (opts.depth ?? 0) + 1, silent: !!opts.batch?.silent }), 'BATCH');
      return;
    }
    const inst = os.state.installed.find((p) => p.command === sc.name);
    if (inst) {
      io.info(`${inst.name} ${inst.version} IS INSTALLED IN ${inst.path}.  GAMES DO NOT RUN IN THIS RELEASE.`);
      return;
    }
    io.error('BAD COMMAND OR FILE NAME.  TYPE HELP.');
    return;
  }
  if ((cmd.admin && user.role !== 'admin') || (cmd.noGuest && user.role === 'guest')) {
    io.warn(`ADMIN ONLY: ${cmd.name}.  YOU ARE ${user.name}.`);
    return;
  }
  if (cmd.noSafe && os.safe) {
    io.error(`${cmd.name} IS NOT AVAILABLE IN SAFE MODE.  TYPE REBOOT TO RESTART NORMALLY.`);
    return;
  }
  if (cmd.minArgs && sc.args.filter((a) => !a.startsWith('/')).length < cmd.minArgs) {
    io.error(`REQUIRED PARAMETER MISSING.  USAGE: ${cmd.usage}`);
    return;
  }
  const c: CmdCtx = {
    os,
    tty,
    get session() {
      return tty.session;
    },
    get user() {
      return tty.user!;
    },
    vfs: os.vfs,
    io,
    name: sc.name,
    args: sc.args.map((a, i) => (sc.quoted[i] ? a : a.toUpperCase())),
    quoted: sc.quoted,
    rest: sc.rest,
    line,
    background,
    batch: opts.batch ?? null,
    get cwd() {
      return tty.session.cwd;
    },
    abs: (p) => os.vfs.abs(p, tty.session.cwd),
    launch: (appId, args = []) => {
      if (tty.detached) return;
      tty.console.pendingLaunch = { appId, args };
    },
    job: (spec) => {
      const bg = background || tty.detached || !!opts.batch || io.captured;
      const pid = os.startJob(tty, spec, bg, tty.detached ? io : tty.console.io);
      const p = os.procs.get(pid)!;
      if (bg) {
        if (!tty.detached) io.info(`[${p.jobId}] ${`PID ${pid}`.padEnd(8)}${spec.cmd.padEnd(24)}RUNNING IN BACKGROUND`);
      } else tty.console.fgPid = pid;
    },
    ask: (q) => {
      if (!opts.interactive || opts.batch || io.captured || tty.detached) return false;
      tty.console.ask(q);
      return true;
    },
    run: (l) => execLine(os, tty, l, io, { ...opts, depth: (opts.depth ?? 0) + 1 }),
    log: (level, msg) => os.log(level, msg, tty.session.user ?? 'SYSTEM'),
  };
  guarded(os, tty, io, raw, opts, () => cmd.run(c), cmd.name);
}
