// .BAT files: one command per line, ECHO, IF, FOR, GOTO, %0 to %9.
// When run from the console, each line is traced in dim (board [10]).
// AUTOEXEC.BAT at login and AT tasks run silently.

import type { OS } from '../os';
import type { Tty } from '../tty';
import { execLine } from './exec';
import type { BatchFrame, IO } from './types';

const MAX_STEPS = 2000;

export function substituteParams(line: string, params: string[]): string {
  return line.replace(/(?<!%)%([0-9])/g, (_, d: string) => params[Number(d)] ?? '');
}

export function runBatch(os: OS, tty: Tty, path: string, args: string[], io: IO, opts: { depth?: number; silent?: boolean } = {}): void {
  const text = os.vfs.read(path, tty.session.cwd);
  const lines = text.split('\n');
  const frame: BatchFrame = { path, params: [path, ...args], echo: true, silent: !!opts.silent };
  const labels = new Map<string, number>();
  lines.forEach((l, i) => {
    const m = /^\s*:(\S+)/.exec(l);
    if (m) labels.set(m[1].toUpperCase(), i + 1);
  });
  let pc = 0;
  let steps = 0;
  while (pc < lines.length) {
    if (++steps > MAX_STEPS) {
      io.error(`${path} STOPPED AFTER ${MAX_STEPS} STEPS.  CHECK IT FOR A GOTO LOOP.`);
      return;
    }
    if (os.mode !== 'running') return; // REBOOT or SHUTDOWN inside a batch
    let l = lines[pc++].trim();
    if (!l || l.startsWith(':') || /^REM(\s|$)/i.test(l)) continue;
    const quiet = l.startsWith('@');
    if (quiet) l = l.slice(1).trim();
    l = substituteParams(l.toUpperCase(), frame.params);
    if (!frame.silent && !quiet) io.print(`  ${l}`, 'd');
    const echo = /^ECHO\s+(OFF|ON)$/.exec(l);
    if (echo) {
      frame.echo = echo[1] === 'ON';
      continue;
    }
    const go = /^GOTO\s+:?(\S+)$/.exec(l);
    if (go) {
      const target = labels.get(go[1]);
      if (target === undefined) {
        io.error(`LABEL NOT FOUND: ${go[1]}.  CHECK ${path}.`);
        return;
      }
      pc = target;
      continue;
    }
    execLine(os, tty, l, io, { batch: frame, depth: opts.depth ?? 1 });
  }
}
