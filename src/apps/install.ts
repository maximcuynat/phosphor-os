// [21] INSTALL: reads a .PKG manifest and installs it in four steps.

import { OsError } from '../kernel/errors';
import type { FsNode } from '../kernel/types';
import { basename, dirname, isValidName, makeFile } from '../kernel/vfs';
import type { KeyEvent } from '../input';
import type { Screen } from '../render/screen';
import { drawMsg, num, type Msg } from './ui';
import type { App, Ctx } from './types';

interface Pkg {
  name: string;
  version: string;
  command: string;
  dest: string;
  ram: number;
  requires: string;
  files: Array<{ name: string; bytes: number }>;
}

type Phase = 'bad' | 'already' | 'ready' | 'running' | 'done' | 'failed';

const STEPS = ['CHECK SPACE', 'CHECK MEMORY', 'COPY FILES', 'REGISTER COMMAND'];
const DUR = [500, 500, 2000, 500];

/** Parses the manifest, or returns null when it is not a valid package. */
export function parsePkg(text: string): Pkg | null {
  const p: Partial<Pkg> = { files: [], requires: 'NONE' };
  const word = /^[A-Z0-9_-]{1,8}$/;
  for (const raw of text.split('\n')) {
    const line = raw.trim().toUpperCase();
    if (!line) continue;
    const [key, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ');
    switch (key) {
      case 'PKG':
        if (rest.length !== 2 || !word.test(rest[0]) || !/^[0-9][0-9.]*$/.test(rest[1])) return null;
        p.name = rest[0];
        p.version = rest[1];
        break;
      case 'COMMAND':
        if (!word.test(arg)) return null;
        p.command = arg;
        break;
      case 'DEST':
        if (!/^[A-C]:\\[^\s]+$/.test(arg)) return null;
        p.dest = arg.replace(/\\+$/, '');
        break;
      case 'RAM':
        if (!/^\d+$/.test(arg)) return null;
        p.ram = Number(arg);
        break;
      case 'REQUIRES':
        if (arg) p.requires = arg;
        break;
      case 'FILE':
        if (rest.length !== 2 || !isValidName(rest[0]) || !/^\d+$/.test(rest[1])) return null;
        p.files!.push({ name: rest[0], bytes: Number(rest[1]) });
        break;
      default:
        return null;
    }
  }
  if (!p.name || !p.version || !p.command || !p.dest || p.ram === undefined || !p.files!.length) return null;
  return p as Pkg;
}

export class InstallApp implements App {
  id = 'install';
  memK = 24;
  private path = '';
  private pkg: Pkg | null = null;
  private phase: Phase = 'bad';
  private step = 1;
  private stepMs = 0;
  private failedStep = 0;
  private placed = 0;
  private createdDirTop: string | null = null;
  private createdFiles: string[] = [];
  private msg: Msg | null = null;

  onEnter(ctx: Ctx, args: string[]): void {
    this.path = (args[0] ?? '').toUpperCase();
    const bad = `${basename(this.path) || 'FILE'} IS NOT A VALID PACKAGE.  ASK ITS AUTHOR FOR A NEW COPY.`;
    try {
      this.pkg = parsePkg(ctx.vfs.read(this.path));
    } catch (e) {
      this.fail(ctx, e instanceof OsError ? e.message : bad);
      this.phase = 'bad';
      return;
    }
    if (!this.pkg) {
      this.fail(ctx, bad);
      this.phase = 'bad';
      return;
    }
    const pkg = this.pkg;
    if (ctx.os.state.installed.some((i) => i.name === pkg.name)) {
      this.phase = 'already';
      this.msg = { text: `${pkg.name} ${pkg.version} IS ALREADY INSTALLED.  TYPE UNINSTALL ${pkg.name} FIRST.`, level: 'INFO' };
      return;
    }
    this.phase = 'ready';
    this.msg = { text: 'PRESS ENTER TO INSTALL, ESC TO CANCEL.', level: 'INFO' };
  }

  private fail(ctx: Ctx, text: string): void {
    this.msg = { text, level: 'ERROR' };
    this.phase = 'failed';
    ctx.log('ERROR', text.replace(/\.\s.*$/, ''));
  }

  private get total(): number {
    return this.pkg!.files.reduce((s, f) => s + f.bytes, 0);
  }

  private pct(): number {
    if (this.step < 3) return 0;
    if (this.step > 3 || this.phase === 'done') return 100;
    return Math.min(100, Math.floor((this.stepMs / DUR[2]) * 100));
  }

  onKey(ctx: Ctx, e: KeyEvent): void {
    if (e.combo === 'f1') {
      ctx.open('help', ['INSTALL']);
      return;
    }
    if (this.phase === 'ready') {
      if (e.combo === 'enter') {
        this.phase = 'running';
        this.step = 1;
        this.stepMs = 0;
        this.msg = null;
      } else if (e.combo === 'escape') ctx.exit();
      return;
    }
    if (this.phase === 'running') {
      if (e.combo === 'escape') {
        this.rollback(ctx);
        ctx.log('WARN', `${this.pkg!.name} INSTALL CANCELLED`);
        ctx.tty.console.io.info('INSTALL CANCELLED.  NOTHING WAS CHANGED.');
        ctx.exit();
      }
      return;
    }
    if (e.combo === 'enter' || e.combo === 'escape') ctx.exit();
  }

  onTick(ctx: Ctx, dt: number): void {
    if (this.phase !== 'running') return;
    this.stepMs += dt;
    try {
      if (this.step === 3) this.placeFiles(ctx);
      while (this.phase === 'running' && this.stepMs >= DUR[this.step - 1]) {
        this.stepMs -= DUR[this.step - 1];
        this.finishStep(ctx);
      }
    } catch (e) {
      this.rollback(ctx);
      this.failedStep = this.step;
      this.fail(ctx, e instanceof OsError ? e.message : 'INSTALL FAILED.  TRY AGAIN.');
    }
  }

  private finishStep(ctx: Ctx): void {
    const pkg = this.pkg!;
    if (this.step === 1) {
      const drive = pkg.dest[0] as 'A' | 'B' | 'C';
      ctx.vfs.ensureReady(drive);
      const free = ctx.vfs.free(drive);
      if (this.total > free) throw new OsError(`DISK FULL: ${num(free)} BYTES FREE ON ${drive}:.  COPY CANCELLED.`);
    } else if (this.step === 2) {
      const free = ctx.os.procs.freeK();
      if (pkg.ram > free) throw new OsError(`NOT ENOUGH MEMORY: ${free}K FREE, ${pkg.ram}K NEEDED.`);
      this.makeDest(ctx);
    } else if (this.step === 3) {
      this.placeFiles(ctx, true);
    } else {
      ctx.os.state.installed.push({ name: pkg.name, version: pkg.version, command: pkg.command, path: pkg.dest, memK: pkg.ram });
      ctx.log('INFO', `${pkg.name}.PKG INSTALLED`);
      ctx.os.save();
      this.phase = 'done';
      this.msg = { text: `${pkg.name} ${pkg.version} INSTALLED.  TYPE ${pkg.command} TO START IT.`, level: 'INFO' };
      return;
    }
    this.step++;
  }

  /** Creates the DEST folders, remembering the first one made. */
  private makeDest(ctx: Ctx): void {
    const parts = this.pkg!.dest.split('\\');
    let cur = parts[0] + '\\';
    for (const part of parts.slice(1)) {
      cur = cur.endsWith('\\') ? cur + part : cur + '\\' + part;
      if (!ctx.vfs.exists(cur)) {
        ctx.vfs.mkdir(cur, ctx.user);
        if (!this.createdDirTop) this.createdDirTop = cur;
      }
    }
  }

  private placeFiles(ctx: Ctx, all = false): void {
    const pkg = this.pkg!;
    const dir = ctx.vfs.dir(pkg.dest);
    const doneBytes = all ? this.total : (this.pct() / 100) * this.total;
    let cum = 0;
    pkg.files.forEach((f, i) => {
      cum += f.bytes;
      if (i < this.placed || cum > doneBytes) return;
      const kids = dir.children!;
      const at = kids.findIndex((k) => k.name + (k.ext ? '.' + k.ext : '') === f.name);
      const node: FsNode = makeFile(f.name, null, { size: f.bytes, owner: ctx.user.name });
      if (at >= 0) kids[at] = node;
      else {
        kids.push(node);
        this.createdFiles.push(pkg.dest + '\\' + f.name);
      }
      this.placed = i + 1;
    });
  }

  /** Removes what was copied (files, then the folders made for it). */
  private rollback(ctx: Ctx): void {
    const remove = (path: string) => {
      const parent = ctx.vfs.get(dirname(path));
      const name = basename(path);
      if (parent?.children) parent.children = parent.children.filter((k) => k.name + (k.ext ? '.' + k.ext : '') !== name);
      // parent.children is replaced on the node object itself, which the drive tree holds
    };
    if (this.createdDirTop) remove(this.createdDirTop);
    else for (const f of this.createdFiles) remove(f);
    this.createdFiles = [];
    this.createdDirTop = null;
    this.placed = 0;
  }

  private stepState(i: number): 'OK' | 'RUNNING' | 'WAITING' | 'FAILED' {
    if (this.phase === 'failed' || this.phase === 'bad') return this.failedStep === i + 1 ? 'FAILED' : i + 1 < this.failedStep ? 'OK' : 'WAITING';
    if (this.phase === 'done') return 'OK';
    if (this.phase === 'ready' || this.phase === 'already') return 'WAITING';
    return i + 1 < this.step ? 'OK' : i + 1 === this.step ? 'RUNNING' : 'WAITING';
  }

  render(s: Screen): void {
    const pkg = this.pkg;
    const stepNo = this.phase === 'done' ? 4 : this.phase === 'failed' && this.failedStep ? this.failedStep : this.step;
    s.titleBar(0, `INSTALL  ${this.path}`, `STEP ${stepNo} OF 4`);

    if (!pkg) {
      drawMsg(s, 23, this.msg);
      s.keyBar(24, [['ESC', 'EXIT'], ['F1', 'HELP']]);
      return;
    }

    // package
    s.box(0, 2, 40, 9, 'b');
    s.put(2, 3, 'PACKAGE', 'd');
    const rows: Array<[string, string, 'n' | 'b']> = [
      ['NAME', pkg.name, 'b'],
      ['VERSION', pkg.version, 'n'],
      ['SIZE', `${Math.round(this.total / 1024)}K ON DISK  ${pkg.ram}K RAM`, 'n'],
      ['ADDS COMMAND', pkg.command, 'n'],
      ['DESTINATION', pkg.dest, 'n'],
      ['REQUIRES', pkg.requires, 'n'],
    ];
    rows.forEach(([k, v, st], i) => {
      s.put(2, 4 + i, k, 'd');
      s.put(15, 4 + i, v.slice(0, 24), st);
    });

    // steps
    s.box(40, 2, 40, 9, 'd');
    s.put(42, 3, 'STEPS', 'd');
    STEPS.forEach((label, i) => {
      const st = this.stepState(i);
      s.put(42, 4 + i, `${i + 1}. ${label}`, st === 'OK' ? 'b' : st === 'WAITING' ? 'd' : st === 'FAILED' ? 'i' : 'n');
      const tag = `[ ${st} ]`;
      s.put(77 - tag.length, 4 + i, tag, st === 'OK' ? 'b' : st === 'WAITING' ? 'd' : st === 'FAILED' ? 'i' : 'n');
    });

    // copy
    s.box(0, 11, 80, 12, 'b', { glow: true });
    const pct = this.pct();
    s.put(2, 12, 'COPYING FILES');
    s.putRight(78, 12, `${pct}%`, 'b');
    s.bar(2, 14, 76, pct);
    pkg.files.slice(0, 6).forEach((f, i) => {
      const done = this.step > 3 || this.phase === 'done' || i < this.placed;
      const cur = this.phase === 'running' && this.step === 3 && !done && i === this.placed;
      const state = done ? 'OK' : cur ? 'COPYING...' : 'WAITING';
      s.put(4, 16 + i, f.name.padEnd(14) + num(f.bytes).padStart(8) + '  ' + state, done ? 'n' : cur ? 'b' : 'd');
    });
    if (pkg.files.length > 6) s.put(4, 22, `... ${pkg.files.length - 6} MORE`, 'd');

    drawMsg(s, 23, this.msg);
    s.keyBar(24, [['ESC', 'CANCEL'], ['ENTER', 'CONTINUE'], ['F1', 'HELP']]);
  }
}
